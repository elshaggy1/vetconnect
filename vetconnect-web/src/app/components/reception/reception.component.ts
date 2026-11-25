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
import { TopbarComponent } from '../topbar/topbar.component';

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Confirmado',
  ARRIVED: 'Llegó',
  COMPLETED: 'Atendido',
  CANCELLED: 'Cancelado',
};
const STATUS_CLASS: Record<AppointmentStatus, string> = {
  CONFIRMED: 'badge-confirmed',
  ARRIVED: 'badge-arrived',
  COMPLETED: 'badge-completed',
  CANCELLED: 'badge-cancelled',
};

@Component({
  standalone: true,
  imports: [FormsModule, TopbarComponent],
  selector: 'app-reception',
  template: `
    <app-topbar />

    <main class="page">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="eyebrow">Recepción</p>
          <h1 class="text-4xl sm:text-5xl">Agenda del <span class="text-coral">día</span></h1>
        </div>
        <p class="text-sm">Clínica Veterinaria San Francisco · Talca</p>
      </div>

      <section class="card mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label for="fDate" class="label">Fecha</label>
          <input id="fDate" type="date" [ngModel]="filterDate()" (ngModelChange)="filterDate.set($event); loadAgenda()" class="input" />
        </div>
        <div>
          <label for="fDoc" class="label">Médico</label>
          <select id="fDoc" [ngModel]="filterDoctorId()" (ngModelChange)="filterDoctorId.set($event); loadAgenda()" class="input">
            <option [ngValue]="null">Todos los médicos</option>
            @for (doc of doctors(); track doc.id) {
              <option [ngValue]="doc.id">{{ doc.full_name }} · box {{ doc.box_number }}</option>
            }
          </select>
        </div>
        <div>
          <label for="fStatus" class="label">Estado</label>
          <select id="fStatus" [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event)" class="input">
            <option [ngValue]="null">Todos los estados</option>
            @for (s of statuses; track s) {
              <option [ngValue]="s">{{ statusLabel[s] }}</option>
            }
          </select>
        </div>
        <div class="flex items-end">
          <button (click)="loadAgenda()" class="btn-dark w-full py-3">Actualizar agenda</button>
        </div>
      </section>

      @if (message(); as m) {
        <p role="alert" class="mb-4" [class]="m.ok ? 'alert-success' : 'alert-error'">{{ m.text }}</p>
      }

      <section class="card mb-6">
        <h2 class="card-title">Citas ({{ visibleAgenda().length }})</h2>
        @if (loadingAgenda()) {
          <p>Cargando agenda…</p>
        } @else if (visibleAgenda().length === 0) {
          <p class="rounded-2xl bg-cream px-5 py-8 text-center">No hay citas para el filtro seleccionado.</p>
        } @else {
          <ul class="max-h-[30rem] space-y-3 overflow-y-auto pr-1">
            @for (apt of visibleAgenda(); track apt.id) {
              <li class="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-cream p-4">
                <div class="flex items-center gap-4">
                  <span class="grid h-14 w-16 place-items-center rounded-xl bg-white text-lg font-medium text-espresso">{{ hhmm(apt.start_time) }}</span>
                  <div>
                    <p class="font-medium text-espresso">{{ apt.tutor_name }}</p>
                    <p class="text-xs">{{ apt.doctor_name }} · box {{ apt.box_number }} · {{ apt.tutor_email }}</p>
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-3">
                  <span [class]="statusClass[apt.status]">{{ statusLabel[apt.status] }}</span>
                  @if (apt.status === 'CONFIRMED') {
                    <button class="btn-outline px-4 py-1.5 text-sm" (click)="setStatus(apt, 'ARRIVED')">Confirmar llegada</button>
                  }
                  @if (apt.status === 'CONFIRMED' || apt.status === 'ARRIVED') {
                    <button class="btn-ghost px-4 py-1.5 text-sm" (click)="setStatus(apt, 'COMPLETED')">Marcar atendida</button>
                    <button class="btn-link text-muted" (click)="cancel(apt)">Cancelar</button>
                  }
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <!-- Bandeja de notificaciones (VET-15) -->
      <section class="card">
        <div class="flex items-center justify-between">
          <h2 class="text-xl">Bandeja de notificaciones</h2>
          <button (click)="toggleNotifications()" class="btn-link text-coral">
            {{ showNotifications() ? 'Ocultar' : 'Ver notificaciones' }}
          </button>
        </div>
        @if (showNotifications()) {
          @if (notifications().length === 0) {
            <p class="py-4 text-center">No hay notificaciones.</p>
          } @else {
            <ul class="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              @for (n of notifications(); track $index) {
                <li class="rounded-xl p-3"
                    [class]="n.event_type.includes('error') ? 'bg-red-50' : n.event_type === 'smtp_sent' ? 'bg-emerald-50' : 'bg-cream'">
                  <p class="text-sm font-medium text-espresso">{{ n.message }}</p>
                  <p class="text-xs">{{ n.event_type }} · {{ n.timestamp.substring(0, 19).replace('T', ' ') }}</p>
                </li>
              }
            </ul>
          }
        }
      </section>
    </main>
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
