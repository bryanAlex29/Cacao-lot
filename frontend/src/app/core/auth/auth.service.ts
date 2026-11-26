import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  finalize,
  firstValueFrom,
  Observable,
  shareReplay,
  Subject,
  takeUntil,
  tap,
  timeout,
} from 'rxjs';
import type { LoginResponse, RegisterInput } from '@cacaosmart/contracts';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<LoginResponse | null>(null);
  private expiresAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private readonly cancelRenewal = new Subject<void>();
  private renewal?: Observable<LoginResponse>;
  readonly user = computed(() => this.session()?.user ?? null);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.cancelRenewal.next();
    });
  }

  async initialize(): Promise<void> {
    try {
      if (sessionStorage.getItem('cacaosmart.signed-out') === '1') return;
    } catch {
      /* Storage may be blocked. */
    }
    try {
      await firstValueFrom(this.renew());
    } catch {
      /* No valid cookie: remain signed out. */
    }
  }

  renew(): Observable<LoginResponse> {
    if (this.renewal) return this.renewal;
    const revision = this.revision;
    const request = this.http
      .post<LoginResponse>('/api/v1/auth/refresh', {}, { headers: { 'X-CacaoSmart-Session': '1' } })
      .pipe(
        timeout(8000),
        takeUntil(this.cancelRenewal),
        tap((response) => {
          if (revision === this.revision) this.saveSession(response);
        }),
        finalize(() => {
          if (this.renewal === request) this.renewal = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: true }),
      );
    this.renewal = request;
    return request;
  }

  private renewAutomatically(): void {
    const revision = this.revision;
    this.renew().subscribe({
      error: (error: unknown) => {
        if (revision !== this.revision) return;
        if (error instanceof HttpErrorResponse && [401, 403].includes(error.status)) {
          this.clearSession();
          void this.router.navigateByUrl('/login');
        } else {
          // Temporary outages do not revoke the browser session. No expired JWT is sent.
          this.timer = setTimeout(() => this.renewAutomatically(), 10000);
        }
      },
    });
  }

  login(email: string, password: string) {
    clearTimeout(this.timer);
    this.cancelRenewal.next();
    this.revision++;
    return this.http.post<LoginResponse>('/api/v1/auth/login', { email, password }).pipe(
      timeout(15000),
      tap((response) => this.saveSession(response)),
    );
  }

  register(input: RegisterInput) {
    clearTimeout(this.timer);
    this.cancelRenewal.next();
    this.revision++;
    return this.http.post<LoginResponse>('/api/v1/auth/register', input).pipe(
      timeout(15000),
      tap((response) => this.saveSession(response)),
    );
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
    this.revision++;
    this.expiresAt = Date.now() + response.expiresIn * 1000;
    this.session.set(response);
    this.timer = setTimeout(
      () => this.renewAutomatically(),
      Math.max(
        1000,
        response.expiresIn > 120 ? (response.expiresIn - 60) * 1000 : response.expiresIn * 800,
      ),
    );
    try {
      sessionStorage.removeItem('cacaosmart.signed-out');
    } catch {
      /* Tokens are never persisted in browser storage. */
    }
  }

  accessToken(): string | null {
    if (this.expiresAt <= Date.now()) {
      return null;
    }
    return this.session()?.accessToken ?? null;
  }

  logout(): void {
    this.clearSession();
    try {
      sessionStorage.setItem('cacaosmart.signed-out', '1');
    } catch {
      /* Server revocation remains authoritative. */
    }
    this.http
      .post('/api/v1/auth/logout', {}, { headers: { 'X-CacaoSmart-Session': '1' } })
      .pipe(timeout(8000))
      .subscribe({ error: () => undefined });
  }

  clearSession(): void {
    clearTimeout(this.timer);
    this.revision++;
    this.cancelRenewal.next();
    this.renewal = undefined;
    this.session.set(null);
    this.expiresAt = 0;
  }
}
