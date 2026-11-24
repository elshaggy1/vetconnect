import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, Role } from '../services/auth.service';

/**
 * Exige sesión vigente y que el rol esté en `data.roles` (RF-03 / RNF-02).
 * Si el rol no corresponde, redirige a la vista de inicio de ese rol en vez de cerrar la sesión.
 */
export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    auth.logout();
    return router.createUrlTree(['/login']);
  }
  const allowed = (route.data?.['roles'] as Role[] | undefined) ?? [];
  const role = auth.getRole();
  if (allowed.length && (!role || !allowed.includes(role))) {
    return router.parseUrl(auth.homeRoute());
  }
  return true;
};

/** En /login: si ya hay sesión vigente, envía directo a la vista del rol. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? inject(Router).parseUrl(auth.homeRoute()) : true;
};
