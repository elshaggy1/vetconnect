import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';
import { Doctor, DoctorList } from '../../services/admin.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  selector: 'app-admin',
  template: `
    <section class="min-h-screen bg-pine-soft p-6">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <header class="mb-8 flex justify-between items-center">
          <div>
            <h2>{{ showEditMode() ? 'Editar Médico' : 'Panel de Administración' }}</h2>
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

        <!-- Lista de médicos -->
        <div class="card mb-8">
          <h3 class="font-semibold text-pine mb-4">Médicos Registrados</h3>
          <div class="overflow-x-auto">
            <table class="w-full table-fixed border-collapse border-border">
              <thead>
                <tr class="bg-pine/10 text-pine text-sm">
                  <th class="border p-2">Nombre</th>
                  <th class="border p-2">Especialidad</th>
                  <th class="border p-2">Número de Box</th>
                  <th class="border p-2">Teléfono</th>
                  <th class="border p-2">Estado</th>
                  <th class="border p-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (doc of doctorsList(); track doc.id) {
                  <tr class="text-sm border-b">
                    <td class="border p-2">{{ doc.full_name }}</td>
                    <td class="border p-2">{{ doc.specialty || '-' }}</td>
                    <td class="border p-2">{{ doc.box_number }}</td>
                    <td class="border p-2">{{ doc.phone || '-' }}</td>
                    <td class="border p-2">
                      {{ doc.is_active ? 'Activo' : 'Inactivo' }}
                    </td>
                    <td class="border p-2 text-center">
                      <button
                        (click)="editDoctor(doc.id)"
                        class="px-2 py-1 text-sm text-blue-600 underline hover:text-blue-800"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                }
                @empty {
                  <tr class="text-sm">
                    <td class="border p-2 colspan-5 text-center text-slate-500">No hay médicos registrados</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sección: Formulario de Médico -->
        <div class="card mb-8">
          <h3 class="font-semibold text-pine mb-4">{{ showEditMode() ? 'Editar Médico' : 'Registrar Nuevo Médico' }}</h3>
          <form
            [formGroup]="doctorForm"
            (ngSubmit)="onSubmitDoctor()"
            class="space-y-4"
            novalidate
          >
            <div>
              <label for="doctorName" class="block text-sm font-medium text-slate-700 mb-1">
                Nombre completo
              </label>
              <input
                id="doctorName"
                type="text"
                formControlName="full_name"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
              />
              @if (doctorForm.get('full_name')?.touched && doctorForm.get('full_name')?.invalid) {
                <p class="mt-1 text-sm text-red-700">El nombre es obligatorio.</p>
              }
            </div>

            <div>
              <label for="doctorSpecialty" class="block text-sm font-medium text-slate-700 mb-1">
                Especialidad
              </label>
              <input
                id="doctorSpecialty"
                type="text"
                formControlName="specialty"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
              />
              @if (doctorForm.get('specialty')?.touched && doctorForm.get('specialty')?.invalid) {
                <p class="mt-1 text-sm text-red-700">La especialidad es obligatoria.</p>
              }
            </div>

            <div>
              <label for="doctorEmail" class="block text-sm font-medium text-slate-700 mb-1">
                Correo electrónico
              </label>
              <input
                id="doctorEmail"
                type="email"
                formControlName="email"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
                email
              />
              @if (doctorForm.get('email')?.touched && doctorForm.get('email')?.invalid) {
                <p class="mt-1 text-sm text-red-700">
                  {{ doctorForm.get('email')?.hasError('required') ? 'El correo es obligatorio.' : 'Revisa el formato del correo.' }}
                </p>
              }
            </div>

            <div>
              <label for="doctorBox" class="block text-sm font-medium text-slate-700 mb-1">
                Número de box
              </label>
              <input
                id="doctorBox"
                type="number"
                formControlName="box_number"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
              />
              @if (doctorForm.get('box_number')?.touched && doctorForm.get('box_number')?.invalid) {
                <p class="mt-1 text-sm text-red-700">El número de box es obligatorio.</p>
              }
            </div>

            <div>
              <label for="doctorPhone" class="block text-sm font-medium text-slate-700 mb-1">
                Teléfono
              </label>
              <input
                id="doctorPhone"
                type="text"
                formControlName="phone"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
              />
              @if (doctorForm.get('phone')?.touched && doctorForm.get('phone')?.invalid) {
                <p class="mt-1 text-sm text-red-700">El teléfono es obligatorio.</p>
              }
            </div>

            <div>
              <label for="doctorActive" class="block text-sm font-medium text-slate-700 mb-1">
                Disponibilidad (is_active)
              </label>
              <select
                id="doctorActive"
                formControlName="is_active"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
              >
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>

            <div>
              <label for="doctorPassword" class="block text-sm font-medium text-slate-700 mb-1">
                Contraseña
              </label>
              <input
                id="doctorPassword"
                type="password"
                formControlName="password"
                class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus-border-pine"
                required
              />
              @if (doctorForm.get('password')?.touched && doctorForm.get('password')?.invalid) {
                <p class="mt-1 text-sm text-red-700">La contraseña es obligatoria.</p>
              }
            </div>

            <button
              type="submit"
              class="w-full rounded-md bg-pine text-white px-4 py-2.5 font-medium transition hover:bg-pine-dark disabled:opacity-60"
            >
              {{ showEditMode() ? 'Guardar Cambios' : 'Guardar Médico' }}
            </button>
          </form>
        </div>
      </div>
    </section>
  `,
})
export class AdminComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);

  // Estado de edición
  showEditMode = signal(false);
  currentDoctorId = signal<number | null>(null);

  // Alertas de éxito
  showSuccess = signal(false);
  successMessage = signal('');

  // Formularios reactivos
  doctorForm!: FormGroup;
  boxForm!: FormGroup;
  scheduleForm!: FormGroup;
  doctorsList = signal<DoctorList[]>([]);

  constructor() {
    this.doctorForm = this.fb.nonNullable.group({
      full_name: ['', [Validators.required]],
      specialty: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      box_number: ['', [Validators.required]],
      phone: [''],
      is_active: ['true', [Validators.required]],
      password: ['', [Validators.required]],
    });

    this.boxForm = this.fb.nonNullable.group({
      name: ['', [Validators.required]],
      location: ['', [Validators.required]],
    });

    this.scheduleForm = this.fb.nonNullable.group({
      doctor_id: ['', [Validators.required]],
      start_time: ['', [Validators.required]],
      end_time: ['', [Validators.required]],
    });

    // Cargar lista de médicos al iniciar
    this.loadDoctors();
  }

  /** Cargar la lista de médicos desde el backend */
  loadDoctors(): void {
    this.adminService.getDoctors().subscribe({
      next: (doctors) => {
        this.doctorsList.set(doctors);
      },
      error: (err) => {
        console.error('Error al cargar médicos:', err);
      },
    });
  }

  /** Cambiar al modo edición para un médico específico */
  editDoctor(id: number): void {
    this.adminService.getDoctors().subscribe({
      next: (doctors) => {
        const doctor = doctors.find((d) => d.id === id);
        if (doctor) {
          this.currentDoctorId.set(id);
          this.showEditMode.set(true);
          // Llenar el formulario con los datos del médico
          this.doctorForm.patchValue({
            full_name: doctor.full_name,
            specialty: doctor.specialty || '',
            email: doctor.full_name ? doctor.full_name.replace(/[0-9]/g, '') + '@vetconnect.cl' : '',
            box_number: doctor.box_number,
            phone: doctor.phone || '',
            is_active: doctor.is_active,
            password: '', // No llenar la contraseña en modo edición (se mantiene la actual)
          });
        }
      },
      error: (err) => {
        console.error('Error al cargar médico para editar:', err);
      },
    });
  }

  /** Alternar entre modo creación y edición */
  toggleEditMode(): void {
    this.showEditMode.update((val) => !val);
    if (!this.showEditMode()) {
      this.currentDoctorId.set(null);
      this.doctorForm.reset();
    }
  }

  /** Cerrar sesión */
  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  /** Manejar el envío del formulario */
  onSubmitDoctor(): void {
    if (this.doctorForm.invalid) {
      this.doctorForm.markAllAsTouched();
      return;
    }

    const rawValue = this.doctorForm.getRawValue();

    if (this.showEditMode() && this.currentDoctorId()) {
      // Modo edición: enviar ID y datos
      this.adminService
        .updateDoctor(this.currentDoctorId()!, rawValue as any)
        .subscribe({
          next: () => {
            this.showSuccess.set(true);
            this.successMessage.set('Médico actualizado correctamente.');
            this.toggleEditMode();
            this.loadDoctors(); // Actualizar la lista
          },
          error: (err) => {
            console.error('Error al actualizar médico:', err);
            this.showSuccess.set(true);
            this.successMessage.set('Error al actualizar médico. Intenta de nuevo.');
            setTimeout(() => this.showSuccess.set(false), 3000);
          },
        });
    } else {
      // Modo creación: nuevo médico
      this.adminService.createDoctor(rawValue as any).subscribe({
        next: () => {
          this.showSuccess.set(true);
          this.successMessage.set('Médico registrado correctamente.');
          this.doctorForm.reset();
          this.loadDoctors(); // Actualizar la lista
          setTimeout(() => this.showSuccess.set(false), 3000);
        },
        error: (err) => {
          console.error('Error al registrar médico:', err);
          this.showSuccess.set(true);
          this.successMessage.set('Error al registrar médico. Intenta de nuevo.');
          setTimeout(() => this.showSuccess.set(false), 3000);
        },
      });
    }
  }

  onSubmitBox(): void {
    if (this.boxForm.invalid) {
      this.boxForm.markAllAsTouched();
      return;
    }

    this.adminService.createBox(this.boxForm.getRawValue()).subscribe({
      next: () => {
        this.showSuccess.set(true);
        this.successMessage.set('Box de atención registrado correctamente.');
        this.boxForm.reset();
        setTimeout(() => this.showSuccess.set(false), 3000);
      },
      error: (err) => {
        console.error('Error al registrar box:', err);
        this.showSuccess.set(true);
        this.successMessage.set('Error al registrar box. Intenta de nuevo.');
        setTimeout(() => this.showSuccess.set(false), 3000);
      },
    });
  }

  onSubmitSchedule(): void {
    if (this.scheduleForm.invalid) {
      this.scheduleForm.markAllAsTouched();
      return;
    }

    this.adminService.createSchedule(this.scheduleForm.getRawValue()).subscribe({
      next: () => {
        this.showSuccess.set(true);
        this.successMessage.set('Disponibilidad de horario publicada correctamente.');
        this.scheduleForm.reset();
        setTimeout(() => this.showSuccess.set(false), 3000);
      },
      error: (err) => {
        console.error('Error al publicar horario:', err);
        this.showSuccess.set(true);
        this.successMessage.set('Error al publicar horario. Intenta de nuevo.');
        setTimeout(() => this.showSuccess.set(false), 3000);
      },
    });
  }
}