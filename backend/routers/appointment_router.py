"""Agendamiento: horarios libres (VET-08), reserva sin choques (VET-09), cancelación y
reprogramación (VET-11), agenda de recepción (VET-12) y bandeja de notificaciones (VET-15)."""
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

import notifications
from auth import require_role
from database import get_db
from models import Appointment, Doctor, MedicalRecord, User
from schemas import (
    CLINIC_TZ,
    AppointmentDetailOut,
    AppointmentOut,
    MyAppointmentOut,
    ReserveRequest,
    RescheduleRequest,
    SlotOut,
    StatusUpdateRequest,
    TimeRange,
)

router = APIRouter(prefix="/api/v1/appointments", tags=["appointments"])

DAY_START = time(9, 0)
DAY_END = time(18, 0)
SLOT = timedelta(minutes=30)
ACTIVE_STATUSES = ("CONFIRMED", "ARRIVED")
STAFF_ROLES = ("RECEPCIONISTA", "VETERINARIO", "ADMIN")
CONFLICT_MSG = "El bloque horario seleccionado ya fue reservado por otro usuario."
EXCLUSION_VIOLATION = "23P01"  # SQLSTATE de PostgreSQL para la restricción EXCLUDE


def _now_local() -> datetime:
    return datetime.now(CLINIC_TZ).replace(tzinfo=None)


def _validate_range(data: TimeRange) -> None:
    """Reglas de forma comunes a reservar y reprogramar (HTTP 400)."""
    if data.end_time <= data.start_time:
        raise HTTPException(400, "La hora de término debe ser posterior a la de inicio.")
    if (data.end_time - data.start_time) % SLOT != timedelta(0) or data.start_time.minute not in (0, 30):
        raise HTTPException(400, "Las reservas deben ser en bloques de 30 minutos.")
    if (
        data.start_time.date() != data.end_time.date()
        or data.start_time.time() < DAY_START
        or data.end_time.time() > DAY_END
    ):
        raise HTTPException(400, "El horario de atención es de 09:00 a 18:00.")
    if data.start_time <= _now_local():
        raise HTTPException(400, "No se pueden reservar horas en el pasado.")


def _is_overlap_violation(exc: IntegrityError) -> bool:
    sqlstate = getattr(exc.orig, "sqlstate", None) or getattr(exc.orig, "pgcode", None)
    return sqlstate == EXCLUSION_VIOLATION or "no_overlapping_confirmed_appointments" in str(exc)


def _notification_payload(appointment: Appointment, doctor: Doctor, tutor: User) -> dict:
    return {
        "id": appointment.id,
        "doctor_name": doctor.user.full_name,
        "doctor_box": doctor.box_number,
        "start_time": appointment.start_time,
        "end_time": appointment.end_time,
        "status": appointment.status,
        "tutor_name": tutor.full_name,
        "tutor_email": tutor.email,
    }


async def _get_owned_appointment(db: AsyncSession, appointment_id: int, user: User) -> Appointment:
    """Busca la cita y verifica que un TUTOR solo opere sobre las suyas."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")
    if user.role == "TUTOR" and appointment.tutor_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes modificar esta cita.")
    return appointment


@router.get("/available-slots", response_model=list[SlotOut])
async def available_slots(
    doctor_id: int = Query(...),
    date_: date = Query(..., alias="date", description="YYYY-MM-DD"),
    db: AsyncSession = Depends(get_db),
):
    """Bloques de 30 min (09:00-18:00) que NO se solapan con citas activas (RF-01)."""
    day_start = datetime.combine(date_, DAY_START)
    day_end = datetime.combine(date_, DAY_END)
    booked = (
        await db.execute(
            select(Appointment.start_time, Appointment.end_time).where(
                Appointment.doctor_id == doctor_id,
                Appointment.status.in_(ACTIVE_STATUSES),
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
    """Inserta directamente y deja que PostgreSQL (EXCLUDE GiST) rechace el choque (RF-02)."""
    _validate_range(data)
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
    except IntegrityError as exc:
        await db.rollback()
        if _is_overlap_violation(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)
        raise HTTPException(400, "No se pudo registrar la reserva.")

    await db.refresh(appointment)
    payload = _notification_payload(appointment, doctor, tutor)
    background_tasks.add_task(notifications.send_confirmation_email, tutor.email, tutor.full_name, payload)
    background_tasks.add_task(notifications.schedule_24h_reminder, payload)
    return appointment


@router.get("/my", response_model=list[MyAppointmentOut])
async def my_appointments(
    db: AsyncSession = Depends(get_db),
    tutor: User = Depends(require_role("TUTOR")),
):
    """Citas del tutor autenticado con nombre de médico y box, más recientes primero."""
    rows = (
        await db.execute(
            select(Appointment, Doctor)
            .join(Doctor, Appointment.doctor_id == Doctor.id)
            .where(Appointment.tutor_id == tutor.id)
            .order_by(Appointment.start_time.desc())
        )
    ).unique().all()
    return [
        MyAppointmentOut(
            **AppointmentOut.model_validate(appt).model_dump(),
            doctor_name=doctor.user.full_name,
            specialty=doctor.specialty,
            box_number=doctor.box_number,
        )
        for appt, doctor in rows
    ]


@router.patch("/{appointment_id}/cancel", response_model=AppointmentOut)
async def cancel_appointment(
    appointment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("TUTOR", "RECEPCIONISTA", "ADMIN")),
):
    """Cancela la cita y libera el bloque (la regla EXCLUDE ignora las CANCELLED) (RF-04)."""
    appointment = await _get_owned_appointment(db, appointment_id, user)
    if appointment.status == "COMPLETED":
        raise HTTPException(400, "No se puede cancelar una cita ya atendida.")
    appointment.status = "CANCELLED"
    await db.commit()
    await db.refresh(appointment)
    return appointment


@router.patch("/{appointment_id}/reschedule", response_model=AppointmentOut)
async def reschedule_appointment(
    appointment_id: int,
    data: RescheduleRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role("TUTOR", "RECEPCIONISTA")),
):
    """Mueve la cita a otro bloque del mismo médico; si choca responde 409 y no cambia nada."""
    appointment = await _get_owned_appointment(db, appointment_id, user)
    if appointment.status not in ACTIVE_STATUSES:
        raise HTTPException(400, "Solo se pueden reprogramar citas confirmadas.")
    _validate_range(data)

    appointment.start_time = data.start_time
    appointment.end_time = data.end_time
    appointment.status = "CONFIRMED"
    try:
        # La misma restricción GiST de la reserva garantiza que el nuevo bloque esté libre.
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if _is_overlap_violation(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)
        raise HTTPException(400, "No se pudo reprogramar la cita.")

    await db.refresh(appointment)
    doctor = await db.get(Doctor, appointment.doctor_id)
    tutor = await db.get(User, appointment.tutor_id)
    payload = _notification_payload(appointment, doctor, tutor)
    background_tasks.add_task(notifications.send_confirmation_email, tutor.email, tutor.full_name, payload)
    background_tasks.add_task(notifications.schedule_24h_reminder, payload)
    return appointment


@router.get("/agenda", response_model=list[AppointmentDetailOut])
async def get_agenda(
    date: date | None = None,
    doctor_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(*STAFF_ROLES)),
):
    """Agenda filtrada por fecha y/o médico. Un VETERINARIO sin filtro ve solo la suya."""
    has_record = exists().where(MedicalRecord.appointment_id == Appointment.id)
    query = (
        select(Appointment, Doctor, User, has_record.label("has_record"))
        .join(Doctor, Appointment.doctor_id == Doctor.id)
        .join(User, Appointment.tutor_id == User.id)
    )
    if user.role == "VETERINARIO" and doctor_id is None:
        own = (await db.execute(select(Doctor.id).where(Doctor.user_id == user.id))).scalar_one_or_none()
        if own is not None:
            query = query.where(Appointment.doctor_id == own)
    if date:
        query = query.where(
            Appointment.start_time >= datetime.combine(date, DAY_START),
            Appointment.end_time <= datetime.combine(date, DAY_END),
        )
    if doctor_id:
        query = query.where(Appointment.doctor_id == doctor_id)

    rows = (await db.execute(query.order_by(Appointment.start_time))).unique().all()
    return [
        AppointmentDetailOut(
            **AppointmentOut.model_validate(appt).model_dump(),
            doctor_name=doctor.user.full_name,
            box_number=doctor.box_number,
            tutor_name=tutor.full_name,
            tutor_email=tutor.email,
            has_medical_record=bool(record),
        )
        for appt, doctor, tutor, record in rows
    ]


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
async def update_appointment_status(
    appointment_id: int,
    data: StatusUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role(*STAFF_ROLES)),
):
    """Confirma llegada (ARRIVED), marca atendida (COMPLETED) o cancela desde recepción (RF-04)."""
    appointment = await db.get(Appointment, appointment_id)
    if appointment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cita no encontrada.")
    appointment.status = data.status
    try:
        await db.commit()
    except IntegrityError as exc:
        # Reactivar una cita cancelada cuyo bloque ya fue tomado por otra persona.
        await db.rollback()
        if _is_overlap_violation(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, CONFLICT_MSG)
        raise
    await db.refresh(appointment)
    return appointment


@router.get("/notifications", response_model=list[dict])
async def get_notifications(
    user: User = Depends(require_role("TUTOR", *STAFF_ROLES)),
):
    """Bandeja de notificaciones (VET-15). El personal ve todas; un tutor solo las suyas (RNF-02)."""
    events = list(reversed(notifications.SENT_NOTIFICATIONS))
    if user.role == "TUTOR":
        events = [
            e for e in events
            if user.email in (e["metadata"].get("to"), e["metadata"].get("tutor_email"))
        ]
    return events
