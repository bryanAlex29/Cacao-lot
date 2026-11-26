import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { WeatherComponent } from './weather.component';
import type { WeatherSnapshot } from '@cacaosmart/contracts';

describe('Encabezado de clima privado', () => {
  afterEach(() => TestBed.resetTestingModule());
  const stored: WeatherSnapshot = {
    provider: 'disabled',
    profile: {
      latitude: -0.7,
      longitude: -80.1,
      timezone: 'America/Guayaquil',
      enabled: false,
      version: 1,
      updatedAt: '2026-11-01T00:00:00Z',
      consentAt: null,
      syncedAt: null,
      nextAttemptAt: null,
      lastError: null,
    },
    items: [
      { date: '2026-11-01', variable: 'temperature_2m', unit: '°C', value: 0, quality: 'modeled' },
      {
        date: '2026-11-01',
        variable: 'precipitation',
        unit: 'mm',
        value: null,
        quality: 'missing',
      },
    ],
    provenance: {
      provider: 'Open-Meteo',
      dataset: 'ERA5',
      model: 'era5',
      requestedLatitude: -0.7,
      requestedLongitude: -80.1,
      gridLatitude: -0.75,
      gridLongitude: -80,
      timezone: 'America/Guayaquil',
      resolution: '0.25°',
      sourceTemporalResolution: 'hourly',
      aggregation: 'daily',
      adapterVersion: 'test',
      licence: 'CC BY 4.0',
      attribution: 'Open-Meteo / ECMWF',
      fetchedAt: '2026-11-02T00:00:00Z',
      from: '2026-11-01',
      to: '2026-11-01',
    },
  };
  async function setup(role = 'FARMER') {
    const logout = vi.fn();
    await TestBed.configureTestingModule({
      imports: [WeatherComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'plot' })) } },
        {
          provide: AuthService,
          useValue: { user: signal({ name: 'Usuario', role }), logout },
        },
      ],
    }).compileComponents();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(WeatherComponent);
    fixture.detectChanges();
    return { fixture, http: TestBed.inject(HttpTestingController), logout, navigate };
  }
  it('usa parcela autorizada sin afirmar conexión del sensor y conserva un solo h1', async () => {
    const { fixture, http } = await setup();
    http
      .expectOne('/api/v1/plots/plot')
      .flush({ id: 'plot', name: 'Cacao', locationLabel: 'Chone' });
    http
      .expectOne('/api/v1/plots/plot/weather')
      .flush({ provider: 'disabled', profile: null, items: [], provenance: null });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('app-page-header')?.textContent).toContain('Cacao');
    expect(root.querySelector('app-page-header')?.textContent).toContain('Chone');
    expect(root.querySelector('app-page-header .connection')).toBeNull();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    http.verify();
  });
  it('filtra tabla local sin peticiones; conserva cero, ausencia y procedencia antigua', async () => {
    const { fixture, http } = await setup();
    http
      .expectOne('/api/v1/plots/plot')
      .flush({ id: 'plot', name: 'Cacao', locationLabel: 'Chone' });
    http.expectOne('/api/v1/plots/plot/weather').flush(stored);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(root.querySelector('tbody')?.textContent).toContain('0 °C');
    expect(root.querySelector('tbody')?.textContent).toContain('No disponible');
    expect(root.querySelector('.provenance.stale')?.textContent).toContain('Consulta antigua');
    const select = root.querySelector<HTMLSelectElement>('.table-tools select')!;
    select.value = 'precipitation';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(root.querySelector('tbody')?.textContent).toContain('Incompleto');
    expect(root.querySelector('form')).toBeNull();
    expect(root.textContent).toContain('No son mediciones de tus sensores ni pronósticos');
    http.expectNone(() => true);
    http.verify();
  });
  it('ADMIN ve autorización separada y no sincroniza al filtrar ni guardar borrador', async () => {
    const { fixture, http } = await setup('ADMIN');
    http
      .expectOne('/api/v1/plots/plot')
      .flush({ id: 'plot', name: 'Cacao', locationLabel: 'Chone' });
    http.expectOne('/api/v1/plots/plot/weather').flush(stored);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('form .check')?.textContent).toContain(
      'Autorizo enviar estas coordenadas',
    );
    expect(root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    fixture.componentInstance.form.controls.latitude.setValue(95);
    fixture.componentInstance.save();
    fixture.detectChanges();
    expect(
      root.querySelector('input[formControlName="latitude"]')?.getAttribute('aria-invalid'),
    ).toBe('true');
    fixture.componentInstance.sync();
    http.expectNone((req) => req.method !== 'GET');
    http.verify();
  });
  it('error de lectura permite reintentar sin consultar al proveedor ni inventar datos', async () => {
    const { fixture, http } = await setup();
    http.expectOne('/api/v1/plots/plot').flush({ id: 'plot', name: 'Cacao' });
    http
      .expectOne('/api/v1/plots/plot/weather')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      'Actualiza para reintentar',
    );
    root.querySelector<HTMLButtonElement>('main button')!.click();
    http.expectOne('/api/v1/plots/plot').flush({ id: 'plot', name: 'Cacao' });
    http
      .expectOne('/api/v1/plots/plot/weather')
      .flush({ provider: 'disabled', profile: null, items: [], provenance: null });
    fixture.detectChanges();
    expect(root.querySelector('.empty-state')?.textContent).toContain('No se muestran ejemplos');
    expect(root.querySelector('[role="alert"]')).toBeNull();
    http.expectNone((req) => req.method !== 'GET');
    http.verify();
  });
  it('salir cancela consultas y limpia contexto sin nuevos envíos', async () => {
    const { fixture, http, logout, navigate } = await setup();
    const plot = http.expectOne('/api/v1/plots/plot');
    const weather = http.expectOne('/api/v1/plots/plot/weather');
    fixture.nativeElement.querySelector('app-page-header button').click();
    expect(plot.cancelled).toBe(true);
    expect(weather.cancelled).toBe(true);
    expect(fixture.componentInstance.plot()).toBeNull();
    expect(fixture.componentInstance.snapshot()).toBeNull();
    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
    http.verify();
  });
  it.each(['updated', 'cooldown', 'unknown'])(
    'sincronización %s valida respuesta sin reenvío',
    async (status) => {
      const { fixture, http } = await setup('ADMIN');
      const snapshot = {
        ...stored,
        provider: 'open-meteo',
        profile: { ...stored.profile!, enabled: true },
      };
      http.expectOne('/api/v1/plots/plot').flush({ id: 'plot', name: 'Cacao' });
      http.expectOne('/api/v1/plots/plot/weather').flush(snapshot);
      const component = fixture.componentInstance;
      component.sync();
      const write = http.expectOne('/api/v1/plots/plot/weather/sync');
      component.load();
      http.expectNone('/api/v1/plots/plot');
      expect(write.cancelled).toBe(false);
      write.flush({ ...snapshot, status });
      expect(component.uncertain()).toBe(status === 'unknown');
      if (status === 'unknown') {
        component.sync();
        component.save();
        http.expectNone(() => true);
        component.load();
        http.expectOne('/api/v1/plots/plot').flush({ id: 'plot', name: 'Cacao' });
        http.expectOne('/api/v1/plots/plot/weather').flush(snapshot);
        expect(component.uncertain()).toBe(false);
      }
      http.verify();
    },
  );
});
