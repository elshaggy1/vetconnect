"""Gestión de médicos (VET-07) con control de acceso por rol (RNF-02)."""
import pytest

pytestmark = pytest.mark.integration

ADMIN, TUTOR, VET = "admin@vetconnect.cl", "tutor@vetconnect.cl", "vet@vetconnect.cl"

NEW_DOCTOR = {
    "full_name": "Dra. Nueva Prueba",
    "specialty": "Dermatología",
    "email": "nueva.vet@vetconnect.cl",
    "password": "Clave123!",
    "box_number": 7,
    "phone": "+56 9 7777 7777",
}


async def test_list_doctors_is_public_and_includes_contact(client):
    r = await client.get("/api/v1/doctors")
    assert r.status_code == 200
    first = r.json()[0]
    assert {"id", "full_name", "email", "specialty", "box_number", "is_active", "phone"} <= first.keys()


@pytest.mark.parametrize("who", [None, TUTOR, VET])
async def test_create_doctor_requires_admin(client, login, who):
    headers = await login(who) if who else {}
    r = await client.post("/api/v1/doctors", json=NEW_DOCTOR, headers=headers)
    assert r.status_code == (401 if who is None else 403)


async def test_admin_creates_doctor_who_can_log_in(client, login):
    r = await client.post("/api/v1/doctors", json=NEW_DOCTOR, headers=await login(ADMIN))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["box_number"] == 7 and body["is_active"] is True and body["phone"] == NEW_DOCTOR["phone"]

    login_r = await client.post(
        "/api/v1/auth/login", json={"email": NEW_DOCTOR["email"], "password": NEW_DOCTOR["password"]}
    )
    assert login_r.status_code == 200
    assert login_r.json()["role"] == "VETERINARIO"


async def test_cannot_create_doctor_in_occupied_box(client, login):
    r = await client.post(
        "/api/v1/doctors",
        json={**NEW_DOCTOR, "email": "otra@vetconnect.cl", "box_number": 1},
        headers=await login(ADMIN),
    )
    assert r.status_code == 400
    assert "box" in r.json()["detail"]


async def test_admin_updates_doctor_and_box_rule_applies(client, login):
    headers = await login(ADMIN)
    doctors = (await client.get("/api/v1/doctors")).json()
    second = next(d for d in doctors if d["box_number"] == 2)

    taken = await client.put(f"/api/v1/doctors/{second['id']}", json={"box_number": 1}, headers=headers)
    assert taken.status_code == 400

    ok = await client.put(
        f"/api/v1/doctors/{second['id']}", json={"specialty": "Cirugía mayor", "phone": "+56 9 1234"},
        headers=headers,
    )
    assert ok.status_code == 200
    assert ok.json()["specialty"] == "Cirugía mayor"
    assert ok.json()["phone"] == "+56 9 1234"
    # restaurar para no afectar otras pruebas
    await client.put(f"/api/v1/doctors/{second['id']}", json={"specialty": "Cirugía"}, headers=headers)


async def test_update_doctor_requires_admin(client, login):
    doctor_id = (await client.get("/api/v1/doctors")).json()[0]["id"]
    r = await client.put(f"/api/v1/doctors/{doctor_id}", json={"is_active": False}, headers=await login(TUTOR))
    assert r.status_code == 403
