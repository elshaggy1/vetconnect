"""Ficha clínica (VET-xx): creación, actualización, permisos y efecto sobre la cita."""
import pytest

from tests.conftest import VALID_RECORD

pytestmark = pytest.mark.integration

VET, VET2 = "vet@vetconnect.cl", "vet2@vetconnect.cl"
TUTOR, TUTOR2 = "tutor@vetconnect.cl", "tutor2@vetconnect.cl"
ADMIN, RECEP = "admin@vetconnect.cl", "recepcion@vetconnect.cl"


async def save_record(client, headers, appointment_id, **overrides):
    return await client.put(
        f"/api/v1/medical-records/{appointment_id}",
        json={**VALID_RECORD, **overrides},
        headers=headers,
    )


# ---------- creación y lectura ----------

async def test_vet_creates_record_and_appointment_becomes_completed(
    client, login, make_appointment
):
    appt = await make_appointment(status="CONFIRMED")

    r = await save_record(client, await login(VET), appt)

    assert r.status_code == 200
    body = r.json()
    assert body["appointment_id"] == appt
    assert body["pet_name"] == "Firulais"
    assert body["weight_kg"] == 15.5
    assert body["prescription"].startswith("Enrofloxacina")

    agenda = await client.get(
        "/api/v1/appointments/agenda", headers=await login(RECEP)
    )
    row = next(a for a in agenda.json() if a["id"] == appt)
    assert row["status"] == "COMPLETED"
    assert row["has_medical_record"] is True


async def test_arrived_appointment_also_becomes_completed(client, login, make_appointment):
    appt = await make_appointment(status="ARRIVED")
    await save_record(client, await login(VET), appt)

    agenda = (await client.get("/api/v1/appointments/agenda", headers=await login(ADMIN))).json()
    assert next(a for a in agenda if a["id"] == appt)["status"] == "COMPLETED"


async def test_saving_record_does_not_reactivate_cancelled_appointment(
    client, login, make_appointment
):
    """Una cita cancelada conserva su estado aunque se guarde la ficha."""
    appt = await make_appointment(status="CANCELLED")
    await save_record(client, await login(ADMIN), appt)

    agenda = (await client.get("/api/v1/appointments/agenda", headers=await login(ADMIN))).json()
    assert next(a for a in agenda if a["id"] == appt)["status"] == "CANCELLED"


async def test_second_save_updates_same_record(client, login, make_appointment):
    appt = await make_appointment()
    headers = await login(VET)
    first = (await save_record(client, headers, appt)).json()

    second = await save_record(
        client, headers, appt, diagnosis="Infección controlada", weight_kg=16.0
    )

    assert second.status_code == 200
    assert second.json()["id"] == first["id"]  # upsert: no crea una ficha nueva
    assert second.json()["diagnosis"] == "Infección controlada"
    assert second.json()["weight_kg"] == 16.0
    assert second.json()["updated_at"] >= first["updated_at"]


async def test_get_record_404_before_and_200_after_saving(client, login, make_appointment):
    appt = await make_appointment()
    vet = await login(VET)

    before = await client.get(f"/api/v1/medical-records/{appt}", headers=vet)
    assert before.status_code == 404

    await save_record(client, vet, appt)
    after = await client.get(f"/api/v1/medical-records/{appt}", headers=vet)
    assert after.status_code == 200
    assert after.json()["diagnosis"] == VALID_RECORD["diagnosis"]


async def test_tutor_can_read_record_of_own_appointment(client, login, make_appointment):
    appt = await make_appointment(tutor_email=TUTOR)
    await save_record(client, await login(VET), appt)

    r = await client.get(f"/api/v1/medical-records/{appt}", headers=await login(TUTOR))
    assert r.status_code == 200


# ---------- permisos ----------

async def test_requires_authentication(client, make_appointment):
    appt = await make_appointment()
    assert (await client.get(f"/api/v1/medical-records/{appt}")).status_code == 401
    assert (await client.put(f"/api/v1/medical-records/{appt}", json=VALID_RECORD)).status_code == 401


@pytest.mark.parametrize("email", [TUTOR, RECEP])
async def test_only_vet_or_admin_can_write(client, login, make_appointment, email):
    appt = await make_appointment()
    r = await save_record(client, await login(email), appt)
    assert r.status_code == 403


async def test_vet_cannot_edit_record_of_another_doctor(client, login, make_appointment):
    appt = await make_appointment(doctor_email=VET)  # cita del Dr. Fuentes
    r = await save_record(client, await login(VET2), appt)  # intenta la Dra. Soto
    assert r.status_code == 403
    assert "otro médico" in r.json()["detail"]


async def test_admin_can_edit_any_record(client, login, make_appointment):
    appt = await make_appointment(doctor_email=VET2)
    r = await save_record(client, await login(ADMIN), appt)
    assert r.status_code == 200


async def test_tutor_cannot_read_record_of_another_tutor(client, login, make_appointment):
    appt = await make_appointment(tutor_email=TUTOR)
    await save_record(client, await login(VET), appt)

    r = await client.get(f"/api/v1/medical-records/{appt}", headers=await login(TUTOR2))
    assert r.status_code == 403


# ---------- validación y errores ----------

async def test_save_on_unknown_appointment_returns_404(client, login):
    r = await save_record(client, await login(ADMIN), 999_999)
    assert r.status_code == 404


@pytest.mark.parametrize(
    "bad_payload",
    [
        {"pet_name": None},                # campo obligatorio nulo
        {"weight_kg": "pesado"},           # tipo incorrecto
        {"diagnosis": None},
        {"prescription": None},
    ],
)
async def test_invalid_payload_returns_422(client, login, make_appointment, bad_payload):
    appt = await make_appointment()
    r = await save_record(client, await login(VET), appt, **bad_payload)
    assert r.status_code == 422


async def test_missing_required_field_returns_422(client, login, make_appointment):
    appt = await make_appointment()
    incomplete = {k: v for k, v in VALID_RECORD.items() if k != "treatment"}
    r = await client.put(
        f"/api/v1/medical-records/{appt}", json=incomplete, headers=await login(VET)
    )
    assert r.status_code == 422


async def test_species_defaults_to_canino(client, login, make_appointment):
    appt = await make_appointment()
    payload = {k: v for k, v in VALID_RECORD.items() if k != "species"}
    r = await client.put(
        f"/api/v1/medical-records/{appt}", json=payload, headers=await login(VET)
    )
    assert r.status_code == 200
    assert r.json()["species"] == "Canino"
