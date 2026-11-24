import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { API_URL } from '../api.config';

export type AppointmentStatus = 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';

export interface Doctor {
  id: number;
  full_name: string;
  email: string;
  specialty: string;
  box_number: number;
  is_active: boolean;
  phone: string;
}

export interface Slot {
  start_time: string; // "2026-10-22T09:00:00" (hora local de la clínica)
  end_time: string;
}

export interface Appointment {
  id: number;
  doctor_id: number;
  tutor_id: number;
  status: AppointmentStatus;
  start_time: string;
  end_time: string;
}

/** Cita del tutor con datos del médico (GET /appointments/my). */
export interface MyAppointment extends Appointment {
  doctor_name: string;
  specialty: string;
  box_number: number;
}

export interface AppointmentDetail {
  id: number;
  doctor_id: number;
  doctor_name: string;
  box_number: number;
  tutor_id: number;
  tutor_name: string;
  tutor_email: string;
  status: AppointmentStatus;
  start_time: string;
  end_time: string;
  has_medical_record: boolean;
}

export interface MedicalRecord {
  id: number;
  appointment_id: number;
  pet_name: string;
  species: string;
  weight_kg: number;
  antecedents: string;
  vaccines: string;
  diagnosis: string;
  treatment: string;
  prescription: string;
  updated_at: string;
}

export interface MedicalRecordInput {
  pet_name: string;
  species?: string;
  weight_kg: number;
  antecedents: string;
  vaccines: string;
  diagnosis: string;
  treatment: string;
  prescription: string;
}

export interface NotificationLog {
  event_type: string; // smtp_sent, smtp_error, demo_mode_skipped, reminder_scheduled, ...
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private http = inject(HttpClient);

  getDoctors(): Observable<Doctor[]> {
    return this.http.get<Doctor[]>(`${API_URL}/doctors`);
  }

  getAvailableSlots(doctorId: number, date: string): Observable<Slot[]> {
    const params = new HttpParams().set('doctor_id', doctorId).set('date', date);
    return this.http.get<Slot[]>(`${API_URL}/appointments/available-slots`, { params });
  }

  reserve(doctorId: number, slot: Slot): Observable<Appointment> {
    return this.http.post<Appointment>(`${API_URL}/appointments/reserve`, {
      doctor_id: doctorId,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
  }

  /** VET-11: citas del tutor autenticado. */
  getMyAppointments(): Observable<MyAppointment[]> {
    return this.http.get<MyAppointment[]>(`${API_URL}/appointments/my`);
  }

  /** VET-11: cancela y libera el bloque. */
  cancelAppointment(id: number): Observable<Appointment> {
    return this.http.patch<Appointment>(`${API_URL}/appointments/${id}/cancel`, {});
  }

  /** VET-11: mueve la cita a otro bloque libre del mismo médico (409 si se lo ganaron). */
  rescheduleAppointment(id: number, slot: Slot): Observable<Appointment> {
    return this.http.patch<Appointment>(`${API_URL}/appointments/${id}/reschedule`, slot);
  }

  // VET-12: Get daily agenda
  getDailyAgenda(date: string, doctorId?: number): Observable<AppointmentDetail[]> {
    let params = new HttpParams().set('date', date);
    if (doctorId) {
      params = params.set('doctor_id', doctorId);
    }
    return this.http.get<AppointmentDetail[]>(`${API_URL}/appointments/agenda`, { params });
  }

  // VET-12: Update appointment status
  updateAppointmentStatus(id: number, status: AppointmentStatus): Observable<Appointment> {
    return this.http.patch<Appointment>(`${API_URL}/appointments/${id}/status`, { status });
  }

  // VET-13: Get medical record
  getMedicalRecord(appointmentId: number): Observable<MedicalRecord | null> {
    return this.http
      .get<MedicalRecord>(`${API_URL}/medical-records/${appointmentId}`)
      .pipe(catchError(() => of(null)));
  }

  // VET-13 / VET-14: Save/upsert medical record
  saveMedicalRecord(appointmentId: number, data: MedicalRecordInput): Observable<MedicalRecord> {
    return this.http.put<MedicalRecord>(`${API_URL}/medical-records/${appointmentId}`, data);
  }

  // VET-14: Download prescription PDF
  downloadPrescriptionPdf(appointmentId: number): Observable<Blob> {
    return this.http.get(`${API_URL}/medical-records/${appointmentId}/pdf`, {
      responseType: 'blob',
    });
  }

  // VET-15: Get notifications
  getNotifications(): Observable<NotificationLog[]> {
    return this.http
      .get<NotificationLog[]>(`${API_URL}/appointments/notifications`)
      .pipe(catchError(() => of([])));
  }
}