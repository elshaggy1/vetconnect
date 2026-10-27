"""Esquemas Pydantic v2."""
from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, EmailStr, field_validator

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
    specialty: str
    box_number: int
    is_active: bool
    phone: str


class DoctorCreate(BaseModel):
    full_name: str
    specialty: str
    email: EmailStr
    password: str
    box_number: int
    is_active: bool = True
    phone: str = ''


class DoctorUpdate(BaseModel):
    full_name: str | None = None
    specialty: str | None = None
    box_number: int | None = None
    is_active: bool | None = None
    password: str | None = None
    phone: str | None = None


class SlotOut(BaseModel):
    start_time: datetime
    end_time: datetime


class ReserveRequest(BaseModel):
    doctor_id: int
    start_time: datetime
    end_time: datetime

    @field_validator("start_time", "end_time")
    @classmethod
    def to_clinic_naive(cls, v: datetime) -> datetime:
        """Si llega con zona horaria, se convierte a hora de la clínica y se descarta la zona."""
        if v.tzinfo is not None:
            v = v.astimezone(CLINIC_TZ).replace(tzinfo=None)
        return v


class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    doctor_id: int
    tutor_id: int
    status: str
    start_time: datetime
    end_time: datetime


class AppointmentDetailOut(AppointmentOut):
    model_config = ConfigDict(from_attributes=True)
    doctor_name: str
    box_number: int
    tutor_name: str
    tutor_email: str
    has_medical_record: bool


class RescheduleRequest(BaseModel):
    start_time: datetime
    end_time: datetime

    @field_validator("start_time", "end_time")
    @classmethod
    def to_clinic_naive(cls, v: datetime) -> datetime:
        if v.tzinfo is not None:
            v = v.astimezone(CLINIC_TZ).replace(tzinfo=None)
        return v


class StatusUpdateRequest(BaseModel):
    status: str


class MedicalRecordUpsert(BaseModel):
    pet_name: str
    species: str = "Canino"
    weight_kg: float
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


    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    location: str
