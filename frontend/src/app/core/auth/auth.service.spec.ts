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

describe('Sesión en memoria e interceptor', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const response = {
    accessToken: 'test-token',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: { id: 'test', name: 'Usuario', email: 'test@example.test', role: 'ADMIN' },
  };

  beforeEach(() => {
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
    expect(auth.accessToken()).toBeNull();
    expect(auth.user()).toBeNull();
  });

  it('caduca la sesión sin esperar un error HTTP', () => {
    vi.useFakeTimers();
    login();
    vi.advanceTimersByTime(900000);
    expect(auth.user()).toBeNull();
    expect(auth.accessToken()).toBeNull();
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
