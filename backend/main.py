"""VetConnect Maule · API de agendamiento y ficha clínica. Ejecutar: uvicorn main:app --reload"""
import os

from dotenv import load_dotenv

# Debe ir antes de importar módulos que leen variables de entorno (database, auth, notifications).
if not os.getenv("VETCONNECT_SKIP_DOTENV"):
    load_dotenv()

from contextlib import asynccontextmanager  # noqa: E402

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from sqlalchemy import text  # noqa: E402

import models  # noqa: E402,F401 (registra las tablas en Base.metadata)
from database import Base, engine  # noqa: E402
from routers import (  # noqa: E402
    appointment_router,
    auth_router,
    doctor_router,
    medical_record_router,
    stats_router,
)

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:4200").split(",") if o.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS btree_gist"))
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(title="VetConnect Maule", version="1.3.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth_router, doctor_router, appointment_router, medical_record_router, stats_router):
    app.include_router(module.router)


@app.get("/health", tags=["health"])
async def health():
    """Usado por docker-compose para saber si la API y la BD responden (VET-19)."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}
