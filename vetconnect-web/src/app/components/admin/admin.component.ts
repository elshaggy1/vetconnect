import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminService, DashboardStats } from '../../services/admin.service';
import { Doctor } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
}

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule],
  selector: 'app-admin',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="mx-auto max-w-6xl space-y-8">
        <header class="flex items-center justify-between">
          <div>
            <h2 class="text-3xl font-bold text-pine">Panel de Administración</h2>
            <p class="mt-1 text-slate-600">Clínica Veterinaria San Francisco · Talca</p>
          </div>
          <button (click)="logout()"
                  class="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50">
            Cerrar sesión
          </button>
        </header>

        <!-- VET-16: indicadores para el director -->
        <div class="rounded-lg bg-white p-6 shadow-sm">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <h3 class="text-lg font-semibold text-pine">Indicadores de atención</h3>
            <div class="flex flex-wrap items-end gap-3 text-sm">
              <label>Desde
                <input type="date" [(ngModel)]="dateFrom" class="ml-1 rounded-md border border-slate-300 px-2 py-1.5" />
              </label>
              <label>Hasta
                <input type="date" [(ngModel)]="dateTo" class="ml-1 rounded-md border border-slate-300 px-2 py-1.5" />
              </label>
              <button (click)="loadStats()" class="rounded-md bg-pine px-3 py-1.5 font-medium text-white hover:bg-pine-dark">
                Actualizar
              </button>
            </div>
          </div>

          @if (statsError()) {
            <p class="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{{ statsError() }}</p>
          } @else if (stats(); as s) {
            <div class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div class="rounded-md border border-slate-200 p-4">
                <p class="text-sm text-slate-500">Citas en el periodo</p>
                <p class="text-3xl font-bold">{{ s.total }}</p>
              </div>
              <div class="rounded-md border border-slate-200 p-4">
                <p class="text-sm text-slate-500">Atendidas</p>
                <p class="text-3xl font-bold text-green-700">{{ s.attended }}</p>
              </div>
              <div class="rounded-md border border-slate-200 p-4">
                <p class="text-sm text-slate-500">Inasistencia (no-show)</p>
                <p class="text-3xl font-bold" [class]="s.no_show_rate_pct > 15 ? 'text-red-700' : 'text-ink'">
                  {{ s.no_show_rate_pct }}%
                </p>
                <p class="text-xs text-slate-500">{{ s.no_show }} citas sin llegada · meta ≤ 15%</p>
              </div>
              <div class="rounded-md border border-slate-200 p-4">
                <p class="text-sm text-slate-500">Cancelaciones</p>
                <p class="text-3xl font-bold">{{ s.cancellation_rate_pct }}%</p>
                <p class="text-xs text-slate-500">{{ s.by_status.CANCELLED }} canceladas a tiempo</p>
              </div>
            </div>

            <h4 class="mb-2 mt-6 text-sm font-semibold text-slate-700">Ocupación de boxes</h4>
            <div class="space-y-3">
              @for (o of s.occupancy; track o.doctor_id) {
                <div>
                  <div class="flex justify-between text-sm">
                    <span>Box {{ o.box_number }} · {{ o.doctor_name }}</span>
                    <span class="font-medium">{{ o.occupancy_pct }}% ({{ o.booked_slots }}/{{ o.available_slots }} bloques)</span>
                  </div>
                  <div class="mt-1 h-2.5 w-full rounded-full bg-slate-100" role="progressbar"
                       [attr.aria-valuenow]="o.occupancy_pct" aria-valuemin="0" aria-valuemax="100">
                    <div class="h-2.5 rounded-full bg-pine" [style.width.%]="o.occupancy_pct > 100 ? 100 : o.occupancy_pct"></div>
                  </div>
                </div>
              } @empty {
                <p class="text-sm text-slate-500">Sin médicos activos.</p>
              }
            </div>
          } @else {
            <p class="mt-4 text-sm text-slate-500">Cargando indicadores…</p>
          }
        </div>

        <!-- VET-07: médicos -->
        <div class="rounded-lg bg-white p-6 shadow-sm">
          <h3 class="mb-4 text-lg font-semibold text-pine">Médicos registrados</h3>
          <div class="overflow-x-auto">
            <table class="w-full border-collapse text-sm">
              <thead>
                <tr class="bg-pine/10 text-left text-pine">
                  <th class="border p-2">Nombre</th>
                  <th class="border p-2">Correo</th>
                  <th class="border p-2">Especialidad</th>
                  <th class="border p-2">Box</th>
                  <th class="border p-2">Teléfono</th>
                  <th class="border p-2">Estado</th>
                  <th class="border p-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (doc of doctors(); track doc.id) {
                  <tr [class]="editingId() === doc.id ? 'bg-amber-50' : ''">
                    <td class="border p-2">{{ doc.full_name }}</td>
                    <td class="border p-2">{{ doc.email }}</td>
                    <td class="border p-2">{{ doc.specialty }}</td>
                    <td class="border p-2">{{ doc.box_number }}</td>
                    <td class="border p-2">{{ doc.phone || '-' }}</td>
                    <td class="border p-2">{{ doc.is_active ? 'Activo' : 'Inactivo' }}</td>
                    <td class="border p-2 text-center">
                      <button (click)="edit(doc)" class="text-pine underline hover:text-pine-dark">Editar</button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="7" class="border p-2 text-center text-slate-500">No hay médicos registrados</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg bg-white p-6 shadow-sm">
          <h3 class="mb-4 text-lg font-semibold text-pine">{{ editingId() ? 'Editar médico' : 'Registrar nuevo médico' }}</h3>

          @if (feedback(); as f) {
            <p role="alert" class="mb-4 rounded-md px-3 py-2 text-sm"
               [class]="f.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'">{{ f.text }}</p>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" class="grid gap-4 sm:grid-cols-2" novalidate>
            <div>
              <label for="fullName" class="mb-1 block text-sm font-medium">Nombre completo</label>
              <input id="fullName" formControlName="full_name" class="w-full rounded-md border border-slate-300 px-3 py-2.5" />
              @if (invalid('full_name')) { <p class="mt-1 text-sm text-red-700">Mínimo 3 caracteres.</p> }
            </div>
            <div>
              <label for="specialty" class="mb-1 block text-sm font-medium">Especialidad</label>
              <input id="specialty" formControlName="specialty" class="w-full rounded-md border border-slate-300 px-3 py-2.5" />
              @if (invalid('specialty')) { <p class="mt-1 text-sm text-red-700">La especialidad es obligatoria.</p> }
            </div>
            <div>
              <label for="email" class="mb-1 block text-sm font-medium">Correo electrónico</label>
              <input id="email" type="email" formControlName="email"
                     class="w-full rounded-md border border-slate-300 px-3 py-2.5 disabled:bg-slate-100" />
              @if (invalid('email')) { <p class="mt-1 text-sm text-red-700">Ingresa un correo válido.</p> }
            </div>
            <div>
              <label for="box" class="mb-1 block text-sm font-medium">Número de box</label>
              <input id="box" type="number" min="1" formControlName="box_number" class="w-full rounded-md border border-slate-300 px-3 py-2.5" />
              @if (invalid('box_number')) { <p class="mt-1 text-sm text-red-700">Ingresa un box válido (1 o más).</p> }
            </div>
            <div>
              <label for="phone" class="mb-1 block text-sm font-medium">Teléfono</label>
              <input id="phone" formControlName="phone" class="w-full rounded-md border border-slate-300 px-3 py-2.5" />
            </div>
            <div>
              <label for="active" class="mb-1 block text-sm font-medium">Disponibilidad</label>
              <select id="active" formControlName="is_active" class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5">
                <option [ngValue]="true">Activo</option>
                <option [ngValue]="false">Inactivo</option>
              </select>
            </div>
            <div>
              <label for="password" class="mb-1 block text-sm font-medium">
                Contraseña {{ editingId() ? '(dejar vacío para mantener la actual)' : '' }}
              </label>
              <input id="password" type="password" formControlName="password" autocomplete="new-password"
                     class="w-full rounded-md border border-slate-300 px-3 py-2.5" />
              @if (invalid('password')) { <p class="mt-1 text-sm text-red-700">Mínimo 6 caracteres.</p> }
            </div>
            <div class="flex items-end gap-3">
              <button type="submit" [disabled]="saving()"
                      class="flex-1 rounded-md bg-pine px-4 py-2.5 font-medium text-white hover:bg-pine-dark disabled:opacity-60">
                {{ editingId() ? 'Guardar cambios' : 'Registrar médico' }}
              </button>
              @if (editingId()) {
                <button type="button" (click)="resetForm()" class="rounded-md border border-slate-300 px-4 py-2.5">Cancelar</button>
              }
            </div>
          </form>
        </div>
      </div>
    </section>
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
