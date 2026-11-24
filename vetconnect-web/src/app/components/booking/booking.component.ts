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
  imports: [FormsModule],
  template: `
    <header class="flex items-center justify-between bg-pine px-6 py-4 text-white">
      <p class="font-semibold">VetConnect Maule</p>
      <div class="flex items-center gap-4 text-sm">
        <span>{{ auth.getFullName() }}</span>
        <button (click)="logout()" class="rounded border border-white/40 px-3 py-1 hover:bg-white/10">Cerrar sesión</button>
      </div>
    </header>

    <main class="mx-auto max-w-3xl p-6">
      <h1 class="text-2xl font-bold">{{ rescheduling() ? 'Reprogramar mi hora' : 'Reservar una hora' }}</h1>
      <p class="mt-1 text-slate-600">Elige médico y fecha. Solo ves los bloques que están libres.</p>

      <section class="mt-6 rounded-md border border-pine bg-pine-soft p-4">
        <h2 class="mb-3 text-sm font-semibold text-pine">Mis reservas</h2>
        @if (loadingMine()) {
          <p class="text-sm text-slate-600">Cargando…</p>
        } @else if (myAppointments().length === 0) {
          <p class="text-sm text-slate-600">Aún no tienes reservas.</p>
        } @else {
          <ul class="max-h-56 space-y-2 overflow-y-auto">
            @for (apt of myAppointments(); track apt.id) {
              <li class="rounded-md border border-slate-300 bg-white p-3">
                <div class="flex items-start justify-between gap-2">
                  <span class="text-sm font-medium">{{ apt.doctor_name }} · box {{ apt.box_number }}</span>
                  <span class="text-xs font-medium text-slate-500">
                    {{ ymd(apt.start_time) }} | {{ hhmm(apt.start_time) }}–{{ hhmm(apt.end_time) }}
                  </span>
                </div>
                <p class="mt-1 text-sm font-semibold" [class]="apt.status === 'CONFIRMED' ? 'text-green-700' : 'text-slate-600'">
                  {{ statusLabel[apt.status] }}
                </p>
                @if (apt.status === 'CONFIRMED') {
                  <div class="mt-2 flex gap-4">
                    <button type="button" (click)="cancelAppointment(apt)" class="text-sm text-red-700 hover:underline">Cancelar</button>
                    <button type="button" (click)="startReschedule(apt)" class="text-sm text-pine hover:underline">Reprogramar</button>
                  </div>
                }
              </li>
            }
          </ul>
        }
      </section>

      @if (rescheduling(); as r) {
        <div role="status" class="mt-6 flex items-center justify-between rounded-md border border-amber-vet bg-amber-50 p-4 text-sm">
          <span>
            Reprogramando la cita del <strong>{{ ymd(r.start_time) }} a las {{ hhmm(r.start_time) }}</strong>
            con {{ r.doctor_name }}. Elige un nuevo bloque.
          </span>
          <button type="button" (click)="stopReschedule()" class="ml-4 shrink-0 font-medium text-slate-700 underline">Volver</button>
        </div>
      }

      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label for="doctor" class="mb-1 block text-sm font-medium">Médico veterinario</label>
          <select id="doctor" [ngModel]="doctorId()" (ngModelChange)="onDoctorChange($event)" [disabled]="!!rescheduling()"
                  class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 disabled:bg-slate-100">
            <option [ngValue]="null" disabled>Selecciona un médico</option>
            @for (d of activeDoctors(); track d.id) {
              <option [ngValue]="d.id">{{ d.full_name }} · {{ d.specialty }} (box {{ d.box_number }})</option>
            }
          </select>
        </div>
        <div>
          <label for="date" class="mb-1 block text-sm font-medium">Fecha</label>
          <input id="date" type="date" [min]="today" [ngModel]="date()" (ngModelChange)="onDateChange($event)"
                 class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5" />
        </div>
      </div>

      <section class="mt-8" aria-live="polite">
        <h2 class="mb-3 font-semibold">Horarios disponibles</h2>
        @if (!doctorId() || !date()) {
          <p class="text-slate-600">Selecciona un médico y una fecha para ver los horarios.</p>
        } @else if (loadingSlots()) {
          <p class="text-slate-600">Buscando horarios…</p>
        } @else if (slots().length === 0) {
          <p class="rounded-md bg-white p-4 text-slate-700">No quedan horas libres este día. Prueba con otra fecha.</p>
        } @else {
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            @for (s of slots(); track s.start_time) {
              <button type="button" (click)="selected.set(s)"
                      [attr.aria-pressed]="selected()?.start_time === s.start_time"
                      class="rounded-md border px-2 py-2.5 text-sm font-medium transition"
                      [class]="selected()?.start_time === s.start_time
                        ? 'border-pine bg-pine text-white'
                        : 'border-slate-300 bg-white hover:border-pine hover:bg-pine-soft'">
                {{ hhmm(s.start_time) }}
              </button>
            }
          </div>
        }
      </section>

      <button type="button" (click)="confirm()" [disabled]="!selected() || submitting()"
              class="mt-8 w-full rounded-md bg-amber-vet px-4 py-3 font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
        {{ submitting() ? 'Guardando…' : rescheduling() ? 'Confirmar nuevo horario' : 'Confirmar reserva' }}
      </button>
    </main>

    @if (modal(); as m) {
      <div class="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
        <div class="w-full max-w-sm rounded-lg border-t-8 bg-white p-6 shadow-xl"
             [class]="m.type === 'success' ? 'border-green-600' : 'border-red-600'">
          <h3 class="text-lg font-bold" [class]="m.type === 'success' ? 'text-green-800' : 'text-red-800'">{{ m.title }}</h3>
          <p class="mt-2 text-slate-700">{{ m.message }}</p>
          <button (click)="modal.set(null)"
                  class="mt-5 w-full rounded-md px-4 py-2 font-semibold text-white"
                  [class]="m.type === 'success' ? 'bg-green-700 hover:bg-green-800' : 'bg-red-700 hover:bg-red-800'">
            Entendido
          </button>
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
