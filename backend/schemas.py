"""Esquemas Pydantic v2."""
from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

CLINIC_TZ = ZoneInfo("America/Santiago")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    specialty: str
    box_number: int
    is_active: bool
    phone: str


class DoctorCreate(BaseModel):
    full_name: str = Field(min_length=3)
    specialty: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)
    box_number: int = Field(ge=1)
    is_active: bool = True
    phone: str = ""


class DoctorUpdate(BaseModel):
    full_name: str | None = None
    specialty: str | None = None
    box_number: int | None = Field(default=None, ge=1)
    is_active: bool | None = None
    password: str | None = None
    phone: str | None = None


class SlotOut(BaseModel):
    start_time: datetime
    end_time: datetime


class TimeRange(BaseModel):
    start_time: datetime
    end_time: datetime

    @field_validator("start_time", "end_time")
    @classmethod
    def to_clinic_naive(cls, v: datetime) -> datetime:
        """Si llega con zona horaria, se convierte a hora de la clínica y se descarta la zona."""
        if v.tzinfo is not None:
            v = v.astimezone(CLINIC_TZ).replace(tzinfo=None)
        return v


class ReserveRequest(TimeRange):
    doctor_id: int


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doctor_id: int
    tutor_id: int
    status: str
    start_time: datetime
    end_time: datetime


class MyAppointmentOut(AppointmentOut):
    """Cita del tutor con los datos del médico, para la sección "Mis reservas"."""
    doctor_name: str
    specialty: str
    box_number: int


class AppointmentDetailOut(AppointmentOut):
    doctor_name: str
    box_number: int
    tutor_name: str
    tutor_email: str
    has_medical_record: bool


class RescheduleRequest(TimeRange):
    pass


class StatusUpdateRequest(BaseModel):
    status: Literal["CONFIRMED", "ARRIVED", "COMPLETED", "CANCELLED"]


class MedicalRecordUpsert(BaseModel):
    pet_name: str = Field(min_length=1)
    species: str = "Canino"
    weight_kg: float = Field(gt=0, le=200)
    antecedents: str
    vaccines: str
    diagnosis: str
    treatment: str
    prescription: str


class MedicalRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    appointment_id: int
    pet_name: str
    species: str
    weight_kg: float
    antecedents: str
    vaccines: str
    diagnosis: str
    treatment: str
    prescription: str
    updated_at: datetime


# --- VET-16: panel de indicadores ---------------------------------------------------------
class DoctorOccupancy(BaseModel):
    doctor_id: int
    doctor_name: str
    box_number: int
    booked_slots: int
    available_slots: int
    occupancy_pct: float


class DashboardStats(BaseModel):
    date_from: date
    date_to: date
    total: int
    by_status: dict[str, int]
    attended: int
    no_show: int
    no_show_rate_pct: float
    cancellation_rate_pct: float
    occupancy: list[DoctorOccupancy]
