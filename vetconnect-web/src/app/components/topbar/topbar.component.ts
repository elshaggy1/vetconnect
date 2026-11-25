import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, Role } from '../../services/auth.service';

const ROLE_LABEL: Record<Role, string> = {
  TUTOR: 'Tutor',
  RECEPCIONISTA: 'Recepción',
  VETERINARIO: 'Veterinario',
  ADMIN: 'Administración',
};

/** Barra superior común a todas las vistas autenticadas. */
@Component({
  selector: 'app-topbar',
  standalone: true,
  template: `
    <header class="fixed inset-x-0 top-0 z-20 px-4 pt-4 sm:px-6">
      <nav class="mx-auto flex max-w-6xl items-center justify-between rounded-full bg-white px-5 py-3 shadow-[0_8px_30px_rgba(60,34,25,0.06)]">
        <span class="flex items-center gap-2 text-lg font-semibold text-espresso">
          <span class="grid h-8 w-8 place-items-center rounded-full bg-coral text-espresso" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor">
              <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />
            </svg>
          </span>
          <span>VetConnect<span class="text-coral">.</span></span>
        </span>
        <div class="flex items-center gap-3 text-sm sm:gap-5">
          <span class="hidden text-muted sm:inline">
            {{ auth.getFullName() }}
            @if (roleLabel) { <span class="ml-1 rounded-full bg-cream-deep px-2.5 py-0.5 text-xs text-espresso">{{ roleLabel }}</span> }
          </span>
          <button type="button" (click)="logout()" class="btn-primary whitespace-nowrap px-4 py-2 text-sm sm:px-5">Cerrar sesión</button>
        </div>
      </nav>
    </header>
  `,
})
export class TopbarComponent {
  auth = inject(AuthService);
  private router = inject(Router);
  roleLabel = (() => {
    const role = this.auth.getRole();
    return role ? ROLE_LABEL[role] : '';
  })();

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
