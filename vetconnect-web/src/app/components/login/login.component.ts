import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="grid min-h-screen lg:grid-cols-[2fr_3fr]">
      <section class="flex flex-col justify-between bg-pine p-8 text-white lg:p-14">
        <p class="text-lg font-semibold">VetConnect Maule</p>
        <div class="py-10">
          <h1 class="max-w-sm text-4xl font-bold leading-tight">Reserva la hora de tu mascota sin llamar.</h1>
          <p class="mt-4 max-w-sm text-pine-soft">
            Mira los horarios libres de cada médico en tiempo real y confirma al instante.
          </p>
        </div>
        <p class="text-sm text-pine-soft">Clínica Veterinaria San Francisco · Talca</p>
      </section>

      <section class="flex items-center justify-center p-6">
        <form [formGroup]="form" (ngSubmit)="submit()" class="w-full max-w-sm space-y-5" novalidate>
          <h2 class="text-2xl font-semibold">Iniciar sesión</h2>

          <div>
            <label for="email" class="mb-1 block text-sm font-medium">Correo electrónico</label>
            <input id="email" type="email" formControlName="email" autocomplete="username"
                   class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine" />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p class="mt-1 text-sm text-red-700">
                {{ form.controls.email.hasError('required') ? 'Ingresa tu correo.' : 'Revisa el formato del correo.' }}
              </p>
            }
          </div>

          <div>
            <label for="password" class="mb-1 block text-sm font-medium">Contraseña</label>
            <input id="password" type="password" formControlName="password" autocomplete="current-password"
                   class="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 focus:border-pine" />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p class="mt-1 text-sm text-red-700">
                {{ form.controls.password.hasError('required') ? 'Ingresa tu contraseña.' : 'Debe tener al menos 6 caracteres.' }}
              </p>
            }
          </div>

          @if (error()) {
            <p role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{{ error() }}</p>
          }

          <button type="submit" [disabled]="loading()"
                  class="w-full rounded-md bg-pine px-4 py-2.5 font-semibold text-white transition hover:bg-pine-dark disabled:opacity-60">
            {{ loading() ? 'Entrando…' : 'Entrar' }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal('');
  quickLoginEmail = signal('');

  form = this.fb.nonNullable.group({
    email: ['tutor@vetconnect.cl', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        // Redirección según el rol
        const role = this.auth.getRole();
        switch (role) {
          case 'TUTOR':
            this.router.navigate(['/reservas']);
            break;
          case 'RECEPCIONISTA':
            this.router.navigate(['/recepcion']);
            break;
          case 'ADMIN':
            this.router.navigate(['/admin']);
            break;
          case 'VETERINARIO':
            this.router.navigate(['/veterinario']);
            break;
          default:
            this.router.navigate(['/reservas']);
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar con el servidor. Intenta de nuevo.',
        );
      },
    });
  }

  /** Métodos de acceso rápido para pruebas */
  quickLogin(role: 'TUTOR' | 'RECEPCIONISTA' | 'VETERINARIO'): void {
    const emails: Record<'TUTOR' | 'RECEPCIONISTA' | 'VETERINARIO', string> = {
      TUTOR: 'tutor@vetconnect.cl',
      RECEPCIONISTA: 'recepcion@vetconnect.cl',
      VETERINARIO: 'vet@vetconnect.cl',
    };
    this.quickLoginEmail.set(emails[role]);
    this.form.patchValue({ email: emails[role], password: 'Vet123!' });
    this.submit();
  }
}