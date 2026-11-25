import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <main class="grid min-h-screen bg-cream lg:grid-cols-2">
      <section class="relative m-3 flex flex-col justify-between overflow-hidden rounded-4xl bg-espresso p-8 text-cream sm:p-12 lg:m-4">
        <span class="flex items-center gap-2 text-lg font-semibold text-cream">
          <span class="grid h-8 w-8 place-items-center rounded-full bg-coral text-espresso" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor"><path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" /></svg>
          </span>
          <span>VetConnect<span class="text-coral">.</span></span>
        </span>

        <div class="py-12">
          <h1 class="max-w-md text-5xl leading-[1.15] text-cream sm:text-6xl">
            La salud de tu <span class="text-coral">mascota</span>, sin filas
          </h1>
          <p class="mt-6 max-w-sm text-cream/80">
            Mira los horarios libres de cada médico en tiempo real y confirma tu hora al instante.
          </p>
          <ul class="mt-8 space-y-3 text-sm text-cream/90">
            <li class="flex items-center gap-3"><span class="h-2 w-2 rounded-full bg-coral"></span>Reserva sin choques de horario</li>
            <li class="flex items-center gap-3"><span class="h-2 w-2 rounded-full bg-coral"></span>Confirmación y recordatorio por correo</li>
            <li class="flex items-center gap-3"><span class="h-2 w-2 rounded-full bg-coral"></span>Ficha clínica y receta digital</li>
          </ul>
        </div>

        <p class="text-sm text-muted-light">Clínica Veterinaria San Francisco · Talca</p>
        <div class="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-coral/15" aria-hidden="true"></div>
      </section>

      <section class="flex items-center justify-center p-6 sm:p-10">
        <form [formGroup]="form" (ngSubmit)="submit()" class="w-full max-w-md space-y-5 rounded-4xl bg-white p-8 sm:p-10" novalidate>
          <div>
            <p class="eyebrow">Bienvenido</p>
            <h2 class="text-4xl">Iniciar sesión</h2>
          </div>

          <div>
            <label for="email" class="label">Correo electrónico</label>
            <input id="email" type="email" formControlName="email" autocomplete="username" class="input" />
            @if (form.controls.email.touched && form.controls.email.invalid) {
              <p class="field-error">
                {{ form.controls.email.hasError('required') ? 'Ingresa tu correo.' : 'Revisa el formato del correo.' }}
              </p>
            }
          </div>

          <div>
            <label for="password" class="label">Contraseña</label>
            <input id="password" type="password" formControlName="password" autocomplete="current-password" class="input" />
            @if (form.controls.password.touched && form.controls.password.invalid) {
              <p class="field-error">
                {{ form.controls.password.hasError('required') ? 'Ingresa tu contraseña.' : 'Debe tener al menos 6 caracteres.' }}
              </p>
            }
          </div>

          @if (error()) {
            <p role="alert" class="alert-error">{{ error() }}</p>
          }

          <button type="submit" [disabled]="loading()" class="btn-primary w-full py-3.5">
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
      next: () => this.router.navigateByUrl(this.auth.homeRoute()),
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.status === 401 ? 'Correo o contraseña incorrectos.' : 'No pudimos conectar con el servidor. Intenta de nuevo.',
        );
      },
    });
  }
}
