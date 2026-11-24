import { Component, HostListener, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import {
  AppointmentDetail,
  AppointmentService,
  AppointmentStatus,
  MedicalRecordInput,
} from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { DraftService } from '../../services/draft.service';

interface Toast {
  type: 'success' | 'error' | 'info';
  message: string;
}

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

function emptyRecord(): MedicalRecordInput {
  return {
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

@Component({
  standalone: true,
  imports: [FormsModule],
  selector: 'app-vet-dashboard',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="mx-auto max-w-6xl">
        <header class="mb-6 flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold text-pine">Ficha Clínica Digital</h2>
            <p class="text-slate-600">Clínica Veterinaria San Francisco · {{ auth.getFullName() }}</p>
          </div>
          <button (click)="logout()"
                  class="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50">
            Cerrar sesión
          </button>
        </header>

        <!-- VET-17: estado de conexión -->
        @if (!online()) {
          <p role="status" class="mb-4 rounded-md border border-amber-vet bg-amber-50 px-4 py-3 text-sm text-ink">
            Sin conexión a internet. Lo que escribas se guarda como borrador en este equipo y se enviará
            automáticamente al volver la conexión.
          </p>
        } @else if (pendingCount() > 0) {
          <p role="status" class="mb-4 rounded-md border border-pine bg-white px-4 py-3 text-sm">
            Sincronizando {{ pendingCount() }} ficha(s) guardadas sin conexión…
          </p>
        }

        @if (toast(); as t) {
          <p role="alert" class="mb-4 rounded-md px-4 py-3 text-sm"
             [class]="t.type === 'success' ? 'bg-green-50 text-green-800' : t.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-white text-slate-700'">
            {{ t.message }}
          </p>
        }

        <div class="mb-6 flex items-end gap-3">
          <div>
            <label for="agendaDate" class="mb-1 block text-sm font-medium">Fecha de la agenda</label>
            <input id="agendaDate" type="date" [ngModel]="date()" (ngModelChange)="date.set($event); loadAppointments()"
                   class="rounded-md border border-slate-300 bg-white px-3 py-2.5" />
          </div>
        </div>

        <div class="rounded-lg bg-white p-6 shadow-sm">
          <h3 class="mb-4 font-bold text-pine">Citas del día</h3>
          @if (loading()) {
            <p class="text-slate-600">Cargando citas…</p>
          } @else if (appointments().length === 0) {
            <p class="py-8 text-center text-slate-600">No hay citas programadas para esta fecha.</p>
          } @else {
            <div class="space-y-6">
              @for (apt of appointments(); track apt.id) {
                <article class="rounded-md border border-slate-300 p-5">
                  <div class="flex items-start justify-between border-b border-slate-100 pb-3">
                    <div>
                      <p class="font-medium text-pine">{{ hhmm(apt.start_time) }} – {{ hhmm(apt.end_time) }} · Box {{ apt.box_number }}</p>
                      <p class="text-xs text-slate-500">Cita #{{ apt.id }} · Tutor: {{ apt.tutor_name }} ({{ apt.tutor_email }})</p>
                      @if (draftInfo()[apt.id]; as info) {
                        <p class="mt-1 text-xs text-amber-700">{{ info }}</p>
                      }
                    </div>
                    <span class="rounded px-2.5 py-1 text-xs font-medium" [class]="statusClass[apt.status]">
                      {{ statusLabel[apt.status] }}
                    </span>
                  </div>

                  @if (apt.status === 'CANCELLED') {
                    <p class="mt-4 text-sm text-slate-500">Cita cancelada: no requiere ficha.</p>
                  } @else {
                    <div class="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label class="mb-1 block text-sm font-medium" [for]="'pet' + apt.id">Mascota</label>
                        <input [id]="'pet' + apt.id" type="text" placeholder="Ej: Toby"
                               class="w-full rounded-md border border-slate-300 px-3 py-2.5"
                               [(ngModel)]="records[apt.id].pet_name" (ngModelChange)="onEdit(apt.id)" />
                      </div>
                      <div class="grid grid-cols-2 gap-4">
                        <div>
                          <label class="mb-1 block text-sm font-medium" [for]="'sp' + apt.id">Especie</label>
                          <select [id]="'sp' + apt.id" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5"
                                  [(ngModel)]="records[apt.id].species" (ngModelChange)="onEdit(apt.id)">
                            <option value="Canino">Canino</option>
                            <option value="Felino">Felino</option>
                            <option value="Otro">Otro</option>
                          </select>
                        </div>
                        <div>
                          <label class="mb-1 block text-sm font-medium" [for]="'kg' + apt.id">Peso (kg)</label>
                          <input [id]="'kg' + apt.id" type="number" min="0.1" step="0.1"
                                 class="w-full rounded-md border border-slate-300 px-3 py-2.5"
                                 [(ngModel)]="records[apt.id].weight_kg" (ngModelChange)="onEdit(apt.id)" />
                        </div>
                      </div>
                      @for (f of textFields; track f.key) {
                        <div>
                          <label class="mb-1 block text-sm font-medium" [for]="f.key + apt.id">{{ f.label }}</label>
                          <textarea [id]="f.key + apt.id" rows="2" [placeholder]="f.placeholder"
                                    class="w-full resize-none rounded-md border border-slate-300 px-3 py-2.5"
                                    [(ngModel)]="records[apt.id][f.key]" (ngModelChange)="onEdit(apt.id)"></textarea>
                        </div>
                      }
                    </div>

                    <div class="mt-6 flex gap-3">
                      <button (click)="save(apt.id)" [disabled]="saving() === apt.id"
                              class="flex-1 rounded-md bg-pine px-4 py-2.5 font-medium text-white hover:bg-pine-dark disabled:opacity-60">
                        {{ saving() === apt.id ? 'Guardando…' : 'Guardar ficha clínica' }}
                      </button>
                      <button (click)="downloadPdf(apt.id)" [disabled]="!apt.has_medical_record || !online()"
                              [title]="apt.has_medical_record ? '' : 'Guarda la ficha primero'"
                              class="rounded-md bg-amber-vet px-4 py-2.5 font-medium text-ink hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50">
                        Emitir receta PDF
                      </button>
                    </div>
                  }
                </article>
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
  private drafts = inject(DraftService);
  private router = inject(Router);
  auth = inject(AuthService);

  readonly statusLabel = STATUS_LABEL;
  readonly statusClass = STATUS_CLASS;
  readonly textFields: { key: Exclude<keyof MedicalRecordInput, 'pet_name' | 'species' | 'weight_kg'>; label: string; placeholder: string }[] = [
    { key: 'antecedents', label: 'Antecedentes', placeholder: 'Antecedentes médicos relevantes…' },
    { key: 'vaccines', label: 'Vacunas', placeholder: 'Vacunas al día…' },
    { key: 'diagnosis', label: 'Diagnóstico', placeholder: 'Diagnóstico clínico…' },
    { key: 'treatment', label: 'Tratamiento', placeholder: 'Tratamiento a seguir…' },
    { key: 'prescription', label: 'Receta / dosis', placeholder: 'Medicamentos, dosis y frecuencia…' },
  ];

  date = signal(new Date().toLocaleDateString('en-CA'));
  appointments = signal<AppointmentDetail[]>([]);
  records: Record<number, MedicalRecordInput> = {};
  draftInfo = signal<Record<number, string>>({});
  loading = signal(false);
  saving = signal<number | null>(null);
  online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  pendingCount = signal(0);
  toast = signal<Toast | null>(null);

  ngOnInit(): void {
    this.loadAppointments();
    this.syncPending();
  }

  @HostListener('window:online')
  onOnline(): void {
    this.online.set(true);
    this.syncPending();
  }

  @HostListener('window:offline')
  onOffline(): void {
    this.online.set(false);
  }

  loadAppointments(): void {
    this.loading.set(true);
    this.api.getDailyAgenda(this.date()).subscribe({
      next: (list) => {
        this.appointments.set(list);
        list.forEach((apt) => this.prepareRecord(apt));
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        if (err.status === 401) this.logout();
        else this.show('error', 'No se pudo cargar la agenda. Si estás sin conexión, se mostrarán tus borradores al reconectar.');
      },
    });
  }

  /** Prioridad: borrador local pendiente > ficha del servidor > borrador local > formulario vacío. */
  private prepareRecord(apt: AppointmentDetail): void {
    const draft = this.drafts.load(apt.id);
    this.records[apt.id] = draft ? { ...draft.data } : this.records[apt.id] ?? emptyRecord();
    if (draft) this.setDraftInfo(apt.id, draft.pendingSync ? 'Borrador local pendiente de envío.' : 'Borrador local restaurado.');
    if (apt.has_medical_record && !draft?.pendingSync) {
      this.api.getMedicalRecord(apt.id).subscribe((record) => {
        if (!record) return;
        const { id, appointment_id, updated_at, ...data } = record;
        if (!draft || new Date(updated_at) >= new Date(draft.savedAt)) {
          this.records[apt.id] = data;
          this.drafts.clear(apt.id);
          this.setDraftInfo(apt.id, '');
        }
      });
    }
  }

  onEdit(appointmentId: number): void {
    const pending = this.drafts.load(appointmentId)?.pendingSync ?? false;
    this.drafts.save(appointmentId, this.records[appointmentId], pending || !this.online());
    this.setDraftInfo(appointmentId, 'Borrador guardado en este equipo.');
  }

  save(appointmentId: number): void {
    const record = this.records[appointmentId];
    if (!record.pet_name.trim() || !(record.weight_kg > 0)) {
      this.show('error', 'Ingresa al menos el nombre de la mascota y un peso mayor a 0.');
      return;
    }
    if (!this.online()) {
      this.keepOffline(appointmentId);
      return;
    }
    this.saving.set(appointmentId);
    this.api.saveMedicalRecord(appointmentId, record).subscribe({
      next: () => {
        this.saving.set(null);
        this.drafts.clear(appointmentId);
        this.setDraftInfo(appointmentId, '');
        this.show('success', `Ficha de la cita #${appointmentId} guardada.`);
        this.loadAppointments();
      },
      error: (err) => {
        this.saving.set(null);
        if (err.status === 0) this.keepOffline(appointmentId);
        else this.show('error', err.error?.detail?.[0]?.msg ?? err.error?.detail ?? 'No se pudo guardar la ficha clínica.');
      },
    });
  }

  private keepOffline(appointmentId: number): void {
    this.drafts.save(appointmentId, this.records[appointmentId], true);
    this.setDraftInfo(appointmentId, 'Borrador local pendiente de envío.');
    this.pendingCount.set(this.drafts.pendingIds().length);
    this.show('info', 'Sin conexión: la ficha quedó guardada en este equipo y se enviará al reconectar.');
  }

  /** Reenvía las fichas que quedaron pendientes por falta de conexión. */
  syncPending(): void {
    const ids = this.drafts.pendingIds();
    this.pendingCount.set(ids.length);
    if (!ids.length || !this.online()) return;
    forkJoin(ids.map((id) => this.api.saveMedicalRecord(id, this.drafts.load(id)!.data))).subscribe({
      next: () => {
        ids.forEach((id) => {
          this.drafts.clear(id);
          this.setDraftInfo(id, '');
        });
        this.pendingCount.set(0);
        this.show('success', `${ids.length} ficha(s) guardadas sin conexión se sincronizaron.`);
        this.loadAppointments();
      },
      error: () => this.pendingCount.set(this.drafts.pendingIds().length),
    });
  }

  downloadPdf(appointmentId: number): void {
    this.api.downloadPrescriptionPdf(appointmentId).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `receta_cita_${appointmentId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.show('error', 'No se pudo generar la receta. Guarda la ficha primero.'),
    });
  }

  hhmm(iso: string): string {
    return iso ? iso.substring(11, 16) : '--:--';
  }

  private setDraftInfo(id: number, text: string): void {
    this.draftInfo.update((m) => ({ ...m, [id]: text }));
  }

  private show(type: Toast['type'], message: string): void {
    this.toast.set({ type, message });
    setTimeout(() => this.toast()?.message === message && this.toast.set(null), 5000);
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
