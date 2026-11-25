import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AppointmentService,
  AppointmentStatus,
  Doctor,
  MyAppointment,
  Slot,
} from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { TopbarComponent } from '../topbar/topbar.component';

interface ModalState {
  type: 'success' | 'error';
  title: string;
  message: string;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  CONFIRMED: 'Confirmada',
  ARRIVED: 'En la clínica',
  COMPLETED: 'Atendida',
  CANCELLED: 'Cancelada',
};

@Component({
  selector: 'app-booking',
  standalone: true,
  imports: [FormsModule, TopbarComponent],
  template: `
    <app-topbar />

    <main class="page">
      <section class="relative overflow-hidden rounded-4xl bg-espresso px-8 py-12 sm:px-12">
        <p class="eyebrow">{{ rescheduling() ? 'Reprogramación' : 'Reserva en línea' }}</p>
        <h1 class="max-w-2xl text-4xl leading-tight text-cream sm:text-5xl">
          @if (rescheduling()) { Elige un <span class="text-coral">nuevo horario</span> }
          @else { Reserva la hora de tu <span class="text-coral">mascota</span> }
        </h1>
        <p class="mt-4 max-w-xl text-cream/80">Elige médico y fecha. Solo ves los bloques que están libres en este momento.</p>
        <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-coral/15" aria-hidden="true"></div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <section class="card">
          @if (rescheduling(); as r) {
            <div role="status" class="alert-info mb-6 flex items-center justify-between gap-4">
              <span>
                Reprogramando la cita del <strong>{{ ymd(r.start_time) }} a las {{ hhmm(r.start_time) }}</strong>
                con {{ r.doctor_name }}.
              </span>
              <button type="button" (click)="stopReschedule()" class="btn-link shrink-0 text-espresso">Volver</button>
            </div>
          }

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label for="doctor" class="label">Médico veterinario</label>
              <select id="doctor" [ngModel]="doctorId()" (ngModelChange)="onDoctorChange($event)" [disabled]="!!rescheduling()" class="input">
                <option [ngValue]="null" disabled>Selecciona un médico</option>
                @for (d of activeDoctors(); track d.id) {
                  <option [ngValue]="d.id">{{ d.full_name }} · {{ d.specialty }} (box {{ d.box_number }})</option>
                }
              </select>
            </div>
            <div>
              <label for="date" class="label">Fecha</label>
              <input id="date" type="date" [min]="today" [ngModel]="date()" (ngModelChange)="onDateChange($event)" class="input" />
            </div>
          </div>

          <section class="mt-8" aria-live="polite">
            <h2 class="mb-4 text-2xl">Horarios disponibles</h2>
            @if (!doctorId() || !date()) {
              <p>Selecciona un médico y una fecha para ver los horarios.</p>
            } @else if (loadingSlots()) {
              <p>Buscando horarios…</p>
            } @else if (slots().length === 0) {
              <p class="rounded-2xl bg-cream px-5 py-4">No quedan horas libres este día. Prueba con otra fecha.</p>
            } @else {
              <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                @for (s of slots(); track s.start_time) {
                  <button type="button" (click)="selected.set(s)"
                          [attr.aria-pressed]="selected()?.start_time === s.start_time"
                          class="rounded-full border px-2 py-2.5 text-sm font-medium transition"
                          [class]="selected()?.start_time === s.start_time
                            ? 'border-espresso bg-espresso text-cream'
                            : 'border-line bg-white text-espresso hover:border-coral hover:text-coral'">
                    {{ hhmm(s.start_time) }}
                  </button>
                }
              </div>
            }
          </section>

          <button type="button" (click)="confirm()" [disabled]="!selected() || submitting()" class="btn-primary mt-8 w-full py-3.5 sm:w-auto">
            {{ submitting() ? 'Guardando…' : rescheduling() ? 'Confirmar nuevo horario' : 'Confirmar reserva' }}
          </button>
        </section>

        <aside class="card h-fit">
          <h2 class="card-title">Mis reservas</h2>
          @if (loadingMine()) {
            <p class="text-sm">Cargando…</p>
          } @else if (myAppointments().length === 0) {
            <p class="text-sm">Aún no tienes reservas.</p>
          } @else {
            <ul class="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
              @for (apt of myAppointments(); track apt.id) {
                <li class="rounded-2xl bg-cream p-4">
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="font-medium text-espresso">{{ apt.doctor_name }}</p>
                      <p class="text-xs">Box {{ apt.box_number }} · {{ ymd(apt.start_time) }} · {{ hhmm(apt.start_time) }}–{{ hhmm(apt.end_time) }}</p>
                    </div>
                    <span [class]="badgeClass[apt.status]">{{ statusLabel[apt.status] }}</span>
                  </div>
                  @if (apt.status === 'CONFIRMED') {
                    <div class="mt-3 flex gap-4">
                      <button type="button" (click)="startReschedule(apt)" class="btn-link text-coral">Reprogramar</button>
                      <button type="button" (click)="cancelAppointment(apt)" class="btn-link text-muted">Cancelar</button>
                    </div>
                  }
                </li>
              }
            </ul>
          }
        </aside>
      </div>
    </main>

    @if (modal(); as m) {
      <div class="fixed inset-0 z-30 flex items-center justify-center bg-espresso/50 p-4" role="dialog" aria-modal="true">
        <div class="w-full max-w-sm rounded-4xl bg-white p-8 text-center">
          <span class="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full text-xl"
                [class]="m.type === 'success' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'" aria-hidden="true">
            {{ m.type === 'success' ? '✓' : '!' }}
          </span>
          <h3 class="text-2xl">{{ m.title }}</h3>
          <p class="mt-2">{{ m.message }}</p>
          <button (click)="modal.set(null)" class="btn-dark mt-6 w-full">Entendido</button>
        </div>
      </div>
    }
  `,
})
export class BookingComponent implements OnInit {
  private api = inject(AppointmentService);
  private router = inject(Router);
  auth = inject(AuthService);

  readonly statusLabel = STATUS_LABEL;
  readonly badgeClass: Record<AppointmentStatus, string> = {
    CONFIRMED: 'badge-confirmed',
    ARRIVED: 'badge-arrived',
    COMPLETED: 'badge-completed',
    CANCELLED: 'badge-cancelled',
  };
  today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local
  doctors = signal<Doctor[]>([]);
  activeDoctors = computed(() => this.doctors().filter((d) => d.is_active));
  doctorId = signal<number | null>(null);
  date = signal<string>(this.today);
  slots = signal<Slot[]>([]);
  selected = signal<Slot | null>(null);
  loadingSlots = signal(false);
  submitting = signal(false);
  modal = signal<ModalState | null>(null);
  loadingMine = signal(false);
  myAppointments = signal<MyAppointment[]>([]);
  rescheduling = signal<MyAppointment | null>(null);

  ngOnInit(): void {
    this.api.getDoctors().subscribe({
      next: (list) => {
        this.doctors.set(list);
        const first = this.activeDoctors()[0];
        if (first) this.onDoctorChange(first.id);
      },
      error: () => this.showError('Sin conexión', 'No pudimos cargar los médicos. Intenta de nuevo.'),
    });
    this.loadMyAppointments();
  }

  onDoctorChange(id: number): void {
    this.doctorId.set(id);
    this.loadSlots();
  }

  onDateChange(value: string): void {
    this.date.set(value);
    this.loadSlots();
  }

  hhmm(iso: string): string {
    return iso ? iso.substring(11, 16) : '';
  }

  ymd(iso: string): string {
    return iso ? iso.substring(0, 10) : '';
  }

  loadSlots(): void {
    const id = this.doctorId();
    const date = this.date();
    this.selected.set(null);
    if (!id || !date) return;
    this.loadingSlots.set(true);
    this.api.getAvailableSlots(id, date).subscribe({
      next: (s) => {
        this.slots.set(s);
        this.loadingSlots.set(false);
      },
      error: () => {
        this.slots.set([]);
        this.loadingSlots.set(false);
      },
    });
  }

  loadMyAppointments(): void {
    this.loadingMine.set(true);
    this.api.getMyAppointments().subscribe({
      next: (list) => {
        this.myAppointments.set(list);
        this.loadingMine.set(false);
      },
      error: (err) => {
        this.loadingMine.set(false);
        if (err.status === 401) this.logout();
      },
    });
  }

  cancelAppointment(apt: MyAppointment): void {
    if (!confirm(`¿Cancelar tu hora del ${this.ymd(apt.start_time)} a las ${this.hhmm(apt.start_time)}?`)) return;
    this.api.cancelAppointment(apt.id).subscribe({
      next: () => {
        this.modal.set({ type: 'success', title: 'Reserva cancelada', message: 'El bloque quedó libre para otro paciente.' });
        if (this.rescheduling()?.id === apt.id) this.stopReschedule();
        this.loadMyAppointments();
        this.loadSlots();
      },
      error: (err) => this.showError('No se pudo cancelar', err.error?.detail),
    });
  }

  /** VET-11: entra en modo reprogramación con el médico de la cita fijo. */
  startReschedule(apt: MyAppointment): void {
    this.rescheduling.set(apt);
    this.date.set(this.ymd(apt.start_time) < this.today ? this.today : this.ymd(apt.start_time));
    this.onDoctorChange(apt.doctor_id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  stopReschedule(): void {
    this.rescheduling.set(null);
    this.loadSlots();
  }

  confirm(): void {
    const slot = this.selected();
    const id = this.doctorId();
    if (!slot || !id) return;
    const target = this.rescheduling();
    this.submitting.set(true);

    const request$ = target ? this.api.rescheduleAppointment(target.id, slot) : this.api.reserve(id, slot);
    request$.subscribe({
      next: () => {
        this.submitting.set(false);
        this.modal.set({
          type: 'success',
          title: target ? 'Hora reprogramada' : 'Reserva confirmada',
          message: `Te esperamos el ${this.date()} a las ${this.hhmm(slot.start_time)}. Te enviamos la confirmación por correo.`,
        });
        this.rescheduling.set(null);
        this.loadSlots();
        this.loadMyAppointments();
      },
      error: (err) => {
        this.submitting.set(false);
        if (err.status === 409) {
          this.showError(
            'Esa hora ya fue tomada',
            'Otra persona reservó este bloque hace un momento. Actualizamos los horarios para que elijas otro.',
          );
          this.loadSlots();
        } else if (err.status === 401) {
          this.logout();
        } else {
          this.showError('No pudimos guardar', err.error?.detail);
        }
      },
    });
  }

  private showError(title: string, detail?: unknown): void {
    const message = typeof detail === 'string' ? detail : 'Ocurrió un error inesperado. Intenta de nuevo.';
    this.modal.set({ type: 'error', title, message });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
