"""Reserva, "Mis reservas", cancelación y reprogramación (VET-09, VET-11, VET-12)."""
import asyncio
from datetime import timedelta

import pytest

from tests.conftest import doctor_id_of, future_slot

pytestmark = pytest.mark.integration

TUTOR, TUTOR2 = "tutor@vetconnect.cl", "tutor2@vetconnect.cl"
RECEP, VET = "recepcion@vetconnect.cl", "vet@vetconnect.cl"


def iso(start):
    return {"start_time": start.isoformat(), "end_time": (start + timedelta(minutes=30)).isoformat()}


async def test_simultaneous_reservations_only_one_wins(client, login):
    """RF-02 / CA-01 en proceso: 5 reservas simultáneas del mismo bloque -> 1x201 y 4x409."""
    start, _ = future_slot(days_ahead=12, hour=11)
    payload = {"doctor_id": await doctor_id_of(VET), **iso(start)}
    headers = await login(TUTOR)

    codes = [r.status_code for r in await asyncio.gather(
        *(client.post("/api/v1/appointments/reserve", json=payload, headers=headers) for _ in range(5))
    )]

    assert sorted(codes) == [201, 409, 409, 409, 409]


async def test_my_appointments_include_doctor_data(client, login, make_appointment):
    appt = await make_appointment()
    await make_appointment(tutor_email=TUTOR2, start=future_slot(hour=12)[0])

    r = await client.get("/api/v1/appointments/my", headers=await login(TUTOR))

    assert r.status_code == 200
    assert [a["id"] for a in r.json()] == [appt]  # no ve las citas de otro tutor
    row = r.json()[0]
    assert row["doctor_name"] == "Dr. Matías Fuentes"
    assert row["box_number"] == 1 and row["specialty"]


async def test_cancel_frees_the_slot(client, login, make_appointment):
    start, _ = future_slot(days_ahead=9, hour=15)
    appt = await make_appointment(start=start)
    params = {"doctor_id": await doctor_id_of(VET), "date": start.date().isoformat()}
    slot_times = lambda r: [s["start_time"] for s in r.json()]  # noqa: E731

    before = await client.get("/api/v1/appointments/available-slots", params=params)
    assert start.isoformat() not in slot_times(before)

    r = await client.patch(f"/api/v1/appointments/{appt}/cancel", headers=await login(TUTOR))
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"

    after = await client.get("/api/v1/appointments/available-slots", params=params)
    assert start.isoformat() in slot_times(after)


async def test_tutor_cannot_cancel_foreign_or_completed(client, login, make_appointment):
    foreign = await make_appointment(tutor_email=TUTOR2)
    done = await make_appointment(status="COMPLETED", start=future_slot(hour=13)[0])
    headers = await login(TUTOR)

    assert (await client.patch(f"/api/v1/appointments/{foreign}/cancel", headers=headers)).status_code == 403
    assert (await client.patch(f"/api/v1/appointments/{done}/cancel", headers=headers)).status_code == 400


async def test_reschedule_moves_appointment_and_notifies(client, login, make_appointment):
    import notifications

    appt = await make_appointment()
    new_start, _ = future_slot(days_ahead=11, hour=16)

    r = await client.patch(f"/api/v1/appointments/{appt}/reschedule", json=iso(new_start),
                           headers=await login(TUTOR))

    assert r.status_code == 200, r.text
    assert r.json()["start_time"] == new_start.isoformat()
    assert any(e["metadata"].get("to") == TUTOR for e in notifications.SENT_NOTIFICATIONS)


async def test_reschedule_to_taken_slot_returns_409_and_keeps_original(client, login, make_appointment):
    original_start, _ = future_slot(days_ahead=10, hour=9)
    taken_start, _ = future_slot(days_ahead=10, hour=10)
    appt = await make_appointment(start=original_start)
    await make_appointment(tutor_email=TUTOR2, start=taken_start)
    headers = await login(TUTOR)

    r = await client.patch(f"/api/v1/appointments/{appt}/reschedule", json=iso(taken_start), headers=headers)
    assert r.status_code == 409

    mine = (await client.get("/api/v1/appointments/my", headers=headers)).json()
    assert mine[0]["start_time"] == original_start.isoformat()


async def test_reschedule_rejects_cancelled_and_invalid_ranges(client, login, make_appointment):
    cancelled = await make_appointment(status="CANCELLED")
    active = await make_appointment(start=future_slot(hour=14)[0])
    headers = await login(TUTOR)
    bad_hour = future_slot(days_ahead=11, hour=19)[0]

    assert (await client.patch(f"/api/v1/appointments/{cancelled}/reschedule",
                               json=iso(future_slot(days_ahead=11)[0]), headers=headers)).status_code == 400
    assert (await client.patch(f"/api/v1/appointments/{active}/reschedule",
                               json=iso(bad_hour), headers=headers)).status_code == 400


async def test_reception_confirms_arrival(client, login, make_appointment):
    appt = await make_appointment()
    r = await client.patch(f"/api/v1/appointments/{appt}/status", json={"status": "ARRIVED"},
                           headers=await login(RECEP))
    assert r.status_code == 200 and r.json()["status"] == "ARRIVED"

    bad = await client.patch(f"/api/v1/appointments/{appt}/status", json={"status": "PERDIDA"},
                             headers=await login(RECEP))
    assert bad.status_code == 422
