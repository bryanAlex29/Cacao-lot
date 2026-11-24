import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { HealthService } from '../../core/health/health.service';
import type { SystemHealth } from '../../core/health/health.service';
import { SystemStatusComponent } from './system-status.component';

@Component({ standalone: true, template: '' })
class DestinationComponent {}

describe('Pantalla de base técnica', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SystemStatusComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'parcelas', component: DestinationComponent },
          { path: 'login', component: DestinationComponent },
        ]),
        { provide: HealthService, useValue: { check: () => of({ api: 'up', database: 'down' }) } },
      ],
    }).compileComponents();
  });

  it('muestra salud real de servicios sin afirmar conexión de sensores', async () => {
    const fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('no demuestra que un ESP32 esté enviando datos');
    expect(element.textContent).toContain('no hay predicción hídrica validada');
    expect(element.textContent).toContain('No disponible');
    expect(element.textContent).not.toContain('Sistema en línea');
    expect(element.querySelector('h1')?.textContent).toContain('cuidar el cacao');
    expect(element.querySelectorAll('.service.unavailable')).toHaveLength(1);
    expect(element.querySelector('.service-warning')?.textContent).toContain('volver a comprobar');
  });
  it('comprobación pendiente evita duplicados y reintentar recupera estados sin verde obsoleto', async () => {
    const checks = new Subject<SystemHealth>();
    const check = vi.spyOn(TestBed.inject(HealthService), 'check').mockReturnValue(checks);
    const fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const root: HTMLElement = fixture.nativeElement;
    component.refresh();
    expect(check).toHaveBeenCalledTimes(1);
    expect(root.querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);
    expect(root.querySelector('.badge.good')).toBeNull();
    checks.next({ api: 'up', database: 'down' });
    checks.complete();
    fixture.detectChanges();
    expect(root.querySelectorAll('.badge.good')).toHaveLength(1);
    const retry = new Subject<SystemHealth>();
    check.mockReturnValue(retry);
    component.refresh();
    fixture.detectChanges();
    expect(root.querySelector('.badge.good')).toBeNull();
    retry.next({ api: 'up', database: 'up' });
    retry.complete();
    fixture.detectChanges();
    expect(root.querySelectorAll('.badge.good')).toHaveLength(2);
    expect(root.querySelector('.service-warning')).toBeNull();
    expect(root.querySelector('.last-check')?.getAttribute('role')).toBe('status');
  });

  it('ofrece acceso al login sin sesión y no muestra el botón de parcelas', async () => {
    const fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.return-link')).toBeNull();
    const link = element.querySelector<HTMLAnchorElement>('a.phase');
    expect(link?.textContent).toContain('Acceder a la plataforma');
    expect(link?.getAttribute('href')).toBe('/login');
    link?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('vuelve a mis parcelas mediante el router sin perder la sesión', async () => {
    const auth = TestBed.inject(AuthService);
    auth.login('farmer@example.test', 'Test-only!').subscribe();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/auth/login').flush({
      accessToken: 'test-only-token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { id: 'test-user', name: 'Agricultor', email: 'farmer@example.test', role: 'FARMER' },
    });
    const fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const link = element.querySelector<HTMLAnchorElement>('a.return-link');
    expect(link?.textContent).toContain('Volver a mis parcelas');
    expect(link?.getAttribute('href')).toBe('/parcelas');
    expect(element.querySelector('a.phase')).toBeNull();
    link?.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/parcelas');
    expect(auth.accessToken()).toBe('test-only-token');
    expect(auth.user()?.id).toBe('test-user');
    auth.logout();
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();
    expect(element.querySelector('.return-link')).toBeNull();
    expect(element.querySelector('a.phase')).not.toBeNull();
    http.verify();
  });
});
