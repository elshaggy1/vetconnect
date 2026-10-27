from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import hash_password
from database import get_db
from models import Doctor, User
from schemas import DoctorOut, DoctorCreate, DoctorUpdate

router = APIRouter(prefix="/api/v1/doctors", tags=["doctors"])


@router.post("", response_model=DoctorOut, status_code=status.HTTP_201_CREATED)
async def create_doctor(data: DoctorCreate, db: AsyncSession = Depends(get_db)):
    """Crear un nuevo médico con su usuario asociado.

    Valida que el box_number no esté siendo usado por otro médico activo.
    """
    # Validar que el box_number no esté en uso por otro médico activo
    result = await db.execute(
        select(Doctor).where(Doctor.box_number == data.box_number, Doctor.is_active.is_(True))
    )
    existing_doctor = result.scalar_one_or_none()
    if existing_doctor:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El número de box ya está en uso por otro médico activo.",
        )

    # Verificar si el correo ya existe en users
    result = await db.execute(select(User).where(User.email == data.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ya existe un usuario con ese correo electrónico.",
        )

    # Crear el usuario con contraseña hasheada
    new_user = User(
        email=data.email,
        full_name=data.full_name,
        role="VETERINARIO",
        password_hash=hash_password(data.password),
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    # Crear el médico vinculado al usuario
    new_doctor = Doctor(
        user_id=new_user.id,
        specialty=data.specialty,
        box_number=data.box_number,
        is_active=data.is_active,
    )
    db.add(new_doctor)
    await db.commit()
    await db.refresh(new_doctor)

    # Retornar el objeto DoctorOut con los datos del usuario relacionado
    return DoctorOut(
        id=new_doctor.id,
        full_name=new_user.full_name,
        specialty=new_doctor.specialty,
        box_number=new_doctor.box_number,
    )


@router.get("", response_model=list[DoctorOut])
async def list_doctors(db: AsyncSession = Depends(get_db)):
    """Listar médicos (activos e inactivos) con teléfono."""
    rows = (
        (await db.execute(
            select(Doctor, User)
            .join(User, Doctor.user_id == User.id)
            .order_by(Doctor.id)
        ))
        .unique()
    )
    doctors = []
    for doctor, user in rows:
        doctors.append(
            DoctorOut(
                id=doctor.id,
                full_name=user.full_name,
                specialty=doctor.specialty,
                box_number=doctor.box_number,
                is_active=doctor.is_active,
                phone=user.phone
            )
        )
    return doctors


@router.put("/{doctor_id}", response_model=DoctorOut)
async def update_doctor(doctor_id: int, data: DoctorUpdate, db: AsyncSession = Depends(get_db)):
    """Actualizar un médico existente por ID."""
    # Buscar el médico existente
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    existing_doctor = result.scalar_one_or_none()
    if not existing_doctor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Médico no encontrado.",
        )

    # Validar que el box_number no esté ocupado por otro médico activo (si se cambia)
    if data.box_number is not None and data.box_number != existing_doctor.box_number:
        result = await db.execute(
            select(Doctor).where(Doctor.box_number == data.box_number, Doctor.is_active.is_(True), Doctor.id != doctor_id)
        )
        existing_box = result.scalar_one_or_none()
        if existing_box:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El número de box ya está en uso por otro médico activo.",
            )

    # Actualizar datos en la tabla doctors
    if data.full_name is not None:
        existing_doctor.user.full_name = data.full_name
    if data.specialty is not None:
        existing_doctor.specialty = data.specialty
    if data.box_number is not None:
        existing_doctor.box_number = data.box_number
    if data.is_active is not None:
        existing_doctor.is_active = data.is_active

    db.add(existing_doctor)
    await db.commit()
    await db.refresh(existing_doctor)

    # Actualizar datos en la tabla users si se proporcionó nueva contraseña
    if data.password is not None:
        user_result = await db.execute(select(User).where(User.id == existing_doctor.user_id))
        user = user_result.scalar_one_or_none()
        if user:
            user.password_hash = hash_password(data.password)
            db.add(user)
            await db.commit()

    # Retornar el doctor actualizado
    return DoctorOut(
        id=existing_doctor.id,
        full_name=existing_doctor.user.full_name,
        specialty=existing_doctor.specialty,
        box_number=existing_doctor.box_number,
    )