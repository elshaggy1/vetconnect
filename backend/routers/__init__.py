"""Exportación de routers FastAPI."""
from fastapi import APIRouter

from . import appointment_router, auth_router, doctor_router, medical_record_router

router = APIRouter()
router.include_router(auth_router.router)
router.include_router(doctor_router.router)
router.include_router(appointment_router.router)
router.include_router(medical_record_router.router)