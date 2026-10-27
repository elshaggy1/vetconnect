import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { BookingComponent } from './components/booking/booking.component';
import { LoginComponent } from './components/login/login.component';
import { ReceptionComponent } from './components/reception/reception.component';
import { VetDashboardComponent } from './components/vet-dashboard/vet-dashboard.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'reservas', component: BookingComponent, canActivate: [authGuard], data: { role: 'TUTOR' } },
  { path: 'recepcion', component: ReceptionComponent, canActivate: [authGuard], data: { role: ['RECEPCIONISTA', 'ADMIN'] } },
  { path: 'veterinario', component: VetDashboardComponent, canActivate: [authGuard], data: { role: 'VETERINARIO' } },
  { path: '', pathMatch: 'full', redirectTo: 'reservas' },
  { path: '**', redirectTo: 'reservas' },
];