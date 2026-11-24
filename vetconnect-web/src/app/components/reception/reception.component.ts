import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AppointmentDetail,
  AppointmentService,
  AppointmentStatus,
  Doctor,
  NotificationLog,
} from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Confirmado',
  ARRIVED: 'Llegó',
  COMPLETED: 'Atendido',
  CANCELLED: 'Cancelado',
};
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  CONFIRMED: 'bg-pine text-white',
  ARRIVED: 'bg-amber-vet text-ink',
  COMPLETED: 'bg-green-600 text-white',
  CANCELLED: 'bg-red-600 text-white',
};

@Component({
  standalone: true,
  imports: [FormsModule],
  selector: 'app-reception',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="mx-auto max-w-6xl">
        <header class="mb-8 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold text-pine">Panel de Recepción</h2>
            <p class="mt-1 text-slate-600">Clínica Veterinaria San Francisco · Talca</p>
          </div>
          <button (click)="logout()"
                  class="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50">
            Cerrar sesión
          </button>
        </header>

        <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label for="fDate" class="mb-2 block text-sm font-medium text-slate-700">Fecha</label>
            <input id="fDate" type="date" [ngModel]="filterDate()" (ngModelChange)="filterDate.set($event); loadAgenda()"
                   class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" />
          </div>
          <div>
            <label for="fDoc" class="mb-2 block text-sm font-medium text-slate-700">Médico</label>
            <select id="fDoc" [ngModel]="filterDoctorId()" (ngModelChange)="filterDoctorId.set($event); loadAgenda()"
                    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5">
              <option [ngValue]="null">Todos los médicos</option>
              @for (doc of doctors(); track doc.id) {
                <option [ngValue]="doc.id">{{ doc.full_name }} · box {{ doc.box_number }}</option>
              }
            </select>
          </div>
          <div>
            <label for="fStatus" class="mb-2 block text-sm font-medium text-slate-700">Estado</label>
            <select id="fStatus" [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event)"
                    class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5">
              <option [ngValue]="null">Todos los estados</option>
              @for (s of statuses; track s) {
                <option [ngValue]="s">{{ statusLabel[s] }}</option>
              }
            </select>
          </div>
          <div class="flex items-end">
            <button (click)="loadAgenda()" class="w-full rounded-md bg-pine px-4 py-2.5 font-medium text-white hover:bg-pine-dark">
              Actualizar agenda
            </button>
          </div>
        </div>

        @if (message(); as m) {
          <p role="alert" class="mb-4 rounded-md px-4 py-2 text-sm"
             [class]="m.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'">{{ m.text }}</p>
        }

        <div class="mb-8 rounded-lg bg-white p-6 shadow-sm">
          @if (loadingAgenda()) {
            <p class="text-slate-600">Cargando agenda…</p>
          } @else if (visibleAgenda().length === 0) {
            <p class="py-8 text-center text-slate-600">No hay citas para el filtro seleccionado.</p>
          } @else {
            <ul class="max-h-[28rem] space-y-3 overflow-y-auto">
              @for (apt of visibleAgenda(); track apt.id) {
                <li class="rounded-md border border-slate-300 p-4">
                  <div class="flex items-start justify-between">
                    <div>
                      <p class="text-sm font-medium">{{ hhmm(apt.start_time) }}–{{ hhmm(apt.end_time) }} · {{ apt.doctor_name }} (box {{ apt.box_number }})</p>
                      <p class="text-xs text-slate-500">Tutor: {{ apt.tutor_name }} · {{ apt.tutor_email }}</p>
                    </div>
                    <span class="rounded px-2 py-1 text-xs" [class]="statusClass[apt.status]">{{ statusLabel[apt.status] }}</span>
                  </div>
                  @if (apt.status === 'CONFIRMED' || apt.status === 'ARRIVED') {
                    <div class="mt-2 flex gap-4 text-sm">
                      @if (apt.status === 'CONFIRMED') {
                        <button class="text-pine hover:underline" (click)="setStatus(apt, 'ARRIVED')">Confirmar llegada</button>
                      }
                      <button class="text-green-700 hover:underline" (click)="setStatus(apt, 'COMPLETED')">Marcar atendida</button>
                      <button class="text-red-700 hover:underline" (click)="cancel(apt)">Cancelar</button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </div>

        <!-- Bandeja de notificaciones (VET-15) -->
        <div class="rounded-lg bg-white p-6 shadow-sm">
          <div class="flex items-center justify-between">
            <h3 class="font-bold text-pine">Bandeja de notificaciones</h3>
            <button (click)="toggleNotifications()" class="text-sm text-pine underline">
              {{ showNotifications() ? 'Ocultar' : 'Ver notificaciones' }}
            </button>
          </div>
          @if (showNotifications()) {
            @if (notifications().length === 0) {
              <p class="py-4 text-center text-slate-600">No hay notificaciones.</p>
            } @else {
              <ul class="mt-3 max-h-64 space-y-2 overflow-y-auto">
                @for (n of notifications(); track $index) {
                  <li class="rounded-md border p-3"
                      [class]="n.event_type.includes('error') ? 'border-red-200 bg-red-50' : n.event_type === 'smtp_sent' ? 'border-green-200 bg-green-50' : 'border-slate-200'">
                    <p class="text-sm font-medium">{{ n.message }}</p>
                    <p class="text-xs text-slate-500">{{ n.event_type }} · {{ n.timestamp.substring(0, 19).replace('T', ' ') }}</p>
                  </li>
                }
              </ul>
            }
          }
        </div>
      </div>
    </section>
  `,
})
export class ReceptionComponent implements OnInit {
  private api = inject(AppointmentService);
  private router = inject(Router);
  auth = inject(AuthService);

  readonly statusLabel = STATUS_LABEL;
  readonly statusClass = STATUS_CLASS;
  readonly statuses = Object.keys(STATUS_LABEL) as AppointmentStatus[];

  filterDate = signal(new Date().toLocaleDateString('en-CA'));
  filterDoctorId = signal<number | null>(null);
  filterStatus = signal<AppointmentStatus | null>(null);

  doctors = signal<Doctor[]>([]);
  agenda = signal<AppointmentDetail[]>([]);
  visibleAgenda = computed(() => {
    const s = this.filterStatus();
    return s ? this.agenda().filter((a) => a.status === s) : this.agenda();
  });
  loadingAgenda = signal(false);
  notifications = signal<NotificationLog[]>([]);
  showNotifications = signal(false);
  message = signal<{ ok: boolean; text: string } | null>(null);

  ngOnInit(): void {
    this.api.getDoctors().subscribe({ next: (list) => this.doctors.set(list) });
    this.loadAgenda();
  }

  loadAgenda(): void {
    this.loadingAgenda.set(true);
    this.api.getDailyAgenda(this.filterDate(), this.filterDoctorId() ?? undefined).subscribe({
      next: (list) => {
        this.agenda.set(list);
        this.loadingAgenda.set(false);
      },
      error: (err) => {
        this.loadingAgenda.set(false);
        if (err.status === 401) this.logout();
        else this.notify(false, 'No se pudo cargar la agenda.');
      },
    });
  }

  setStatus(apt: AppointmentDetail, status: AppointmentStatus): void {
    this.api.updateAppointmentStatus(apt.id, status).subscribe({
      next: () => {
        this.notify(true, `Cita de las ${this.hhmm(apt.start_time)}: ${STATUS_LABEL[status].toLowerCase()}.`);
        this.loadAgenda();
      },
      error: (err) => this.notify(false, err.error?.detail ?? 'No se pudo actualizar la cita.'),
    });
  }

  cancel(apt: AppointmentDetail): void {
    if (!confirm(`¿Cancelar la cita de ${apt.tutor_name} a las ${this.hhmm(apt.start_time)}?`)) return;
    this.api.cancelAppointment(apt.id).subscribe({
      next: () => {
        this.notify(true, 'Cita cancelada: el bloque quedó libre.');
        this.loadAgenda();
      },
      error: (err) => this.notify(false, err.error?.detail ?? 'No se pudo cancelar la cita.'),
    });
  }

  toggleNotifications(): void {
    this.showNotifications.update((v) => !v);
    if (this.showNotifications()) {
      this.api.getNotifications().subscribe((list) => this.notifications.set(list));
    }
  }

  hhmm(iso: string): string {
    return iso ? iso.substring(11, 16) : '--:--';
  }

  private notify(ok: boolean, text: string): void {
    this.message.set({ ok, text });
    setTimeout(() => this.message()?.text === text && this.message.set(null), 4000);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
