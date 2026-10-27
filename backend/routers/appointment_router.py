from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_role
from database import get_db
from models import Appointment, Doctor, MedicalRecord, User
from notifications import schedule_24h_reminder, send_confirmation_email
from schemas import (
    CLINIC_TZ,
    AppointmentDetailOut,
    AppointmentOut,
    ReserveRequest,
    RescheduleRequest,
    SlotOut,
    StatusUpdateRequest,
)

router = APIRouter(prefix="/api/v1/appointments", tags=["appointments"])

DAY_START = time(9, 0)
DAY_END = time(18, 0)
SLOT = timedelta(minutes=30)
CONFLICT_MSG = "El bloque horario seleccionado ya fue reservado por otro usuario."
EXCLUSION_VIOLATION = "23P01"  # SQLSTATE de PostgreSQL para EXCLUDE constraint


def _now_local() -> datetime:
    return datetime.now(CLINIC_TZ).replace(tzinfo=None)


@router.get("/available-slots", response_model=list[SlotOut])
async def available_slots(
    doctor_id: int = Query(...),
    date_: date = Query(..., alias="date", description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Bloques de 30 min (09:00-18:00) que NO se solapan con citas activas."""
    day_start = datetime.combine(date_, DAY_START)
    day_end = datetime.combine(date_, DAY_END)

    booked = (
        await db.execute(
            select(Appointment.start_time, Appointment.end_time).where(
                Appointment.doctor_id == doctor_id,
                Appointment.status.in_(["CONFIRMED", "ARRIVED"]),
                Appointment.start_time < day_end,
                Appointment.end_time > day_start,
            )
        )
    ).all()

    now = _now_local()
    slots: list[SlotOut] = []
    cursor = day_start
    while cursor + SLOT <= day_end:
        slot_end = cursor + SLOT
        overlaps = any(cursor < b_end and slot_end > b_start for b_start, b_end in booked)
        if not overlaps and cursor > now:
            slots.append(SlotOut(start_time=cursor, end_time=slot_end))
        cursor = slot_end
    return slots


@router.post("/reserve", response_model=AppointmentOut, status_code=status.HTTP_201_CREATED)
async def reserve(
    data: ReserveRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    tutor: User = Depends(require_role("TUTOR")),
):
    # --- Validaciones de forma (400) ---
    if data.end_time <= data.start_time:
        raise HTTPException(400, "La hora de término debe ser posterior a la de inicio.")
    duration = data.end_time - data.start_time
    if duration % SLOT != timedelta(0) or data.start_time.minute not in (0, 30):
        raise HTTPException(400, "Las reservas deben ser en bloques de 30 minutos.")
    if (
        data.start_time.date() != data.end_time.date()
        or data.start_time.time() < DAY_START
        or data.end_time.time() > DAY_END
    ):
        raise HTTPException(400, "El horario de atención es de 09:00 a 18:00.")
    if data.start_time <= _now_local():
        raise HTTPException(400, "No se pueden reservar horas en el pasado.")

    doctor = await db.get(Doctor, data.doctor_id)
    if doctor is None or not doctor.is_active:
        raise HTTPException(404, "El médico veterinario no existe o no está activo.")

    appointment = Appointment(
        doctor_id=data.doctor_id,
        tutor_id=tutor.id,
        status="CONFIRMED",
        start_time=data.start_time,
        end_time=data.end_time,
    )
    db.add(appointment)
    try:
        await db.commit()
        await db.refresh(appointment)

        appointment_data = {
            "id": appointment.id,
            "doctor_name": doctor.user.full_name,
            "doctor_box": doctor.box_number,
            "start_time": appointment.start_time,
            "end_time": appointment.end_time,
            "status": appointment.status,
            "tutor_name": tutor.full_name,
            "tutor_email": tutor.email,
        }
        background_tasks.add_task(send_confirmation_email, tutor.email, tutor.full_name, appointment_data)
        background_tasks.add_task(schedule_24h_reminder, appointment_data)

    except IntegrityError as exc:
        await db.rollback()
        sqlstate = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
        if sqlstate == EXCLUSION_VIOLATION or "no_overlapping_confirmed_appointments" in str(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)
        raise HTTPException(400, "No se pudo registrar la reserva.")
    return appointment


@router.get("/my", response_model=list[AppointmentOut])
async def my_appointments(
    db: AsyncSession = Depends(get_db),
    tutor: User = Depends(require_role("TUTOR")),
):
    """Lista todas las citas del tutor autenticado, ordenadas por fecha de inicio descendente."""
    rows = (
        await db.execute(
            select(Appointment)
            .where(Appointment.tutor_id == tutor.id)
            .order_by(Appointment.start_time.desc())
        )
    ).scalars().all()
    return [AppointmentOut.model_validate(a) for a in rows]


@router.patch("/{appointment_id}/cancel", response_model=AppointmentOut)
async def cancel_appointment(
    appointment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("TUTOR", "RECEPCIONISTA", "ADMIN")),
):
    """Cancela una cita (TUTOR solo puede cancelar sus propias citas)."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")

    if user.role == "TUTOR" and appointment.tutor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes cancelar esta cita.")

    appointment.status = "CANCELLED"
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/reschedule", response_model=AppointmentOut)
async def reschedule_appointment(
    appointment_id: int,
    data: RescheduleRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("TUTOR", "RECEPCIONISTA")),
):
    """Reprograma una cita (TUTOR solo puede reprogramar sus propias citas)."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")

    if user.role == "TUTOR" and appointment.tutor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes reprogramar esta cita.")

    if data.end_time <= data.start_time:
        raise HTTPException(400, "La hora de término debe ser posterior a la de inicio.")
    duration = data.end_time - data.start_time
    if duration % SLOT != timedelta(0) or data.start_time.minute not in (0, 30):
        raise HTTPException(400, "Las reservas deben ser en bloques de 30 minutos.")
    if (
        data.start_time.date() != data.end_time.date()
        or data.start_time.time() < DAY_START
        or data.end_time.time() > DAY_END
    ):
        raise HTTPException(400, "El horario de atención es de 09:00 a 18:00.")
    if data.start_time <= _now_local():
        raise HTTPException(400, "No se pueden reprogramar horas en el pasado.")

    doctor = await db.get(Doctor, appointment.doctor_id)
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Doctor no encontrado.")

    conflicting_appointments = (
        await db.execute(
            select(Appointment).where(
                Appointment.doctor_id == appointment.doctor_id,
                Appointment.status.in_(["CONFIRMED", "ARRIVED"]),
                Appointment.start_time < data.end_time,
                Appointment.end_time > data.start_time,
                Appointment.id != appointment_id,
            )
        )
    ).scalars().all()

    if conflicting_appointments:
        raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)

    appointment.start_time = data.start_time
    appointment.end_time = data.end_time
    appointment.status = "CONFIRMED"
    try:
        await db.commit()
        await db.refresh(appointment)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)
    return appointment


@router.get("/agenda", response_model=list[AppointmentDetailOut])
async def get_agenda(
    date: date | None = None,
    doctor_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("RECEPCIONISTA", "VETERINARIO", "ADMIN")),
):
    """Obtiene la agenda de citas filtrada por fecha y/o doctor (RECEPCIONISTA, VETERINARIO, ADMIN)."""
    query = (
        select(Appointment, Doctor, User)
        .join(Doctor, Appointment.doctor_id == Doctor.id)
        .join(User, Appointment.tutor_id == User.id)
    )

    if user.role == "VETERINARIO" and doctor_id is None:
        vet_doc = (
            await db.execute(select(Doctor).where(Doctor.user_id == user.id))
        ).unique().scalar_one_or_none()
        if vet_doc:
            query = query.where(Appointment.doctor_id == vet_doc.id)

    if date:
        day_start = datetime.combine(date, DAY_START)
        day_end = datetime.combine(date, DAY_END)
        query = query.where(Appointment.start_time >= day_start, Appointment.end_time <= day_end)

    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)

    result = (await db.execute(query.order_by(Appointment.start_time))).unique().all()
    appointments: list[AppointmentDetailOut] = []

    for appointment, doctor, tutor_user in result:
        medical_record = (
            await db.execute(
                select(MedicalRecord).where(MedicalRecord.appointment_id == appointment.id)
            )
        ).scalar_one_or_none()

        appointments.append(
            AppointmentDetailOut(
                id=appointment.id,
                doctor_id=appointment.doctor_id,
                doctor_name=doctor.user.full_name,
                box_number=doctor.box_number,
                tutor_id=appointment.tutor_id,
                tutor_name=tutor_user.full_name,
                tutor_email=tutor_user.email,
                status=appointment.status,
                start_time=appointment.start_time,
                end_time=appointment.end_time,
                has_medical_record=medical_record is not None,
            )
        )

    return appointments


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: int,
    data: StatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("RECEPCIONISTA", "VETERINARIO", "ADMIN")),
):
    """Actualiza el estado de una cita (solo RECEPCIONISTA, VETERINARIO, ADMIN pueden hacerlo)."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")

    if data.status not in ["CONFIRMED", "ARRIVED", "COMPLETED", "CANCELLED"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estado no válido.")

    appointment.status = data.status
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.get("/notifications", response_model=list[dict])
async def get_notifications(
    user: User = Depends(require_role("TUTOR", "RECEPCIONISTA", "VETERINARIO", "ADMIN")),
):
    """Devuelve las últimas notificaciones emitidas (para VET-15)."""
    from notifications import SENT_NOTIFICATIONS

    return SENT_NOTIFICATIONS