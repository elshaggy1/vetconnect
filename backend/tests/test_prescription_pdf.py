"""Generación del PDF de la receta (fpdf2): contenido, cabeceras, permisos y casos borde."""
import io

import pytest
from pypdf import PdfReader

from routers.medical_record_router import _latin1
from tests.conftest import VALID_RECORD

VET, TUTOR = "vet@vetconnect.cl", "tutor@vetconnect.cl"
ADMIN, RECEP = "admin@vetconnect.cl", "recepcion@vetconnect.cl"


def pdf_text(content: bytes) -> str:
    reader = PdfReader(io.BytesIO(content))
    return "\n".join(page.extract_text() for page in reader.pages)


async def issue_pdf(client, login, make_appointment, as_user=VET, **record_overrides):
    """Crea cita + ficha y devuelve (appointment_id, respuesta del endpoint /pdf)."""
    appt = await make_appointment()
    saved = await client.put(
        f"/api/v1/medical-records/{appt}",
        json={**VALID_RECORD, **record_overrides},
        headers=await login(VET),
    )
    assert saved.status_code == 200, saved.text
    resp = await client.get(f"/api/v1/medical-records/{appt}/pdf", headers=await login(as_user))
    return appt, resp


# ---------- unitarias (sin BD) ----------

def test_latin1_helper_handles_empty_and_unsupported_characters():
    assert _latin1(None) == "-"
    assert _latin1("") == "-"
    assert _latin1("Año, diagnóstico y niño") == "Año, diagnóstico y niño"  # tildes y ñ se conservan
    assert _latin1("Rex 🐶") == "Rex ?"      # emoji no soportado por fuentes estándar -> "?"
    assert _latin1("Dosis 5€") == "Dosis 5?"


# ---------- integración ----------

@pytest.mark.integration
async def test_pdf_is_valid_and_has_download_headers(client, login, make_appointment):
    appt, r = await issue_pdf(client, login, make_appointment)

    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"] == f'inline; filename="receta_cita_{appt}.pdf"'
    assert r.content.startswith(b"%PDF-")
    assert r.content.rstrip().endswith(b"%%EOF")
    assert len(PdfReader(io.BytesIO(r.content)).pages) >= 1


@pytest.mark.integration
async def test_pdf_contains_patient_doctor_tutor_and_prescription(client, login, make_appointment):
    appt, r = await issue_pdf(client, login, make_appointment)
    text = pdf_text(r.content)

    assert f"Receta #{appt:06d}" in text
    assert "CLINICA VETERINARIA SAN FRANCISCO" in text.upper().replace("Í", "I")
    assert "Firulais" in text and "Canino" in text and "15.5 kg" in text
    assert "Fuentes" in text and "Medicina general" in text and "Box 1" in text
    assert "Camila Rojas" in text and "tutor@vetconnect.cl" in text
    assert "Enrofloxacina" in text and "Rabia, Parvovirus, Distemper" in text
    assert "30 d" in text  # "válida por 30 días"


@pytest.mark.integration
async def test_pdf_reflects_latest_record_version(client, login, make_appointment):
    appt, _ = await issue_pdf(client, login, make_appointment)
    await client.put(
        f"/api/v1/medical-records/{appt}",
        json={**VALID_RECORD, "pet_name": "Rocky", "prescription": "Meloxicam 0.1 mg/kg"},
        headers=await login(VET),
    )

    text = pdf_text((await client.get(f"/api/v1/medical-records/{appt}/pdf", headers=await login(VET))).content)

    assert "Rocky" in text and "Meloxicam" in text
    assert "Firulais" not in text and "Enrofloxacina" not in text


@pytest.mark.integration
@pytest.mark.parametrize("email", [VET, TUTOR, ADMIN, RECEP])
async def test_every_allowed_role_can_download(client, login, make_appointment, email):
    _, r = await issue_pdf(client, login, make_appointment, as_user=email)
    assert r.status_code == 200


@pytest.mark.integration
async def test_pdf_requires_authentication(client, login, make_appointment):
    appt, _ = await issue_pdf(client, login, make_appointment)
    assert (await client.get(f"/api/v1/medical-records/{appt}/pdf")).status_code == 401


@pytest.mark.integration
async def test_pdf_404_when_record_not_saved_yet(client, login, make_appointment):
    appt = await make_appointment()
    r = await client.get(f"/api/v1/medical-records/{appt}/pdf", headers=await login(VET))
    assert r.status_code == 404
    assert "guardar la ficha" in r.json()["detail"]


@pytest.mark.integration
async def test_pdf_404_for_unknown_appointment(client, login):
    r = await client.get("/api/v1/medical-records/999999/pdf", headers=await login(VET))
    assert r.status_code == 404


@pytest.mark.integration
async def test_pdf_survives_characters_outside_latin1(client, login, make_appointment):
    """Emoji/símbolos no soportados no deben provocar un 500: se degradan a '?'."""
    _, r = await issue_pdf(
        client, login, make_appointment,
        pet_name="Rex 🐶", prescription="Dosis 5€ cada 8 h — 漢字",
    )
    assert r.status_code == 200
    assert "Rex ?" in pdf_text(r.content)


@pytest.mark.integration
async def test_pdf_with_very_long_text_still_generates(client, login, make_appointment):
    long_text = "Reposo relativo y control de herida. " * 27  # ~1000 caracteres (límite del modelo)
    _, r = await issue_pdf(
        client, login, make_appointment,
        antecedents=long_text, diagnosis=long_text, treatment=long_text, prescription=long_text,
    )
    assert r.status_code == 200
    assert "Reposo relativo" in pdf_text(r.content)
