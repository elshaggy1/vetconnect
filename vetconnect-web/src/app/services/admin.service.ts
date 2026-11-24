import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from '../api.config';
import { Doctor } from './appointment.service';

/** Alta de médico: crea también su usuario VETERINARIO (VET-07). */
export interface DoctorCreateInput {
  full_name: string;
  specialty: string;
  email: string;
  password: string;
  box_number: number;
  is_active: boolean;
  phone: string;
}

/** Edición parcial: solo se envían los campos que cambian. */
export type DoctorUpdateInput = Partial<Omit<DoctorCreateInput, 'email'>>;

export interface DoctorOccupancy {
  doctor_id: number;
  doctor_name: string;
  box_number: number;
  booked_slots: number;
  available_slots: number;
  occupancy_pct: number;
}

/** Respuesta de GET /stats/dashboard (VET-16). */
export interface DashboardStats {
  date_from: string;
  date_to: string;
  total: number;
  by_status: Record<'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED', number>;
  attended: number;
  no_show: number;
  no_show_rate_pct: number;
  cancellation_rate_pct: number;
  occupancy: DoctorOccupancy[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  getDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${API_URL}/doctors`);
  }

  createDoctor(data: DoctorCreateInput): Observable<Doctor> {
    return this.http.post<Doctor>(`${API_URL}/doctors`, data);
  }

  updateDoctor(id: number, data: DoctorUpdateInput): Observable<Doctor> {
    return this.http.put<Doctor>(`${API_URL}/doctors/${id}`, data);
  }

  getDashboardStats(dateFrom: string, dateTo: string): Observable<DashboardStats> {
    const params = new HttpParams().set('date_from', dateFrom).set('date_to', dateTo);
    return this.http.get<DashboardStats>(`${API_URL}/stats/dashboard`, { params });
  }
}
