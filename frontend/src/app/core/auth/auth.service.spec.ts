import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  provideRouter,
  Router,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { authGuard } from './auth.guard';

describe('JWT en memoria, renovación de sesión e interceptor', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const response = {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'test', name: 'Usuario', email: 'test@example.test', role: 'ADMIN' },
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  function login() {
    auth.login('test@example.test', 'a-test-password').subscribe();
    http.expectOne('/api/v1/auth/login').flush(response);
  }

  it('conserva sesión solo en memoria y la borra al salir', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    login();
    expect(auth.accessToken()).toBe('test-token');
    expect(auth.user()?.role).toBe('ADMIN');
    expect(storage).not.toHaveBeenCalled();
    auth.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    expect(auth.accessToken()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('una cookie caducada rechaza renovación y limpia la sesión sin enviar JWT vencido', () => {
    vi.useFakeTimers();
    login();
    vi.advanceTimersByTime(840000);
    const refresh = http.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    expect(refresh.request.headers.get('X-CacaoSmart-Session')).toBe('1');
    refresh.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
  });
  it('renueva antes de quince minutos sin cerrar el panel ni persistir JWT', () => {
    vi.useFakeTimers();
    login();
    vi.advanceTimersByTime(840000);
    http.expectOne('/api/v1/auth/refresh').flush({ ...response, accessToken: 'renewed-token' });
    vi.advanceTimersByTime(61000);
    expect(auth.accessToken()).toBe('renewed-token');
    expect(auth.user()?.role).toBe('ADMIN');
    expect(sessionStorage.getItem('test-token')).toBeNull();
  });
  it('restaura desde cookie del servidor sin guardar contraseña o token en storage', async () => {
    const initialized = auth.initialize();
    const refresh = http.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush(response);
    await initialized;
    expect(auth.accessToken()).toBe('test-token');
  });
  it('varias solicitudes tras suspensión comparten renovación y reciben JWT nuevo', () => {
    vi.useFakeTimers();
    login();
    vi.setSystemTime(Date.now() + 901000);
    const client = TestBed.inject(HttpClient);
    client.get('/api/v1/plots').subscribe();
    client.get('/api/v1/users').subscribe();
    http.expectOne('/api/v1/auth/refresh').flush({ ...response, accessToken: 'renewed' });
    for (const url of ['/api/v1/plots', '/api/v1/users']) {
      const pending = http.expectOne(url);
      expect(pending.request.headers.get('Authorization')).toBe('Bearer renewed');
      pending.flush({});
    }
  });
  it('salir cancela renovación pendiente y no restaura tras recarga aunque la red falle', async () => {
    login();
    auth.renew().subscribe();
    const pending = http.expectOne('/api/v1/auth/refresh');
    auth.logout();
    expect(pending.cancelled).toBe(true);
    http.expectOne('/api/v1/auth/logout').flush({}, { status: 503, statusText: 'Unavailable' });
    await auth.initialize();
    http.expectNone('/api/v1/auth/refresh');
    expect(auth.user()).toBeNull();
  });
  it('fallo temporal reintenta sin presentar un JWT caducado como válido', () => {
    vi.useFakeTimers();
    login();
    vi.advanceTimersByTime(840000);
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(auth.user()).not.toBeNull();
    vi.advanceTimersByTime(10000);
    http.expectOne('/api/v1/auth/refresh').flush({ ...response, accessToken: 'recovered' });
    expect(auth.accessToken()).toBe('recovered');
  });

  it('registra una cuenta sin enviar token anterior y activa sesión FARMER en memoria', () => {
    login();
    const input = { name: 'Agricultor', email: 'new@example.test', password: 'Abcdefg!' };
    auth.register(input).subscribe();
    const registration = http.expectOne('/api/v1/auth/register');
    expect(registration.request.headers.has('Authorization')).toBe(false);
    expect(registration.request.body).toEqual(input);
    registration.flush({
      ...response,
      accessToken: 'farmer-token',
      user: { ...response.user, role: 'FARMER' },
    });
    expect(auth.user()?.role).toBe('FARMER');
    expect(auth.accessToken()).toBe('farmer-token');
  });

  it('no adjunta JWT a dominios externos ni al login', () => {
    login();
    TestBed.inject(HttpClient).get('https://external.example/api/v1/test').subscribe();
    const external = http.expectOne('https://external.example/api/v1/test');
    expect(external.request.headers.has('Authorization')).toBe(false);
    external.flush({});
    auth.login('test@example.test', 'a-test-password').subscribe();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(response);
  });

  it('adjunta JWT solo a API propia y elimina sesión ante 401', () => {
    login();
    TestBed.inject(HttpClient)
      .get('/api/v1/plots')
      .subscribe({ error: () => undefined });
    const request = http.expectOne('/api/v1/plots');
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.user()).toBeNull();
    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('un 401 atrasado de una sesión anterior no elimina una nueva', () => {
    login();
    TestBed.inject(HttpClient)
      .get('/api/v1/plots')
      .subscribe({ error: () => undefined });
    const old = http.expectOne('/api/v1/plots');
    auth.login('test@example.test', 'a-test-password').subscribe();
    http.expectOne('/api/v1/auth/login').flush({ ...response, accessToken: 'new-token' });
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.accessToken()).toBe('new-token');
  });
  it('un 401 tras renovación anterior tampoco elimina un login más reciente', () => {
    vi.useFakeTimers();
    login();
    vi.setSystemTime(Date.now() + 901000);
    TestBed.inject(HttpClient)
      .get('/api/v1/plots')
      .subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/auth/refresh')
      .flush({ ...response, accessToken: 'previous-renewed-token' });
    const old = http.expectOne('/api/v1/plots');
    auth.login('test@example.test', 'a-test-password').subscribe();
    http.expectOne('/api/v1/auth/login').flush({ ...response, accessToken: 'latest-login-token' });
    old.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.accessToken()).toBe('latest-login-token');
  });

  it('guardia redirige al login y permite navegar solo con sesión', () => {
    const check = () =>
      TestBed.runInInjectionContext(() =>
        authGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
      );
    expect(String(check())).toBe('/login');
    login();
    expect(check()).toBe(true);
  });
});
