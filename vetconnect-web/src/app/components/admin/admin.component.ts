import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService, DashboardStats } from '../../services/admin.service';
import { Doctor } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { TopbarComponent } from '../topbar/topbar.component';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
}

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, TopbarComponent],
  selector: 'app-admin',
  template: `
    <app-topbar />

    <main class="page space-y-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="eyebrow">Administración</p>
          <h1 class="text-4xl sm:text-5xl">Panel de la <span class="text-coral">clínica</span></h1>
        </div>
        <p class="text-sm">Clínica Veterinaria San Francisco · Talca</p>
      </div>

      <!-- VET-16: indicadores para el director -->
      <section class="card">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <h2 class="text-2xl">Indicadores de atención</h2>
          <div class="flex flex-wrap items-end gap-3">
            <div>
              <label for="dFrom" class="label">Desde</label>
              <input id="dFrom" type="date" [(ngModel)]="dateFrom" class="input py-2" />
            </div>
            <div>
              <label for="dTo" class="label">Hasta</label>
              <input id="dTo" type="date" [(ngModel)]="dateTo" class="input py-2" />
            </div>
            <button (click)="loadStats()" class="btn-dark">Actualizar</button>
          </div>
        </div>

        @if (statsError()) {
          <p class="alert-error mt-4">{{ statsError() }}</p>
        } @else if (stats(); as s) {
          <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div class="rounded-2xl bg-cream p-5">
              <p class="text-sm">Citas en el periodo</p>
              <p class="mt-2 text-4xl text-espresso">{{ s.total }}</p>
            </div>
            <div class="rounded-2xl bg-cream p-5">
              <p class="text-sm">Atendidas</p>
              <p class="mt-2 text-4xl text-espresso">{{ s.attended }}</p>
            </div>
            <div class="rounded-2xl bg-espresso p-5">
              <p class="text-sm text-cream/80">Inasistencia (no-show)</p>
              <p class="mt-2 text-4xl" [class]="s.no_show_rate_pct > 15 ? 'text-coral' : 'text-cream'">{{ s.no_show_rate_pct }}%</p>
              <p class="mt-1 text-xs text-muted-light">{{ s.no_show }} citas sin llegada · meta ≤ 15%</p>
            </div>
            <div class="rounded-2xl bg-cream p-5">
              <p class="text-sm">Cancelaciones</p>
              <p class="mt-2 text-4xl text-espresso">{{ s.cancellation_rate_pct }}%</p>
              <p class="mt-1 text-xs">{{ s.by_status.CANCELLED }} canceladas a tiempo</p>
            </div>
          </div>

          <h3 class="mb-3 mt-8 text-lg">Ocupación de boxes</h3>
          <div class="space-y-4">
            @for (o of s.occupancy; track o.doctor_id) {
              <div>
                <div class="flex justify-between text-sm">
                  <span class="text-espresso">Box {{ o.box_number }} · {{ o.doctor_name }}</span>
                  <span>{{ o.occupancy_pct }}% ({{ o.booked_slots }}/{{ o.available_slots }} bloques)</span>
                </div>
                <div class="mt-2 h-2.5 w-full rounded-full bg-cream-deep" role="progressbar"
                     [attr.aria-valuenow]="o.occupancy_pct" aria-valuemin="0" aria-valuemax="100">
                  <div class="h-2.5 rounded-full bg-coral" [style.width.%]="o.occupancy_pct > 100 ? 100 : o.occupancy_pct"></div>
                </div>
              </div>
            } @empty {
              <p class="text-sm">Sin médicos activos.</p>
            }
          </div>
        } @else {
          <p class="mt-4 text-sm">Cargando indicadores…</p>
        }
      </section>

      <!-- VET-07: médicos -->
      <section class="card">
        <h2 class="card-title">Médicos registrados</h2>
        <div class="overflow-x-auto">
          <table class="table">
            <thead>
              <tr>
                <th>Nombre</th><th>Correo</th><th>Especialidad</th><th>Box</th><th>Teléfono</th><th>Estado</th><th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (doc of doctors(); track doc.id) {
                <tr [class]="editingId() === doc.id ? 'bg-coral-soft/40' : ''">
                  <td class="text-espresso">{{ doc.full_name }}</td>
                  <td>{{ doc.email }}</td>
                  <td>{{ doc.specialty }}</td>
                  <td>{{ doc.box_number }}</td>
                  <td>{{ doc.phone || '-' }}</td>
                  <td><span [class]="doc.is_active ? 'badge-completed' : 'badge-cancelled'">{{ doc.is_active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="text-right"><button (click)="edit(doc)" class="btn-link text-coral">Editar</button></td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="text-center">No hay médicos registrados</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">{{ editingId() ? 'Editar médico' : 'Registrar nuevo médico' }}</h2>

        @if (feedback(); as f) {
          <p role="alert" class="mb-4" [class]="f.ok ? 'alert-success' : 'alert-error'">{{ f.text }}</p>
        }

        <form [formGroup]="form" (ngSubmit)="submit()" class="grid gap-4 sm:grid-cols-2" novalidate>
          <div>
            <label for="fullName" class="label">Nombre completo</label>
            <input id="fullName" formControlName="full_name" class="input" />
            @if (invalid('full_name')) { <p class="field-error">Mínimo 3 caracteres.</p> }
          </div>
          <div>
            <label for="specialty" class="label">Especialidad</label>
            <input id="specialty" formControlName="specialty" class="input" />
            @if (invalid('specialty')) { <p class="field-error">La especialidad es obligatoria.</p> }
          </div>
          <div>
            <label for="email" class="label">Correo electrónico</label>
            <input id="email" type="email" formControlName="email" class="input" />
            @if (invalid('email')) { <p class="field-error">Ingresa un correo válido.</p> }
          </div>
          <div>
            <label for="box" class="label">Número de box</label>
            <input id="box" type="number" min="1" formControlName="box_number" class="input" />
            @if (invalid('box_number')) { <p class="field-error">Ingresa un box válido (1 o más).</p> }
          </div>
          <div>
            <label for="phone" class="label">Teléfono</label>
            <input id="phone" formControlName="phone" class="input" />
          </div>
          <div>
            <label for="active" class="label">Disponibilidad</label>
            <select id="active" formControlName="is_active" class="input">
              <option [ngValue]="true">Activo</option>
              <option [ngValue]="false">Inactivo</option>
            </select>
          </div>
          <div>
            <label for="password" class="label">
              Contraseña {{ editingId() ? '(dejar vacío para mantener la actual)' : '' }}
            </label>
            <input id="password" type="password" formControlName="password" autocomplete="new-password" class="input" />
            @if (invalid('password')) { <p class="field-error">Mínimo 6 caracteres.</p> }
          </div>
          <div class="flex items-end gap-3">
            <button type="submit" [disabled]="saving()" class="btn-primary flex-1 py-3">
              {{ editingId() ? 'Guardar cambios' : 'Registrar médico' }}
            </button>
            @if (editingId()) {
              <button type="button" (click)="resetForm()" class="btn-ghost py-3">Cancelar</button>
            }
          </div>
        </form>
      </section>
    </main>
  `,
})
export class AdminComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private admin = inject(AdminService);
  private fb = inject(FormBuilder);

  doctors = signal<Doctor[]>([]);
  editingId = signal<number | null>(null);
  saving = signal(false);
  feedback = signal<{ ok: boolean; text: string } | null>(null);

  stats = signal<DashboardStats | null>(null);
  statsError = signal('');
  dateFrom = isoDaysAgo(30);
  dateTo = isoDaysAgo(0);

  form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(3)]],
    specialty: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    box_number: [1, [Validators.required, Validators.min(1)]],
    phone: [''],
    is_active: [true],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  ngOnInit(): void {
    this.loadDoctors();
    this.loadStats();
  }

  loadDoctors(): void {
    this.admin.getDoctors().subscribe({ next: (list) => this.doctors.set(list) });
  }

  loadStats(): void {
    this.statsError.set('');
    this.admin.getDashboardStats(this.dateFrom, this.dateTo).subscribe({
      next: (s) => this.stats.set(s),
      error: (err) => {
        if (err.status === 401 || err.status === 403) this.logout();
        this.statsError.set(typeof err.error?.detail === 'string' ? err.error.detail : 'No se pudieron cargar los indicadores.');
      },
    });
  }

  invalid(name: 'full_name' | 'specialty' | 'email' | 'box_number' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.touched && c.invalid;
  }

  edit(doc: Doctor): void {
    this.editingId.set(doc.id);
    this.feedback.set(null);
    this.form.reset({
      full_name: doc.full_name,
      specialty: doc.specialty,
      email: doc.email,
      box_number: doc.box_number,
      phone: doc.phone,
      is_active: doc.is_active,
      password: '',
    });
    this.form.controls.email.disable(); // el correo identifica al usuario: no se edita
    this.form.controls.password.setValidators([Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
  }

  resetForm(): void {
    this.editingId.set(null);
    this.form.reset();
    this.form.controls.email.enable();
    this.form.controls.password.setValidators([Validators.required, Validators.minLength(6)]);
    this.form.controls.password.updateValueAndValidity();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password, ...rest } = this.form.getRawValue();
    const id = this.editingId();
    const request$ = id
      ? this.admin.updateDoctor(id, password ? { ...rest, password } : rest)
      : this.admin.createDoctor({ ...rest, email, password });

    this.saving.set(true);
    request$.subscribe({
      next: () => {
        this.saving.set(false);
        this.feedback.set({ ok: true, text: id ? 'Médico actualizado correctamente.' : 'Médico registrado correctamente.' });
        this.resetForm();
        this.loadDoctors();
        this.loadStats();
      },
      error: (err) => {
        this.saving.set(false);
        const detail = err.error?.detail;
        this.feedback.set({ ok: false, text: typeof detail === 'string' ? detail : 'Revisa los datos e intenta de nuevo.' });
      },
    });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
