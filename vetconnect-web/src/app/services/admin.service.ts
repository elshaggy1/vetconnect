import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Doctor {
  id: number;
  full_name: string;
  specialty: string;
  box_number: number;
}

/** Interfaz para la creación de un médico - incluye credenciales */
export interface DoctorCreateInput {
  full_name: string;
  specialty: string;
  email: string;
  phone: string;      // número de celular (opcional en el frontend, pero el backend lo almacenará)
  password: string;   // contraseña (se hasheará en el backend)
}

/** Interfaz para la actualización de un médico - campos opcionales */
export interface DoctorUpdateInput {
  full_name: string | null;
  specialty: string | null;
  box_number: number | null;
  is_active: boolean | null;
  password: string | null;
}

/** Interfaz para listar médicos */
export interface DoctorList {
  id: number;
  full_name: string;
  specialty: string;
  box_number: number;
  phone: string;
  is_active: boolean;
}

export interface Doctor {
  id: number;
  full_name: string;
  specialty: string;
  box_number: number;
}

export interface Box {
  id: number;
  name: string;
  location: string;
}

export interface ScheduleSlot {
  start_time: string;
  end_time: string;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private readonly API_BASE = 'http://localhost:8000/api/v1';

  /** POST /api/doctors */
  createDoctor(data: DoctorCreateInput): Observable<Doctor> {
    return this.http.post<Doctor>(`${this.API_BASE}/doctors`, data);
  }

  /** GET /api/doctors */
  getDoctors(): Observable<DoctorList[]> {
    return this.http.get<DoctorList[]>(`${this.API_BASE}/doctors`);
  }

  /** POST /api/boxes */
  createBox(data: { name: string; location: string }): Observable<Box> {
    return this.http.post<Box>(`${this.API_BASE}/boxes`, data);
  }

  /** POST /api/schedules */
  createSchedule(data: {
    doctor_id: number;
    start_time: string;
    end_time: string;
  }): Observable<ScheduleSlot> {
    return this.http.post<ScheduleSlot>(`${this.API_BASE}/schedules`, data);
  }

  /** PUT /api/v1/doctors/{id} */
  updateDoctor(id: number, data: DoctorUpdateInput): Observable<Doctor> {
    return this.http.put<Doctor>(`${this.API_BASE}/doctors/${id}`, data);
  }
}