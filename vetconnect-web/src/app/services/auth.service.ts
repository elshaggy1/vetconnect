import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { API_URL } from '../api.config';

export type Role = 'ADMIN' | 'RECEPCIONISTA' | 'VETERINARIO' | 'TUTOR';

/** Vista de inicio de cada rol (RF-03). */
export const HOME_BY_ROLE: Record<Role, string> = {
  TUTOR: '/reservas',
  RECEPCIONISTA: '/recepcion',
  VETERINARIO: '/veterinario',
  ADMIN: '/admin',
};

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: Role;
  full_name: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private readonly TOKEN_KEY = 'vetconnect_token';
  private readonly NAME_KEY = 'vetconnect_name';

  /** POST /auth/login y guarda el JWT en localStorage. */
  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${API_URL}/auth/login`, { email, password }).pipe(
      tap((res) => {
        localStorage.setItem(this.TOKEN_KEY, res.access_token);
        localStorage.setItem(this.NAME_KEY, res.full_name);
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.NAME_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  getFullName(): string {
    return localStorage.getItem(this.NAME_KEY) ?? '';
  }

  /** Rol actual leído del payload del JWT (null si no hay sesión válida). */
  getRole(): Role | null {
    return (this.decodePayload()?.['role'] as Role) ?? null;
  }

  homeRoute(): string {
    const role = this.getRole();
    return role ? HOME_BY_ROLE[role] : '/login';
  }

  /** Hay token y todavía no expiró. */
  isLoggedIn(): boolean {
    const exp = this.decodePayload()?.['exp'] as number | undefined;
    return !!exp && exp * 1000 > Date.now();
  }

  private decodePayload(): Record<string, unknown> | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      // JWT usa base64url: hay que normalizarlo antes de atob().
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(b64));
    } catch {
      return null;
    }
  }
}
