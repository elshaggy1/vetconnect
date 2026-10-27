import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppointmentService, AppointmentDetail, NotificationLog } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { Doctor } from '../../services/appointment.service';

interface StatusFilter {
  value: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED';
  label: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  selector: 'app-reception',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <header class="mb-8 flex justify-between items-center">
          <div>
            <h2 class="text-3xl font-bold text-pine">Panel de Recepción</h2>
            <p class="text-slate-600 mt-1">Clínica Veterinaria San Francisco - Talca</p>
          </div>

          <!-- Botón de Cerrar Sesión -->
          <button
            (click)="logout()"
            class="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-md shadow-sm hover:bg-red-50 transition"
          >
            Cerrar Sesión
          </button>
        </header>

        <!-- Filtros -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Fecha</label>
            <input
              type="date"
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
              [(ngModel)]="filterDate"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Médico</label>
            <select
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
              [(ngModel)]="filterDoctorId"
            >
              <option value="">Todos los médicos</option>
              @for (doc of doctors(); track doc.id) {
                <option [value]="doc.id">{{ doc.full_name }} · {{ doc.specialty }}</option>
              }
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-2">Estado</label>
            <select
              class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine"
              [(ngModel)]="filterStatus"
            >
              <option value="">Todos los estados</option>
              @for (status of statusFilters; track status.value) {
                <option [value]="status.value">{{ status.label }}</option>
              }
            </select>
          </div>
          <div>
            <button
              (click)="loadAgenda()"
              class="w-full rounded-md bg-pine text-white px-4 py-2.5 font-medium transition hover:bg-pine-dark">
              Actualizar agenda
            </button>
          </div>
        </div>

        <!-- Agenda diaria -->
        <div class="rounded-lg bg-white p-6 mb-8 shadow-sm">
          @if (loadingAgenda()) {
            <p class="text-slate-600">Cargando agenda…</p>
          } @else if (agenda().length === 0) {
            <p class="text-slate-600 text-center py-8">No hay citas para el filtro seleccionado.</p>
          } @else {
            <div class="space-y-3 max-h-80 overflow-y-auto">
              @for (apt of agenda(); track apt.id) {
                <div
                  class="
                    p-4 rounded-md border border-slate-300 bg-white transition
                  "
                >
                  <div class="flex justify-between items-start">
                    <div>
                      <p class="font-medium text-sm">{{ apt.doctor_name }}</p>
                      <p class="text-xs text-slate-500">{{ formatTime(apt.start_time) }} - {{ formatTime(apt.end_time) }}</p>
                    </div>
                    <span
                      class="
                        px-2 py-1 text-xs rounded
                        {{ statusBadgeClass(apt.status) }}
                      "
                    >
                      {{ statusLabel(apt.status) }}
                    </span>
                  </div>
                  <div class="mt-2 flex gap-2">
                    <button
                      *ngIf="apt.status !== 'CANCELLED'"
                      class="text-blue-600 text-sm hover:underline"
                      (click)="confirmArrival(apt.id)"
                    >
                      Llegó
                    </button>
                    <button
                      *ngIf="apt.status !== 'COMPLETED' && apt.status !== 'CANCELLED'"
                      class="text-green-600 text-sm hover:underline"
                      (click)="completeAppointment(apt.id)"
                    >
                      Completado
                    </button>
                    <button
                      class="text-red-600 text-sm hover:underline"
                      (click)="cancelFromReception(apt.id)"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              }
            </div>
          }
        </div>

        <!-- Bandeja de notificaciones (VET-15) -->
        @if (showNotifications()) {
          <div class="mt-8 p-6 rounded-lg bg-white shadow-sm">
            <h3 class="font-bold text-pine mb-3">Bandeja de Notificaciones</h3>
            @if (notificationsLoading()) {
              <p class="text-slate-600">Cargando notificaciones…</p>
            } @else if (notifications().length === 0) {
              <p class="text-slate-600 text-center py-4">No hay notificaciones.</p>
            } @else {
              <div class="space-y-2 max-h-64 overflow-y-auto">
                @for (notif of notifications(); track notif.id) {
                  <div
                    class="
                      p-3 rounded-md
                      {{ notif.event_type === 'smtp_sent' ? 'bg-green-50' : 'bg-pine-50' }}
                      border{{ notif.event_type === 'smtp_sent' ? '-green' : '-pine' }}-200
                    "
                  >
                    <p class="text-sm font-medium">{{ notif.message }}</p>
                    <p class="text-xs text-slate-500">{{ notif.timestamp }}</p>
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <button
            (click)="toggleNotifications()
            "
            class="mt-4 text-pine underline cursor-pointer"
          >
            Ver notificaciones
          </button>
        }
      </div>
    </section>
  `,
})
export class ReceptionComponent implements OnInit {
  private api = inject(AppointmentService);
  private router = inject(Router);
  auth = inject(AuthService);

  filterDate = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
  filterDoctorId: number | null = null;
  filterStatus: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | '' = '';

  doctors = signal<Doctor[]>([]);
  agenda = signal<AppointmentDetail[]>([]);
  loadingAgenda = signal(false);
  notifications = signal<NotificationLog[]>([]);
  showNotifications = signal(false);

  statusFilters = [
    { value: 'CONFIRMED' as const, label: 'Confirmado' },
    { value: 'ARRIVED' as const, label: 'Llegó' },
    { value: 'COMPLETED' as const, label: 'Completado' },
    { value: 'CANCELLED' as const, label: 'Cancelado' },
  ];

  constructor() {}

  ngOnInit(): void {
    this.loadDoctors();
    this.loadAgenda();
  }

  loadDoctors(): void {
    this.api.getDoctors().subscribe({
      next: (list) => {
        this.doctors.set(list);
      },
    });
  }

  loadAgenda(): void {
    this.loadingAgenda.set(true);
    this.api
      .getDailyAgenda(
        this.filterDate,
        this.filterDoctorId as number | undefined
      )
      .subscribe({
        next: (agenda) => {
          // Filtrar por estado localmente si se seleccionó uno
          let filtered = agenda;
          if (this.filterStatus) {
            filtered = agenda.filter(apt => apt.status === this.filterStatus);
          }

          const processedAgenda = filtered.map((apt) => {
            return {
              ...apt,
              _statusClass: this.statusClass(apt.status),
              _statusLabel: this.statusLabel(apt.status),
            };
          });
          this.agenda.set(processedAgenda as AppointmentDetail[]);
          this.loadingAgenda.set(false);
        },
        error: (err) => {
          console.error('Error al cargar agenda:', err);
          this.loadingAgenda.set(false);
        }
      });
  }

  // Formatear hora desde ISO string
  formatTime(iso: string): string {
    if (!iso) return '--:--';
    return iso.substring(11, 16);
  }

  // Mapear estado a clase CSS para el badge
  statusClass(status: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'): string {
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

  // Etiqueta legible del estado
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

  // Clase para el borde del badge
  statusBadgeClass(status: 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED'): string {
    switch (status) {
      case 'CONFIRMED':
        return 'border-pine';
      case 'ARRIVED':
        return 'border-amber-vet';
      case 'COMPLETED':
        return 'border-green-600';
      case 'CANCELLED':
        return 'border-red-600';
      default:
        return 'border-slate-300';
    }
  }

  // Acciones de la agenda
  confirmArrival(id: number): void {
    this.api.updateAppointmentStatus(id, 'ARRIVED').subscribe({
      next: () => {
        this.loadAgenda();
        this.showModal({
          type: 'success',
          title: 'Éxito',
          message: 'Estado actualizado a ARRIVED.',
        });
      },
    });
  }

  completeAppointment(id: number): void {
    this.api.updateAppointmentStatus(id, 'COMPLETED').subscribe({
      next: () => {
        this.loadAgenda();
        this.showModal({
          type: 'success',
          title: 'Éxito',
          message: 'Cita marcada como COMPLETED.',
        });
      },
    });
  }

  cancelFromReception(id: number): void {
    this.api.cancelAppointment(id).subscribe({
      next: () => {
        this.loadAgenda();
        this.showModal({
          type: 'success',
          title: 'Cancelado',
          message: 'Cita cancelada desde recepción.',
        });
      },
    });
  }

  // Notificaciones VET-15
  toggleNotifications(): void {
    const newState = !this.showNotifications();
    this.showNotifications.set(newState);
    if (newState) {
      this.loadNotifications();
    }
  }

  loadNotifications(): void {
    this.api.getNotifications().subscribe({
      next: (notifs) => {
        this.notifications.set(notifs);
      },
    });
  }

  // Función de cierre de sesión
  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  notificationsLoading = signal(false);

  showModal(modal: { type: 'success' | 'error'; title: string; message: string }): void {
    alert(modal.message);
  }
}