import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, it, expect } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { HealthService } from '../../core/health/health.service';
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
    expect(element.textContent).toContain('Sin datos de sensores todavía.');
    expect(element.textContent).toContain('No disponible');
    expect(element.textContent).not.toContain('Sistema en línea');
    expect(element.querySelector('h1')?.textContent).toContain('cuidar el cacao');
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
