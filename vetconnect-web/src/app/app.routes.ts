import { Routes } from '@angular/router';
import { AdminComponent } from './components/admin/admin.component';
import { BookingComponent } from './components/booking/booking.component';
import { LoginComponent } from './components/login/login.component';
import { ReceptionComponent } from './components/reception/reception.component';
import { VetDashboardComponent } from './components/vet-dashboard/vet-dashboard.component';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'reservas', component: BookingComponent, canActivate: [authGuard], data: { roles: ['TUTOR'] } },
  { path: 'recepcion', component: ReceptionComponent, canActivate: [authGuard], data: { roles: ['RECEPCIONISTA', 'ADMIN'] } },
  { path: 'veterinario', component: VetDashboardComponent, canActivate: [authGuard], data: { roles: ['VETERINARIO'] } },
  { path: 'admin', component: AdminComponent, canActivate: [authGuard], data: { roles: ['ADMIN'] } },
  { path: '', pathMatch: 'full', redirectTo: 'reservas' },
  { path: '**', redirectTo: 'reservas' },
];
