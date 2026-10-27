import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AppointmentService, Doctor, Slot, AppointmentDetail, NotificationLog } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';

interface ModalState {
  type: 'success' | 'error';
  title: string;
  message: string;
}

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
      <h1 class="text-2xl font-bold">Reservar una hora</h1>
      <p class="mt-1 text-slate-600">Elige médico y fecha. Solo ves los bloques que están libres.</p>

      <!-- Sección: Mis reservas (solo para TUTOR) -->
      @if (auth.getRole() === 'TUTOR') {
        <div class="mt-6 p-4 rounded-md bg-pine-soft border border-pine mb-6">
          <h2 class="font-semibold text-sm text-pine mb-3">Mis reservas</h2>
          @if (!loadingMyAppointments()) {
            @if (myAppointments().length === 0) {
              <p class="text-slate-600 text-sm">No tienes reservas activas.</p>
            } @else {
              <div class="space-y-2 max-h-40 overflow-y-auto">
                @for (apt of myAppointments(); track apt.id) {
                  <div class="p-3 rounded-md border border-slate-300 bg-white transition">
                    <div class="flex justify-between items-start">
                      <span class="font-medium text-sm">{{ apt.doctor_name }}</span>
                      <span class="text-xs text-slate-500">{{ hhmm(apt.start_time) }} - {{ hhmm(apt.end_time) }}</span>
                    </div>
                    <p class="text-capitalize text-sm mt-1">{{ apt.status }}</p>
                    <div class="mt-2 flex gap-2">
                      @if (apt.status === 'CONFIRMED' || apt.status === 'ARRIVED') {
                        <button
                          type="button"
                          (click)="cancelAppointment(apt.id)"
                          class="text-red-600 text-sm hover:underline">Cancelar</button>
                        <button
                          type="button"
                          (click)="rescheduleAppointment(apt.id)"
                          class="text-amber-vet text-sm hover:underline">Reprogramar</button>
                      }
                    </div>
                  </div>
                }
              </div>
            }
          } @else {
            <p class="text-slate-600 text-sm">Cargando…</p>
          }
        </div>
      }

      <div class="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label for="doctor" class="mb-1 block text-sm font-medium">Médico veterinario</label>
          <select id="doctor" [ngModel]="doctorId()" (ngModelChange)="onDoctorChange($event)"
                  class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5">
            <option [ngValue]="null" disabled>Selecciona un médico</option>
            @for (d of doctors(); track d.id) {
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
        {{ submitting() ? 'Reservando…' : 'Confirmar reserva' }}
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

  today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD en hora local
  doctors = signal<Doctor[]>([]);
  doctorId = signal<number | null>(null);
  date = signal<string>(this.today);
  slots = signal<Slot[]>([]);
  selected = signal<Slot | null>(null);
  loadingSlots = signal(false);
  submitting = signal(false);
  modal = signal<ModalState | null>(null);
  loadingMyAppointments = signal(false);
  myAppointments = signal<AppointmentDetail[]>([]);

  ngOnInit(): void {
    this.api.getDoctors().subscribe({
      next: (list) => {
        this.doctors.set(list);
        if (list.length) this.onDoctorChange(list[0].id);
      },
      error: (e) => e.status === 401 && this.logout(),
    });
    // Cargar reservas del tutor al iniciar
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
    return iso.substring(11, 16);
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

  // Cargar mis reservas del tutor
  loadMyAppointments(): void {
    if (this.auth.getRole() !== 'TUTOR') return;
    this.loadingMyAppointments.set(true);
    this.api.getMyAppointments().subscribe({
      next: (appointments) => {
        this.myAppointments.set(appointments);
        this.loadingMyAppointments.set(false);
      },
      error: () => {
        this.myAppointments.set([]);
        this.loadingMyAppointments.set(false);
      },
    });
  }

  cancelAppointment(id: number): void {
    this.api.cancelAppointment(id).subscribe({
      next: () => {
        this.modal.set({
          type: 'success',
          title: 'Reserva cancelada',
          message: 'La cita ha sido cancelada exitosamente.',
        });
        this.loadMyAppointments();
      },
      error: (err) => {
        this.modal.set({
          type: 'error',
          title: 'Error al cancelar',
          message: err.error?.detail ?? 'Ocurrió un error inesperado.',
        });
      },
    });
  }

  rescheduleAppointment(id: number): void {
    // Implementar reprogramación si es necesario
    this.modal.set({
      type: 'error',
      title: 'Reprogramar',
      message: 'La funcionalidad de reprogramación estará disponible pronto.',
    });
  }

  confirm(): void {
    const slot = this.selected();
    const id = this.doctorId();
    if (!slot || !id) return;

    this.submitting.set(true);
    this.api.reserve(id, slot).subscribe({
      next: () => {
        this.submitting.set(false);
        this.modal.set({
          type: 'success',
          title: 'Reserva confirmada',
          message: `Te esperamos el ${this.date()} a las ${this.hhmm(slot.start_time)}.`,
        });
        this.loadSlots();
        // Recargar mis reservas después de confirmar
        this.loadMyAppointments();
      },
      error: (err) => {
        this.submitting.set(false);
        if (err.status === 409) {
          this.modal.set({
            type: 'error',
            title: 'Esa hora ya fue tomada',
            message: 'Otra persona reservó este bloque hace un momento. Actualizamos los horarios para que elijas otro.',
          });
          this.loadSlots();
        } else if (err.status === 401) {
          this.logout();
        } else {
          this.modal.set({
            type: 'error',
            title: 'No pudimos reservar',
            message: err.error?.detail ?? 'Ocurrió un error inesperado. Intenta de nuevo.',
          });
        }
      },
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}