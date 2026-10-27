import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Exige sesión válida y, si la ruta define data.role, que coincida.
 *  Ahora soporta route.data?.['role'] como string o arreglo de strings (ej: ['RECEPCIONISTA', 'ADMIN']). */
export const authGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const requiredRole = route.data?.['role'] as string | string[] | null;

  if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);

  // Normalizar a arreglo para validación unificada
  const requiredRoles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];

  // Verificar si el rol actual está en la lista de roles requeridos
  const userRole = auth.getRole();
  const hasValidRole = requiredRoles.includes(userRole);

  if (!hasValidRole) {
    auth.logout();
    return router.createUrlTree(['/login']);
  }

  return true;
};