"""Panel de indicadores para el director (VET-16): inasistencia (no-show) y ocupación de boxes.

Definiciones (sobre citas cuyo inicio cae en el rango consultado):
* attended  = citas ARRIVED o COMPLETED.
* no_show   = citas que siguen CONFIRMED cuando su bloque ya terminó (el tutor nunca llegó).
* no_show_rate_pct = no_show / (attended + no_show) * 100  (solo citas ya vencidas).
* occupancy_pct = bloques de 30 min activos o atendidos / bloques hábiles del rango * 100.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import require_role
from database import get_db
from models import Appointment, Doctor, User
from routers.appointment_router import DAY_END, DAY_START, SLOT, _now_local
from schemas import DashboardStats, DoctorOccupancy

router = APIRouter(prefix="/api/v1/stats", tags=["stats"])

STATUSES = ("CONFIRMED", "ARRIVED", "COMPLETED", "CANCELLED")
MAX_RANGE_DAYS = 366
SLOTS_PER_DAY = int((datetime.combine(date.min, DAY_END) - datetime.combine(date.min, DAY_START)) / SLOT)


def _pct(part: int, total: int) -> float:
    return round(part * 100 / total, 1) if total else 0.0


def _business_days(start: date, end: date) -> int:
    return sum(1 for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() < 5)


@router.get("/dashboard", response_model=DashboardStats)
async def dashboard(
    date_from: date | None = Query(None, description="YYYY-MM-DD (por defecto hace 30 días)"),
    date_to: date | None = Query(None, description="YYYY-MM-DD (por defecto hoy)"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("ADMIN")),
):
    today = _now_local().date()
    date_to = date_to or today
    date_from = date_from or date_to - timedelta(days=30)
    if date_from > date_to:
        raise HTTPException(400, "La fecha inicial debe ser anterior o igual a la final.")
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise HTTPException(400, "El rango máximo es de un año.")

    range_start = datetime.combine(date_from, datetime.min.time())
    range_end = datetime.combine(date_to + timedelta(days=1), datetime.min.time())
    rows = (
        await db.execute(
            select(Appointment.doctor_id, Appointment.status, Appointment.start_time, Appointment.end_time)
            .where(Appointment.start_time >= range_start, Appointment.start_time < range_end)
        )
    ).all()

    now = _now_local()
    by_status = {s: 0 for s in STATUSES}
    booked_per_doctor: dict[int, int] = {}
    attended = no_show = 0
    for doctor_id, status, start, end in rows:
        by_status[status] = by_status.get(status, 0) + 1
        if status in ("ARRIVED", "COMPLETED"):
            attended += 1
        elif status == "CONFIRMED" and end <= now:
            no_show += 1
        if status != "CANCELLED":
            booked_per_doctor[doctor_id] = booked_per_doctor.get(doctor_id, 0) + int((end - start) / SLOT)

    capacity = _business_days(date_from, date_to) * SLOTS_PER_DAY
    doctors = (await db.execute(select(Doctor).order_by(Doctor.box_number))).unique().scalars().all()
    occupancy = [
        DoctorOccupancy(
            doctor_id=d.id,
            doctor_name=d.user.full_name,
            box_number=d.box_number,
            booked_slots=booked_per_doctor.get(d.id, 0),
            available_slots=capacity,
            occupancy_pct=_pct(booked_per_doctor.get(d.id, 0), capacity),
        )
        for d in doctors
        if d.is_active or d.id in booked_per_doctor
    ]

    return DashboardStats(
        date_from=date_from,
        date_to=date_to,
        total=len(rows),
        by_status=by_status,
        attended=attended,
        no_show=no_show,
        no_show_rate_pct=_pct(no_show, attended + no_show),
        cancellation_rate_pct=_pct(by_status["CANCELLED"], len(rows)),
        occupancy=occupancy,
    )
