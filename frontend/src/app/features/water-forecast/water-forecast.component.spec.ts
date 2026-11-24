import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { WaterForecastComponent } from './water-forecast.component';
import type { PredictionAvailability } from '@cacaosmart/contracts';

function snapshot(): PredictionAvailability {
  return {
    schemaVersion: '1.0',
    plotId: 'plot',
    source: 'real',
    evaluatedAt: '2026-11-24T12:00:00Z',
    window: {
      from: '2026-10-25T00:00:00Z',
      toExclusive: '2026-11-24T00:00:00Z',
      timezone: 'UTC',
      completeDays: 30,
    },
    target: { variable: 'soil_moisture', unit: '%', horizonDays: 1 },
    status: 'unavailable',
    reason: 'model_not_implemented',
    model: null,
    predictions: [],
    waterDemand: null,
    device: { id: 'device', serial: 'ESP prueba', isActive: true },
    zones: (['soil_1', 'soil_2', 'soil_3'] as const).map((code) => ({
      code,
      sensorId: code,
      enabled: true,
      samples: 0,
      validSamples: 0,
      validDaysUtc: 0,
      firstValidAt: null,
      lastValidAt: null,
    })),
  };
}
const device = {
  id: 'device',
  plotId: 'plot',
  serial: 'ESP prueba',
  source: 'real',
  status: 'UNKNOWN',
  isActive: true,
  expectedIntervalSeconds: 60,
  lastSeenAt: null,
  createdAt: '2026-11-01T00:00:00Z',
  sensors: [],
};
describe('Pantalla de predicción: cobertura privada sin inventar resultados', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    const params = new BehaviorSubject(convertToParamMap({ id: 'plot' }));
    const user = signal<{ name: string; role: string } | null>({ name: 'Usuario', role: 'FARMER' });
    const logout = vi.fn();
    await TestBed.configureTestingModule({
      imports: [WaterForecastComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        { provide: AuthService, useValue: { user, logout } },
      ],
    }).compileComponents();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(WaterForecastComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const respond = (items = [device], total = items.length, offset = 0, id = 'plot') => {
      http.expectOne(`/api/v1/plots/${id}`).flush({ id, name: 'Cacao', locationLabel: 'Chone' });
      http
        .expectOne(
          (req) =>
            req.url === `/api/v1/plots/${id}/devices` &&
            req.params.get('offset') === String(offset),
        )
        .flush({ items, total, limit: 10, offset });
      fixture.detectChanges();
    };
    const prediction = () =>
      http.expectOne(
        (req) => req.url.endsWith('/predictions') && req.params.get('deviceId') === 'device',
      );
    return { fixture, http, respond, prediction, params, user, logout, navigate };
  }
  it('exige selección, muestra indisponibilidad y no afirma conexión en vivo', async () => {
    const { fixture, http, respond } = await setup();
    respond();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.textContent).toContain('modelo no implementado');
    expect(root.querySelector('app-page-header .connection')).toBeNull();
    expect(root.querySelector('[aria-current="page"]')?.textContent).toContain(
      'Predicción hídrica',
    );
    http.expectNone((req) => req.url.endsWith('/predictions'));
    http.verify();
  });
  it('vacío no genera equipos ni datos DEMO', async () => {
    const { fixture, http, respond } = await setup();
    respond([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'No hay equipos registrados',
    );
    expect(fixture.componentInstance.snapshot()).toBeNull();
    http.verify();
  });
  it('renderiza A/B/C, ceros, ausencia, UTC y advertencia de calibración', async () => {
    const { fixture, http, respond, prediction } = await setup();
    respond();
    fixture.componentInstance.choose('device');
    const req = prediction();
    expect(req.request.params.get('source')).toBe('real');
    expect(req.request.params.get('horizonDays')).toBe('1');
    req.flush(snapshot());
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('article')).toHaveLength(3);
    expect(root.querySelector('article')?.textContent).toContain('Sin muestras válidas');
    expect(root.textContent).toContain('calibración no evaluada');
    expect(root.textContent).toContain('0 de 30');
    expect(root.textContent).toContain('No disponible');
    http.expectNone((request) => request.method !== 'GET');
    http.verify();
  });
  it('equipo DEMO usa origen explícito y se etiqueta sin fallback', async () => {
    const { fixture, http, respond, prediction } = await setup();
    respond([{ ...device, source: 'demo' }]);
    fixture.componentInstance.choose('device');
    const req = prediction();
    expect(req.request.params.get('source')).toBe('demo');
    req.flush({ ...snapshot(), source: 'demo' });
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.source.demo')?.textContent,
    ).toContain('DEMO');
    http.verify();
  });
  it('rechaza una respuesta de otro equipo sin mostrar cobertura', async () => {
    const { fixture, http, respond, prediction } = await setup();
    respond();
    fixture.componentInstance.choose('device');
    prediction().flush({ ...snapshot(), device: { ...snapshot().device, id: 'foreign' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.snapshot()).toBeNull();
    expect(fixture.componentInstance.error()).toContain('No se pudo comprobar');
    http.verify();
  });
  it('error de consulta permite reintentar sin datos ficticios ni escrituras', async () => {
    const { fixture, http, respond, prediction } = await setup();
    respond();
    fixture.componentInstance.choose('device');
    prediction().flush({}, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.componentInstance.snapshot()).toBeNull();
    fixture.componentInstance.choose('device');
    prediction().flush(snapshot());
    expect(fixture.componentInstance.snapshot()?.status).toBe('unavailable');
    http.verify();
  });
  it('paginación cancela cobertura y limpia selección anterior', async () => {
    const { fixture, http, respond, prediction } = await setup();
    respond([device], 11);
    fixture.componentInstance.choose('device');
    const pending = prediction();
    fixture.componentInstance.loadDevices(10);
    expect(pending.cancelled).toBe(true);
    respond([{ ...device, id: 'device2' }], 11, 10);
    expect(fixture.componentInstance.selectedId()).toBe('');
    expect(fixture.componentInstance.snapshot()).toBeNull();
    http.verify();
  });
  it('cambiar parcela cancela consulta y no conserva equipo ni cobertura ajenos', async () => {
    const { fixture, http, respond, prediction, params } = await setup();
    respond();
    fixture.componentInstance.choose('device');
    const pending = prediction();
    params.next(convertToParamMap({ id: 'plot2' }));
    expect(pending.cancelled).toBe(true);
    respond([], 0, 0, 'plot2');
    expect(fixture.componentInstance.snapshot()).toBeNull();
    expect(fixture.componentInstance.selectedId()).toBe('');
    http.verify();
  });
  it('salir limpia estado, cancela pendiente y vuelve a login', async () => {
    const { fixture, http, respond, prediction, logout, navigate } = await setup();
    respond();
    fixture.componentInstance.choose('device');
    const pending = prediction();
    fixture.componentInstance.logout();
    expect(pending.cancelled).toBe(true);
    expect(fixture.componentInstance.plot()).toBeNull();
    expect(logout).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login');
    http.verify();
  });
});
