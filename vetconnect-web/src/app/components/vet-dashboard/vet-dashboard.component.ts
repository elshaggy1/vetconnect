import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppointmentService, Doctor, AppointmentDetail, MedicalRecord, MedicalRecordInput } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';

interface AppointmentRecordMap {
  [appointmentId: number]: MedicalRecordInput;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  selector: 'app-vet-dashboard',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <header class="mb-8">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-pine flex items-center justify-center">
              <p class="text-white font-bold">{{ auth.getFullName().charAt(0) }}</p>
            </div>
            <div>
              <h2 class="text-3xl font-bold text-pine">Ficha Clínica Digital</h2>
              <p class="text-slate-600">Clínica Veterinaria San Francisco</p>
            </div>
          </div>
        </header>

        <!-- Sección: Citas del día -->
        <div class="rounded-lg bg-white p-6 mb-8 shadow-sm">
          <h3 class="font-bold text-pine mb-4">Citas del Día</h3>

          @if (loadingDailyAppointments()) {
            <p class="text-slate-600">Cargando citas…</p>
          } @else if (dailyAppointments().length === 0) {
            <p class="text-slate-600 text-center py-8">No hay citas programadas para hoy.</p>
          } @else {
            <div class="space-y-6">
              @for (apt of dailyAppointments(); track apt.id) {
                <div class="p-5 rounded-md border border-slate-300 bg-white shadow-sm transition">
                  <div class="flex justify-between items-start pb-3 border-b border-slate-100">
                    <div>
                      <p class="font-medium text-base text-pine">
                        {{ apt.doctor_name }} (Box {{ apt.box_number }})
                      </p>
                      <p class="text-xs text-slate-500 mt-0.5">
                        Paciente ID: #{{ apt.id }} · Tutor: {{ apt.tutor_name }} ({{ apt.tutor_email }})
                      </p>
                      <p class="text-xs text-slate-500">
                        Horario: {{ formatTime(apt.start_time) }} - {{ formatTime(apt.end_time) }}
                      </p>
                    </div>
                    <span
                      class="px-2.5 py-1 text-xs rounded font-medium {{ statusBadgeClass(apt.status) }}"
                    >
                      {{ statusLabel(apt.status) }}
                    </span>
                  </div>

                  <!-- Formulario ficha clínica para esta cita específica -->
                  <div class="mt-4">
                    <p class="text-xs font-semibold text-slate-500 mb-3 uppercase tracking-wider">
                      Ficha clínica para la cita #{{ apt.id }}
                    </p>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Mascota</label>
                        <input
                          type="text"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
                          [(ngModel)]="getRecord(apt.id).pet_name"
                          placeholder="Ej: Tor"
                        />
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Especie</label>
                        <select
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
                          [(ngModel)]="getRecord(apt.id).species"
                        >
                          <option value="Canino">Canino</option>
                          <option value="Feline">Feline</option>
                          <option value="Other">Otro</option>
                        </select>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Peso (kg)</label>
                        <input
                          type="number"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
                          [(ngModel)]="getRecord(apt.id).weight_kg"
                        />
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Antecedentes</label>
                        <textarea
                          rows="2"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine resize-none"
                          [(ngModel)]="getRecord(apt.id).antecedents"
                          placeholder="Antecedentes médicos relevantes..."
                        ></textarea>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Vacunas</label>
                        <textarea
                          rows="2"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine resize-none"
                          [(ngModel)]="getRecord(apt.id).vaccines"
                          placeholder="Vacunas al día..."
                        ></textarea>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Diagnóstico</label>
                        <textarea
                          rows="2"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine resize-none"
                          [(ngModel)]="getRecord(apt.id).diagnosis"
                          placeholder="Diagnóstico clínico..."
                        ></textarea>
                      </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Tratamiento</label>
                        <textarea
                          rows="2"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine resize-none"
                          [(ngModel)]="getRecord(apt.id).treatment"
                          placeholder="Tratamiento a seguir..."
                        ></textarea>
                      </div>
                      <div>
                        <label class="block text-sm font-medium text-slate-700 mb-1">Receta/Dosis</label>
                        <textarea
                          rows="3"
                          class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine resize-none"
                          [(ngModel)]="getRecord(apt.id).prescription"
                          placeholder="Medicamentos, dosis y frecuencia..."
                        ></textarea>
                      </div>
                    </div>

                    <div class="flex gap-3 mt-6">
                      <button
                        (click)="saveMedicalRecord(apt.id)"
                        class="flex-1 rounded-md bg-pine text-white px-4 py-2.5 font-medium transition hover:bg-pine-dark"
                      >
                        Guardar Ficha Clínica
                      </button>

                      <button
                        (click)="generatePdf(apt.id)"
                        class="rounded-md bg-amber-vet text-ink px-4 py-2.5 font-medium transition hover:brightness-95"
                      >
                        Emitir PDF
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class VetDashboardComponent implements OnInit {
  private api = inject(AppointmentService);
  private router = inject(Router);
  auth = inject(AuthService);

  // Mapa para almacenar los datos del formulario por cada appointment_id
  recordsMap: AppointmentRecordMap = {};

  dailyAppointments = signal<AppointmentDetail[]>([]);
  loadingDailyAppointments = signal(false);
  pdfFilename = signal<string>('');

  ngOnInit(): void {
    this.loadDailyAppointments();
  }

  loadDailyAppointments(): void {
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    this.loadingDailyAppointments.set(true);
    this.api.getDailyAgenda(today).subscribe({
      next: (appointments) => {
        this.dailyAppointments.set(appointments);
        this.loadingDailyAppointments.set(false);

        // Para cada cita, inicializar su estructura e intentar cargar su ficha si ya existe
        appointments.forEach((apt) => {
          this.initRecord(apt.id);
          if (apt.has_medical_record) {
            this.loadExistingRecord(apt.id);
          }
        });
      },
      error: () => {
        this.loadingDailyAppointments.set(false);
      },
    });
  }

  // Inicializa el objeto de formulario para una cita si no existe
  initRecord(appointmentId: number): void {
    if (!this.recordsMap[appointmentId]) {
      this.recordsMap[appointmentId] = {
        pet_name: '',
        species: 'Canino',
        weight_kg: 0,
        antecedents: '',
        vaccines: '',
        diagnosis: '',
        treatment: '',
        prescription: '',
      };
    }
  }

  // Devuelve el objeto de registro asociado a una cita específica
  getRecord(appointmentId: number): MedicalRecordInput {
    this.initRecord(appointmentId);
    return this.recordsMap[appointmentId];
  }

  // Carga una ficha existente desde el backend y la inyecta en el mapa
  loadExistingRecord(appointmentId: number): void {
    this.api.getMedicalRecord(appointmentId).subscribe({
      next: (record) => {
        if (record) {
          this.recordsMap[appointmentId] = {
            pet_name: record.pet_name,
            species: record.species,
            weight_kg: record.weight_kg,
            antecedents: record.antecedents,
            vaccines: record.vaccines,
            diagnosis: record.diagnosis,
            treatment: record.treatment,
            prescription: record.prescription,
          };
        }
      },
      error: () => {
        // Silenciar si no existe todavía
      },
    });
  }

  formatTime(iso: string): string {
    if (!iso) return '--:--';
    return iso.substring(11, 16);
  }

  statusLabel(status: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'): string {
    switch (status) {
      case 'CONFIRMED':
        return 'Confirmado';
      case 'ARRIVED':
        return 'Llegó';
      case 'COMPLETED':
        return 'Completado';
      case 'CANCELLED':
        return 'Cancelado';
      default:
        return status;
    }
  }

  statusBadgeClass(status: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'): string {
    switch (status) {
      case 'CONFIRMED':
        return 'bg-pine text-white';
      case 'ARRIVED':
        return 'bg-amber-vet text-ink';
      case 'COMPLETED':
        return 'bg-green-600 text-white';
      case 'CANCELLED':
        return 'bg-red-600 text-white';
      default:
        return 'bg-slate-400 text-white';
    }
  }

  // Guardar ficha clínica para una cita específica
  saveMedicalRecord(appointmentId: number): void {
    const recordData = this.getRecord(appointmentId);
    if (!recordData.pet_name) {
      alert('Ingrese el nombre de la mascota.');
      return;
    }

    this.api.saveMedicalRecord(appointmentId, recordData).subscribe({
      next: () => {
        this.showModal({
          type: 'success',
          title: 'Guardado',
          message: 'Ficha clínica guardada exitosamente.',
        });
        // Recargar las citas para actualizar el estado a COMPLETED y el flag has_medical_record
        this.loadDailyAppointments();
      },
      error: (err) => {
        console.error('Error al guardar ficha:', err);
        this.showModal({
          type: 'error',
          title: 'Error',
          message: err.error?.detail ?? 'No se pudo guardar la ficha clínica.',
        });
      },
    });
  }

  // Generar PDF de receta para una cita específica
  generatePdf(appointmentId: number): void {
    const recordData = this.getRecord(appointmentId);
    if (!recordData.pet_name) {
      alert('Debe rellenar y guardar la ficha clínica antes de emitir el PDF.');
      return;
    }

    this.api.downloadPrescriptionPdf(appointmentId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        this.pdfFilename.set(`receta_cita_${appointmentId}.pdf`);
        a.download = this.pdfFilename();
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        this.showModal({
          type: 'success',
          title: 'PDF generado',
          message: 'La receta médica ha sido descargada.',
        });
      },
      error: (err) => {
        console.error('Error al generar PDF:', err);
        this.showModal({
          type: 'error',
          title: 'Error',
          message: err.error?.detail ?? 'No se pudo generar la receta. Asegúrese de haber guardado la ficha primero.',
        });
      },
    });
  }

  showModal(modal: { type: 'success' | 'error'; title: string; message: string }): void {
    alert(modal.message);
  }
}