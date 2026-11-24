"""Gestión de médicos, horarios y boxes (VET-07). Crear/editar exige rol ADMIN (RNF-02)."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import hash_password, require_role
from database import get_db
from models import Doctor, User
from schemas import DoctorCreate, DoctorOut, DoctorUpdate

router = APIRouter(prefix="/api/v1/doctors", tags=["doctors"])

BOX_IN_USE = "El número de box ya está en uso por otro médico activo."


def _to_out(doctor: Doctor, user: User) -> DoctorOut:
    return DoctorOut(
        id=doctor.id,
        full_name=user.full_name,
        email=user.email,
        specialty=doctor.specialty,
        box_number=doctor.box_number,
        is_active=doctor.is_active,
        phone=user.phone or "",
    )


async def _box_taken(db: AsyncSession, box_number: int, exclude_id: int | None = None) -> bool:
    query = select(Doctor.id).where(Doctor.box_number == box_number, Doctor.is_active.is_(True))
    if exclude_id is not None:
        query = query.where(Doctor.id != exclude_id)
    return (await db.execute(query)).first() is not None


@router.get("", response_model=list[DoctorOut])
async def list_doctors(db: AsyncSession = Depends(get_db)):
    """Lista pública de médicos (activos e inactivos); la usa la vista de reservas."""
    rows = (await db.execute(select(Doctor).order_by(Doctor.id))).unique().scalars().all()
    return [_to_out(d, d.user) for d in rows]


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
async def create_doctor(
    data: DoctorCreate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("ADMIN")),
):
    """Crea un médico con su usuario VETERINARIO. El box no puede estar ocupado por otro activo."""
    if data.is_active and await _box_taken(db, data.box_number):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, BOX_IN_USE)
    if (await db.execute(select(User.id).where(User.email == data.email))).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya existe un usuario con ese correo electrónico.")

    user = User(
        email=data.email,
        full_name=data.full_name,
        role="VETERINARIO",
        phone=data.phone or None,
        password_hash=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    doctor = Doctor(
        user_id=user.id,
        specialty=data.specialty,
        box_number=data.box_number,
        is_active=data.is_active,
    )
    db.add(doctor)
    await db.commit()
    return _to_out(doctor, user)


@router.put("/{doctor_id}", response_model=DoctorOut)
async def update_doctor(
    doctor_id: int,
    data: DoctorUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("ADMIN")),
):
    """Actualiza datos del médico; solo cambia los campos enviados."""
    doctor = (await db.execute(select(Doctor).where(Doctor.id == doctor_id))).unique().scalar_one_or_none()
    if doctor is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Médico no encontrado.")

    new_box = data.box_number if data.box_number is not None else doctor.box_number
    will_be_active = data.is_active if data.is_active is not None else doctor.is_active
    if will_be_active and await _box_taken(db, new_box, exclude_id=doctor_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, BOX_IN_USE)

    user = doctor.user
    if data.full_name:
        user.full_name = data.full_name
    if data.phone is not None:
        user.phone = data.phone or None
    if data.password:
        user.password_hash = hash_password(data.password)
    if data.specialty:
        doctor.specialty = data.specialty
    doctor.box_number = new_box
    doctor.is_active = will_be_active

    await db.commit()
    return _to_out(doctor, user)
