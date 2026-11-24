"""Panel de indicadores del director (VET-16): inasistencia y ocupación de boxes."""
from datetime import datetime, timedelta

import pytest

pytestmark = pytest.mark.integration

ADMIN, RECEP, TUTOR2 = "admin@vetconnect.cl", "recepcion@vetconnect.cl", "tutor2@vetconnect.cl"
VET = "vet@vetconnect.cl"


def last_monday_at(hour: int) -> datetime:
    today = datetime.now().replace(hour=hour, minute=0, second=0, microsecond=0)
    return today - timedelta(days=today.weekday() + 7)


async def test_dashboard_requires_admin(client, login):
    assert (await client.get("/api/v1/stats/dashboard")).status_code == 401
    assert (await client.get("/api/v1/stats/dashboard", headers=await login(RECEP))).status_code == 403


async def test_dashboard_counts_no_show_cancellations_and_occupancy(client, login, make_appointment):
    monday = last_monday_at(9)
    await make_appointment(status="COMPLETED", start=monday)
    await make_appointment(status="ARRIVED", start=monday + timedelta(hours=1))
    await make_appointment(status="CONFIRMED", start=monday + timedelta(hours=2))  # no se presentó
    await make_appointment(status="CANCELLED", start=monday + timedelta(hours=3), tutor_email=TUTOR2)

    day = monday.date().isoformat()
    r = await client.get("/api/v1/stats/dashboard", params={"date_from": day, "date_to": day},
                         headers=await login(ADMIN))

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 4
    assert body["by_status"] == {"CONFIRMED": 1, "ARRIVED": 1, "COMPLETED": 1, "CANCELLED": 1}
    assert body["attended"] == 2 and body["no_show"] == 1
    assert body["no_show_rate_pct"] == pytest.approx(33.3)
    assert body["cancellation_rate_pct"] == 25.0

    vet = next(o for o in body["occupancy"] if o["box_number"] == 1)
    assert vet["booked_slots"] == 3          # la cancelada no ocupa el box
    assert vet["available_slots"] == 18      # 09:00-18:00 en bloques de 30 min
    assert vet["occupancy_pct"] == pytest.approx(16.7)


async def test_future_confirmed_appointments_are_not_no_show(client, login, make_appointment):
    await make_appointment(status="CONFIRMED")  # dentro de 10 días
    r = await client.get("/api/v1/stats/dashboard",
                         params={"date_to": (datetime.now() + timedelta(days=30)).date().isoformat()},
                         headers=await login(ADMIN))
    assert r.json()["no_show"] == 0 and r.json()["no_show_rate_pct"] == 0.0


async def test_dashboard_rejects_inverted_range(client, login):
    r = await client.get("/api/v1/stats/dashboard",
                         params={"date_from": "2026-11-10", "date_to": "2026-11-01"},
                         headers=await login(ADMIN))
    assert r.status_code == 400
