import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import type { LoginResponse, RegisterInput } from '@cacaosmart/contracts';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<LoginResponse | null>(null);
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly user = computed(() => this.session()?.user ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  login(email: string, password: string) {
    return this.http
      .post<LoginResponse>('/api/v1/auth/login', { email, password })
      .pipe(tap((response) => this.saveSession(response)));
  }

  register(input: RegisterInput) {
    return this.http
      .post<LoginResponse>('/api/v1/auth/register', input)
      .pipe(tap((response) => this.saveSession(response)));
  }

  private saveSession(response: LoginResponse): void {
    if (
      !response.accessToken ||
      response.tokenType !== 'Bearer' ||
      !response.user ||
      !['ADMIN', 'FARMER'].includes(response.user.role) ||
      !Number.isInteger(response.expiresIn) ||
      response.expiresIn < 1 ||
      response.expiresIn > 900
    ) {
      throw new Error('Respuesta de autenticación inválida');
    }
    clearTimeout(this.timer);
    this.expiresAt = Date.now() + response.expiresIn * 1000;
    this.session.set(response);
    this.timer = setTimeout(() => this.logout(), response.expiresIn * 1000);
  }

  accessToken(): string | null {
    if (this.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }
    return this.session()?.accessToken ?? null;
  }

  logout(): void {
    clearTimeout(this.timer);
    this.session.set(null);
    this.expiresAt = 0;
  }
}
