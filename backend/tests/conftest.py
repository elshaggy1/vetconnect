"""
Infraestructura de tests de VetConnect Maule.

* Usa un PostgreSQL REAL (la restricción EXCLUDE + btree_gist no existe en SQLite).
* Base dedicada: TEST_DATABASE_URL (por defecto .../vetconnect_test). Se niega a correr
  contra una base cuyo nombre no termine en "_test", porque limpia tablas entre pruebas.
* La app se prueba "en proceso" con httpx + ASGITransport: sin levantar uvicorn.
"""
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

# Permite `import main`, `import models`... igual que cuando se corre uvicorn desde /backend
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/vetconnect_test",
)
if not urlparse(TEST_DATABASE_URL).path.rstrip("/").endswith("_test"):
    raise RuntimeError(
        "TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en '_test' "
        f"(recibido: {TEST_DATABASE_URL}). Las pruebas borran datos."
    )
# Antes de importar la app, para que ningún módulo apunte por error a la BD de desarrollo.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["SECRET_KEY"] = "test-secret"
for _var in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"):
    os.environ.pop(_var, None)  # modo demo: nunca se envían correos reales

import notifications  # noqa: E402
from auth import hash_password  # noqa: E402
from database import Base, get_db  # noqa: E402
from main import app  # noqa: E402
from models import Appointment, Doctor, MedicalRecord, User  # noqa: E402

# NullPool: cada test abre/cierra sus conexiones; evita "attached to a different loop".
test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)
TestSession = async_sessionmaker(test_engine, expire_on_commit=False)

PASSWORDS = {
    "admin@vetconnect.cl": ("Admin123!", "ADMIN", "Administrador VetConnect"),
    "tutor@vetconnect.cl": ("Tutor123!", "TUTOR", "Camila Rojas (tutora)"),
    "tutor2@vetconnect.cl": ("Tutor123!", "TUTOR", "Otro Tutor"),
    "vet@vetconnect.cl": ("Vet123!", "VETERINARIO", "Dr. Matías Fuentes"),
    "vet2@vetconnect.cl": ("Vet123!", "VETERINARIO", "Dra. Javiera Soto"),
    "recepcion@vetconnect.cl": ("Recep123!", "RECEPCIONISTA", "Paula Gómez (Recepción)"),
}
DOCTORS = {"vet@vetconnect.cl": ("Medicina general", 1), "vet2@vetconnect.cl": ("Cirugía", 2)}

_schema_ready = False


async def _ensure_database() -> None:
    """Crea la base *_test si no existe (útil en local; en CI ya la crea el servicio)."""
    u = urlparse(TEST_DATABASE_URL.replace("+asyncpg", ""))
    name = u.path.lstrip("/")
    conn = await asyncpg.connect(
        host=u.hostname, port=u.port or 5432, user=u.username, password=u.password,
        database="postgres",
    )
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", name):
            await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()


async def _prepare_schema() -> None:
    """Una sola vez por sesión: esquema limpio + usuarios y médicos base."""
    global _schema_ready
    if _schema_ready:
        return
    await _ensure_database()
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with TestSession() as db:
        for email, (pwd, role, name) in PASSWORDS.items():
            user = User(email=email, password_hash=hash_password(pwd), role=role,
                        full_name=name, phone="+56 9 0000 0000")
            db.add(user)
            await db.flush()
            if email in DOCTORS:
                spec, box = DOCTORS[email]
                db.add(Doctor(user_id=user.id, specialty=spec, box_number=box))
        await db.commit()
    _schema_ready = True


@pytest_asyncio.fixture(autouse=True)
async def clean_state():
    """Antes de cada test: sin citas ni fichas, sin notificaciones, sin tareas de recordatorio."""
    await _prepare_schema()
    async with TestSession() as db:
        await db.execute(delete(MedicalRecord))
        await db.execute(delete(Appointment))
        await db.commit()
    notifications.SENT_NOTIFICATIONS.clear()
    yield


@pytest.fixture(autouse=True)
def reminders_spy(monkeypatch):
    """
    `schedule_24h_reminder` lanza un asyncio.create_task que duerme hasta 24 h antes de la cita.
    Se reemplaza por un espía instantáneo: no deja tareas colgadas y permite verificar con qué
    hora se programó el recordatorio.
    """
    calls: list[tuple[datetime, dict]] = []

    async def fake(reminder_time, appointment):
        calls.append((reminder_time, appointment))

    monkeypatch.setattr(notifications, "_send_reminder_at_time", fake)
    return calls


@pytest_asyncio.fixture
async def client():
    async def override_get_db():
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def login(client):
    """login('vet@vetconnect.cl') -> headers Authorization listos para usar."""
    cache: dict[str, dict] = {}

    async def _login(email: str) -> dict:
        if email not in cache:
            r = await client.post(
                "/api/v1/auth/login", json={"email": email, "password": PASSWORDS[email][0]}
            )
            assert r.status_code == 200, r.text
            cache[email] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return cache[email]

    return _login


@pytest_asyncio.fixture
async def make_appointment():
    """Inserta una cita directo en la BD (sin pasar por /reserve, así no genera notificaciones)."""

    async def _make(
        doctor_email="vet@vetconnect.cl",
        tutor_email="tutor@vetconnect.cl",
        status="CONFIRMED",
        start: datetime | None = None,
    ) -> int:
        start = start or future_slot()[0]
        async with TestSession() as db:
            doctor = (
                await db.execute(
                    select(Doctor).join(User).where(User.email == doctor_email)
                )
            ).unique().scalar_one()
            tutor = (await db.execute(select(User).where(User.email == tutor_email))).scalar_one()
            appt = Appointment(
                doctor_id=doctor.id, tutor_id=tutor.id, status=status,
                start_time=start, end_time=start + timedelta(minutes=30),
            )
            db.add(appt)
            await db.commit()
            return appt.id

    return _make


def future_slot(days_ahead: int = 10, hour: int = 10) -> tuple[datetime, datetime]:
    """Bloque de 30 min en el futuro (hora local naive, como guarda la app)."""
    start = (datetime.now() + timedelta(days=days_ahead)).replace(
        hour=hour, minute=0, second=0, microsecond=0
    )
    return start, start + timedelta(minutes=30)


async def doctor_id_of(email: str) -> int:
    async with TestSession() as db:
        return (
            await db.execute(select(Doctor.id).join(User).where(User.email == email))
        ).scalar_one()


VALID_RECORD = {
    "pet_name": "Firulais",
    "species": "Canino",
    "weight_kg": 15.5,
    "antecedents": "Sin antecedentes relevantes",
    "vaccines": "Rabia, Parvovirus, Distemper",
    "diagnosis": "Mordedura leve en pata anterior",
    "treatment": "Limpieza y antibiótico",
    "prescription": "Enrofloxacina 10 mg cada 12 horas por 5 días",
}
