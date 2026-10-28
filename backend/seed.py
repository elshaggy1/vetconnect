"""Datos iniciales (idempotente).  Ejecutar: python seed.py"""
import asyncio

from sqlalchemy import select, text

import models
from auth import hash_password
from database import Base, SessionLocal, engine
from models import Doctor, User

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


async def main():
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        for email, pwd, role, name, phone in USERS:
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
            if user is None:
                user = User(email=email, password_hash=hash_password(pwd), role=role,
                            full_name=name, phone=phone)
                db.add(user)
                await db.flush()
                print(f"+ usuario {email} ({role})")
            if email in DOCTORS:
                has_doc = (await db.execute(select(Doctor).where(Doctor.user_id == user.id))
                           ).unique().scalar_one_or_none()
                if has_doc is None:
                    spec, box = DOCTORS[email]
                    db.add(Doctor(user_id=user.id, specialty=spec, box_number=box))
                    print(f"+ médico {name} · box {box}")
        await db.commit()
    await engine.dispose()
    print("Seed completo.")


if __name__ == "__main__":
    asyncio.run(main())
