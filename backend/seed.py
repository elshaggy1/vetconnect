"""Datos iniciales (idempotente).

    python seed.py          -> usuarios y médicos de prueba
    python seed.py --demo   -> además, 4 semanas de citas pasadas para el panel de indicadores (VET-16)
"""
import argparse
import asyncio
import random
from datetime import datetime, time, timedelta

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import select, text  # noqa: E402

import models  # noqa: E402,F401
from auth import hash_password  # noqa: E402
from database import Base, SessionLocal, engine  # noqa: E402
from models import Appointment, Doctor, User  # noqa: E402

USERS = [
    # email, password, role, nombre, teléfono
    ("admin@vetconnect.cl", "Admin123!", "ADMIN", "Administrador VetConnect", "+56 9 1111 1111"),
    ("tutor@vetconnect.cl", "Tutor123!", "TUTOR", "Camila Rojas (tutora)", "+56 9 2222 2222"),
    ("matiasaguila02@gmail.com", "matias123!", "TUTOR", "Matias Aguila (tutor)", "+56 9 2422 2422"),
    ("vet@vetconnect.cl", "Vet123!", "VETERINARIO", "Dr. Matías Fuentes", "+56 9 3333 3333"),
    ("vet2@vetconnect.cl", "Vet123!", "VETERINARIO", "Dra. Javiera Soto", "+56 9 4444 4444"),
    ("recepcion@vetconnect.cl", "Recep123!", "RECEPCIONISTA", "Paula Gómez (Recepción)", "+56 9 5555 5555"),
]
DOCTORS = {  # email -> (especialidad, box)
    "vet@vetconnect.cl": ("Medicina general", 1),
    "vet2@vetconnect.cl": ("Cirugía y traumatología", 2),
}
# Distribución aproximada del caso de negocio: ~28 % de inasistencia antes del sistema.
DEMO_STATUSES = ["COMPLETED"] * 6 + ["CONFIRMED"] * 2 + ["CANCELLED"]


async def seed_users(db) -> None:
    for email, pwd, role, name, phone in USERS:
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            user = User(email=email, password_hash=hash_password(pwd), role=role, full_name=name, phone=phone)
            db.add(user)
            await db.flush()
            print(f"+ usuario {email} ({role})")
        if email in DOCTORS:
            has_doc = (await db.execute(select(Doctor).where(Doctor.user_id == user.id))).unique().scalar_one_or_none()
            if has_doc is None:
                spec, box = DOCTORS[email]
                db.add(Doctor(user_id=user.id, specialty=spec, box_number=box))
                print(f"+ médico {name} · box {box}")
    await db.commit()


async def seed_demo_history(db) -> None:
    """Citas pasadas (lunes a viernes, últimas 4 semanas). Solo se crean si aún no hay historial."""
    today = datetime.now().date()
    if (await db.execute(select(Appointment.id).where(Appointment.start_time < datetime.combine(today, time())))).first():
        print("= historial demo ya existe, se omite")
        return
    rng = random.Random(42)
    tutor = (await db.execute(select(User).where(User.email == "tutor@vetconnect.cl"))).scalar_one()
    doctors = (await db.execute(select(Doctor))).unique().scalars().all()
    created = 0
    for offset in range(28, 0, -1):
        day = today - timedelta(days=offset)
        if day.weekday() >= 5:
            continue
        for doctor in doctors:
            for hour in rng.sample(range(9, 18), k=rng.randint(3, 6)):
                start = datetime.combine(day, time(hour, rng.choice((0, 30))))
                db.add(Appointment(doctor_id=doctor.id, tutor_id=tutor.id, status=rng.choice(DEMO_STATUSES),
                                   start_time=start, end_time=start + timedelta(minutes=30)))
                created += 1
    await db.commit()
    print(f"+ {created} citas históricas de demostración")


async def main(demo: bool) -> None:
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        await seed_users(db)
        if demo:
            await seed_demo_history(db)
    await engine.dispose()
    print("Seed completo.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true", help="agrega historial de citas para indicadores")
    asyncio.run(main(ap.parse_args().demo))
