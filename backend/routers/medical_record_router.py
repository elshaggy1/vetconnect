from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_role
from database import get_db
from models import Appointment, Doctor, MedicalRecord, User
from schemas import MedicalRecordOut, MedicalRecordUpsert

router = APIRouter(prefix="/api/v1/medical-records", tags=["medical-records"])


def _latin1(val: str | None) -> str:
    """Asegura compatibilidad de caracteres con las fuentes estándar de FPDF."""
    if not val:
        return "-"
    return str(val).encode("latin-1", errors="replace").decode("latin-1")


@router.get("/{appointment_id}", response_model=MedicalRecordOut)
async def get_medical_record(
    appointment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("VETERINARIO", "ADMIN", "TUTOR", "RECEPCIONISTA")),
):
    """Obtiene la ficha clínica de una cita específica."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Cita no encontrada."
        )

    # Validación de seguridad: un TUTOR solo puede ver fichas de sus propias citas
    if user.role == "TUTOR" and appointment.tutor_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No tienes permiso para acceder a esta ficha médica.",
        )

    medical_record = (
        await db.execute(
            select(MedicalRecord).where(MedicalRecord.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if medical_record is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Ficha clínica no encontrada para esta cita."
        )

    return medical_record


@router.put("/{appointment_id}", response_model=MedicalRecordOut)
async def upsert_medical_record(
    appointment_id: int,
    data: MedicalRecordUpsert,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("VETERINARIO", "ADMIN")),
):
    """Crea o actualiza la ficha clínica de una cita y pasa el estado a COMPLETED."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")

    doctor = (
        await db.execute(select(Doctor).where(Doctor.id == appointment.doctor_id))
    ).unique().scalar_one_or_none()

    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado.")

    if user.role == "VETERINARIO" and doctor.user_id != user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "No puedes modificar la ficha de otro médico."
        )

    medical_record = (
        await db.execute(
            select(MedicalRecord).where(MedicalRecord.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    payload = data.model_dump()
    if medical_record is None:
        medical_record = MedicalRecord(
            appointment_id=appointment_id,
            **payload,
            updated_at=datetime.now(),
        )
        db.add(medical_record)
    else:
        for key, value in payload.items():
            setattr(medical_record, key, value)
        medical_record.updated_at = datetime.now()

    if appointment.status in ("CONFIRMED", "ARRIVED"):
        appointment.status = "COMPLETED"

    await db.commit()
    await db.refresh(medical_record)

    return medical_record


@router.get("/{appointment_id}/pdf", status_code=200)
async def generate_prescription_pdf(
    appointment_id: int,
    user: User = Depends(require_role("VETERINARIO", "TUTOR", "ADMIN", "RECEPCIONISTA")),
    db: AsyncSession = Depends(get_db),
):
    """Genera el PDF de la receta médica veterinaria con fpdf2."""
    medical_record = (
        await db.execute(
            select(MedicalRecord).where(MedicalRecord.appointment_id == appointment_id)
        )
    ).scalar_one_or_none()

    if medical_record is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Primero debes guardar la ficha clínica antes de emitir el PDF.",
        )

    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")

    doctor = (
        await db.execute(select(Doctor).where(Doctor.id == appointment.doctor_id))
    ).unique().scalar_one_or_none()
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado.")

    tutor = await db.get(User, appointment.tutor_id)
    if tutor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tutor no encontrado.")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Encabezado
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1("CLÍNICA VETERINARIA SAN FRANCISCO"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, _latin1("Talca · Receta Médica y Ficha de Atención"), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Número y Fecha
    pdf.set_font("Helvetica", "B", 10)
    fecha_str = appointment.start_time.strftime("%Y-%m-%d %H:%M")
    pdf.cell(0, 6, _latin1(f"Receta #{appointment_id:06d}  |  Fecha: {fecha_str}"), align="R", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Datos del Paciente
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1("DATOS DEL PACIENTE:"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, _latin1(f"Nombre: {medical_record.pet_name}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _latin1(f"Especie: {medical_record.species}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _latin1(f"Peso: {medical_record.weight_kg} kg"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Datos del Veterinario y Tutor
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1("VETERINARIO Y TUTOR:"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 6, _latin1(f"Médico: {doctor.user.full_name} ({doctor.specialty} Box {doctor.box_number})"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, _latin1(f"Tutor: {tutor.full_name} ({tutor.email})"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(4)

    # Bloques clínicos
    bloques = [
        ("Antecedentes:", medical_record.antecedents),
        ("Vacunas:", medical_record.vaccines),
        ("Diagnóstico:", medical_record.diagnosis),
        ("Tratamiento:", medical_record.treatment),
        ("PRESCRIPCIÓN / RECETA (Rp.):", medical_record.prescription),
    ]

    for titulo, texto in bloques:
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 7, _latin1(titulo), new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, _latin1(texto), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

    pdf.ln(8)
    pdf.set_font("Helvetica", "I", 9)
    pdf.cell(0, 5, _latin1("Esta receta es válida por 30 días desde su emisión."), align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 5, _latin1("Generado electrónicamente · VetConnect Maule · Clínica Veterinaria San Francisco"), align="C", new_x="LMARGIN", new_y="NEXT")

    pdf_bytes = bytes(pdf.output())

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="receta_cita_{appointment_id}.pdf"'
        },
    )