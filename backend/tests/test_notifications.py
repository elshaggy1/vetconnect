"""Notificaciones por correo (VET-15): confirmación, recordatorio 24 h y errores SMTP."""
import asyncio
from datetime import datetime, timedelta
from smtplib import SMTPException

import pytest

import notifications
from schemas import CLINIC_TZ
from tests.conftest import future_slot

TUTOR = "tutor@vetconnect.cl"
# La fixture autouse `reminders_spy` reemplaza esta función en cada test; se guarda la original.
REAL_SEND_REMINDER = notifications._send_reminder_at_time


def appointment_data(start: datetime, **extra) -> dict:
    return {
        "id": 42,
        "doctor_name": "Dr. Matías Fuentes",
        "doctor_box": 1,
        "start_time": start,
        "end_time": start + timedelta(minutes=30),
        "status": "CONFIRMED",
        "tutor_name": "Camila Rojas",
        "tutor_email": "camila@example.com",
        **extra,
    }


@pytest.fixture
def outbox(monkeypatch):
    """Intercepta el envío: guarda (to, subject, body) en vez de usar SMTP."""
    sent: list[tuple[str, str, str]] = []

    def fake_send(to, subject, body):
        sent.append((to, subject, body))
        return True

    monkeypatch.setattr(notifications, "_send_smtp_email", fake_send)
    return sent


def events() -> list[str]:
    return [n["event_type"] for n in notifications.SENT_NOTIFICATIONS]


# ======================= unitarias (sin BD) =======================

async def test_confirmation_email_has_appointment_details(outbox):
    start = datetime(2030, 5, 14, 10, 30)

    ok = await notifications.send_confirmation_email(
        "camila@example.com", "Camila Rojas", appointment_data(start)
    )

    assert ok is True
    to, subject, body = outbox[0]
    assert to == "camila@example.com"
    assert "Confirmación" in subject
    assert "Hola Camila Rojas" in body
    assert "Dr. Matías Fuentes" in body and "Box 1" in body
    assert "2030-05-14" in body and "10:30 - 11:00" in body
    assert "CONFIRMED" in body


async def test_without_smtp_config_runs_in_demo_mode_and_logs(monkeypatch):
    monkeypatch.setattr(notifications, "SMTP_HOST", None)

    ok = await notifications.send_confirmation_email(
        "camila@example.com", "Camila", appointment_data(datetime(2030, 5, 14, 10, 0))
    )

    assert ok is True  # no es un error: simplemente no se envía
    assert events() == ["demo_mode_skipped"]
    meta = notifications.SENT_NOTIFICATIONS[0]["metadata"]
    assert meta["to"] == "camila@example.com"
    assert "Confirmación" in meta["subject"]


class FakeSMTP:
    """Doble de smtplib.SMTP que registra la conversación."""
    instances: list["FakeSMTP"] = []
    fail_on_send: Exception | None = None

    def __init__(self, host, port, timeout):
        self.host, self.port = host, port
        self.calls: list[str] = []
        self.message = None
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.calls.append("starttls")

    def login(self, user, password):
        self.calls.append(f"login:{user}")

    def send_message(self, msg):
        if FakeSMTP.fail_on_send:
            raise FakeSMTP.fail_on_send
        self.calls.append("send")
        self.message = msg


@pytest.fixture
def smtp_configured(monkeypatch):
    FakeSMTP.instances.clear()
    FakeSMTP.fail_on_send = None
    monkeypatch.setattr(notifications, "SMTP_HOST", "smtp.test")
    monkeypatch.setattr(notifications, "SMTP_PORT", 587)
    monkeypatch.setattr(notifications, "SMTP_USER", "bot")
    monkeypatch.setattr(notifications, "SMTP_PASSWORD", "secret")
    monkeypatch.setattr(notifications, "SMTP_FROM", "vet@clinica.cl")
    monkeypatch.setattr(notifications, "SMTP", FakeSMTP)
    yield FakeSMTP
    FakeSMTP.fail_on_send = None


async def test_smtp_flow_starttls_login_send(smtp_configured):
    ok = await notifications.send_confirmation_email(
        "camila@example.com", "Camila", appointment_data(datetime(2030, 5, 14, 10, 0))
    )

    assert ok is True
    smtp = smtp_configured.instances[0]
    assert (smtp.host, smtp.port) == ("smtp.test", 587)
    assert smtp.calls == ["starttls", "login:bot", "send"]  # TLS antes de autenticar
    assert smtp.message["To"] == "camila@example.com"
    assert smtp.message["From"] == "vet@clinica.cl"
    assert events() == ["smtp_sent"]


async def test_smtp_error_returns_false_and_is_logged(smtp_configured):
    smtp_configured.fail_on_send = SMTPException("550 mailbox unavailable")

    ok = await notifications.send_confirmation_email(
        "camila@example.com", "Camila", appointment_data(datetime(2030, 5, 14, 10, 0))
    )

    assert ok is False
    assert events() == ["smtp_error"]
    assert "550" in notifications.SENT_NOTIFICATIONS[0]["metadata"]["error"]


async def test_network_failure_is_handled_gracefully(smtp_configured):
    smtp_configured.fail_on_send = ConnectionRefusedError("smtp caído")

    ok = await notifications.send_confirmation_email(
        "camila@example.com", "Camila", appointment_data(datetime(2030, 5, 14, 10, 0))
    )

    assert ok is False


# ---------- recordatorio 24 h ----------

async def test_reminder_is_scheduled_24h_before_the_appointment(reminders_spy):
    start = datetime.now() + timedelta(days=5)

    ok = await notifications.schedule_24h_reminder(appointment_data(start))
    await asyncio.sleep(0)  # deja correr la tarea creada con asyncio.create_task

    assert ok is True
    reminder_time, appt = reminders_spy[0]
    assert reminder_time == start - timedelta(hours=24)
    assert appt["id"] == 42
    assert events() == ["reminder_scheduled"]
    assert notifications.SENT_NOTIFICATIONS[0]["metadata"]["tutor_email"] == "camila@example.com"


async def test_reminder_is_skipped_when_send_time_already_passed(reminders_spy):
    start = datetime.utcnow() + timedelta(hours=2)  # la cita es en 2 h: ya no hay 24 h de margen

    ok = await notifications.schedule_24h_reminder(appointment_data(start))

    assert ok is False
    assert reminders_spy == []
    assert events() == ["reminder_skipped"]


async def test_reminder_uses_clinic_timezone_not_utc(reminders_spy):
    local_now = datetime.now(CLINIC_TZ).replace(tzinfo=None)
    start = local_now + timedelta(hours=26)  # el recordatorio debería salir en ~2 h

    ok = await notifications.schedule_24h_reminder(appointment_data(start))

    assert ok is True


async def test_reminder_email_content(outbox):
    start = datetime(2030, 5, 14, 10, 30)

    # reminder_time ya pasó -> asyncio.sleep(0) y el correo sale de inmediato
    await REAL_SEND_REMINDER(datetime.utcnow() - timedelta(seconds=1), appointment_data(start))

    to, subject, body = outbox[0]
    assert to == "camila@example.com"
    assert "Recordatorio" in subject
    assert "Hola Camila Rojas" in body
    assert "2030-05-14" in body and "10:30 - 11:00" in body
    assert "Dr. Matías Fuentes" in body


# ======================= integración: /reserve dispara los correos =======================

@pytest.mark.integration
async def test_successful_booking_sends_confirmation_and_schedules_reminder(
    client, login, reminders_spy
):
    start, end = future_slot(days_ahead=10)
    doctors = (await client.get("/api/v1/doctors")).json()

    r = await client.post(
        "/api/v1/appointments/reserve",
        json={"doctor_id": doctors[0]["id"], "start_time": start.isoformat(),
              "end_time": end.isoformat()},
        headers=await login(TUTOR),
    )

    assert r.status_code == 201
    await asyncio.sleep(0)  # el recordatorio se programa con asyncio.create_task
    appt_id = r.json()["id"]
    # En modo demo (sin SMTP) queda el registro del correo de confirmación...
    demo = [n for n in notifications.SENT_NOTIFICATIONS if n["event_type"] == "demo_mode_skipped"]
    assert len(demo) == 1
    assert demo[0]["metadata"]["to"] == TUTOR
    assert "Confirmación" in demo[0]["metadata"]["subject"]
    # ...y el recordatorio quedó programado para 24 h antes de la cita.
    assert reminders_spy[0][0] == start - timedelta(hours=24)
    assert reminders_spy[0][1]["id"] == appt_id
    assert "reminder_scheduled" in events()


@pytest.mark.integration
async def test_conflicting_booking_sends_no_notifications(client, login):
    start, end = future_slot(days_ahead=11)
    doctor_id = (await client.get("/api/v1/doctors")).json()[0]["id"]
    payload = {"doctor_id": doctor_id, "start_time": start.isoformat(), "end_time": end.isoformat()}
    headers = await login(TUTOR)

    first = await client.post("/api/v1/appointments/reserve", json=payload, headers=headers)
    assert first.status_code == 201
    notifications.SENT_NOTIFICATIONS.clear()

    second = await client.post("/api/v1/appointments/reserve", json=payload, headers=headers)

    assert second.status_code == 409
    assert notifications.SENT_NOTIFICATIONS == []  # nadie recibe correo por una reserva fallida


@pytest.mark.integration
async def test_invalid_booking_sends_no_notifications(client, login):
    past = datetime.now() - timedelta(days=1)
    doctor_id = (await client.get("/api/v1/doctors")).json()[0]["id"]

    r = await client.post(
        "/api/v1/appointments/reserve",
        json={"doctor_id": doctor_id, "start_time": past.replace(minute=0).isoformat(),
              "end_time": (past.replace(minute=0) + timedelta(minutes=30)).isoformat()},
        headers=await login(TUTOR),
    )

    assert r.status_code == 400
    assert notifications.SENT_NOTIFICATIONS == []


@pytest.mark.integration
async def test_notifications_endpoint_requires_auth_and_lists_events(client, login):
    assert (await client.get("/api/v1/appointments/notifications")).status_code == 401

    notifications._log_and_store("confirmation", "demo", {"to": "x@y.cl"})
    r = await client.get("/api/v1/appointments/notifications", headers=await login(TUTOR))

    assert r.status_code == 200
    assert r.json()[0]["event_type"] == "confirmation"
