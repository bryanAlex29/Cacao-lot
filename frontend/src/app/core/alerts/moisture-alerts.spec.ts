import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MoisturePolicyResponse,
  SoilMoistureAlert,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import {
  checkedMoistureAlert,
  checkedMoisturePolicy,
  MoistureAlertsApi,
} from './moisture-alerts-api.service';
import { MoistureAlertsFacade } from './moisture-alerts.facade';

const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'demo' };
const policy = (): MoisturePolicyResponse => ({
  ...selection,
  sensorId: 'sensor',
  code: 'soil_1',
  status: 'ready',
  range: { minValue: 30, maxValue: 70, version: 1, effectiveAt: '2026-11-20T00:00:00Z' },
  policy: { recoveryMarginPct: 5, version: 1, updatedAt: '2026-11-20T00:00:00Z' },
});
export const moistureAlert = (): SoilMoistureAlert => ({
  ...selection,
  id: 'alert',
  sensorId: 'sensor',
  code: 'soil_1',
  type: 'LOW_SOIL_MOISTURE',
  minValue: 30,
  maxValue: 70,
  recoveryMarginPct: 5,
  policyVersion: 1,
  thresholdVersion: 1,
  firstLowAt: '2026-11-21T00:00:00Z',
  confirmedAt: '2026-11-21T00:00:10Z',
  detectedAt: '2026-11-21T00:00:11Z',
  triggerValue: 20,
  closedAt: null,
  closeReason: null,
  acknowledgedAt: null,
});
describe('Contratos y aislamiento de alertas de humedad', () => {
  it('admite ausencia explícita de configuración y una política sin defaults', () => {
    expect(
      checkedMoisturePolicy(
        { ...policy(), range: null, policy: null, status: 'no_range' },
        selection,
        'sensor',
      ).policy,
    ).toBeNull();
    expect(checkedMoisturePolicy(policy(), selection, 'sensor').status).toBe('ready');
  });
  it.each([
    { source: 'real' },
    { plotId: 'other' },
    { deviceId: 'other' },
    { sensorId: 'other' },
    { code: 'temperatureC' },
    { status: 'invented' },
    { range: null },
    { policy: null },
    { policy: { recoveryMarginPct: 0, version: 1, updatedAt: '2026-11-20T00:00:00Z' } },
    { policy: { recoveryMarginPct: 50, version: 1, updatedAt: '2026-11-20T00:00:00Z' } },
  ])('rechaza política incompatible %j', (override) => {
    expect(() =>
      checkedMoisturePolicy(
        { ...policy(), ...override } as MoisturePolicyResponse,
        selection,
        'sensor',
      ),
    ).toThrow();
  });
  it.each([
    { source: 'real' },
    { deviceId: 'other' },
    { plotId: 'other' },
    { code: 'rainDetected' },
    { triggerValue: 30 },
    { recoveryMarginPct: 0 },
    { recoveryMarginPct: 50 },
    { thresholdVersion: 0 },
    { firstLowAt: 'bad' },
    { confirmedAt: '2026-11-21T00:00:00Z' },
    { detectedAt: '2026-11-20T00:00:00Z' },
    { closeReason: 'RECOVERED' },
    { acknowledgedAt: '2026-11-20T00:00:00Z' },
    { closedAt: '2026-11-20T00:00:00Z', closeReason: 'RECOVERED' },
  ])('rechaza alerta incompatible %j', (override) => {
    expect(() =>
      checkedMoistureAlert({ ...moistureAlert(), ...override } as SoilMoistureAlert, selection),
    ).toThrow();
  });
  it('admite recuperación y cierre administrativo sin confundirlos', () => {
    for (const closeReason of ['RECOVERED', 'CONFIGURATION_CHANGED', 'MONITORING_STOPPED'] as const)
      expect(
        checkedMoistureAlert(
          { ...moistureAlert(), closedAt: '2026-11-21T00:01:00Z', closeReason },
          selection,
        ).closeReason,
      ).toBe(closeReason);
  });
});
describe('API de humedad: rutas y respuestas verificadas', () => {
  let api: MoistureAlertsApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(MoistureAlertsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  it('consulta y guarda margen con versiones de política y rango', async () => {
    const read = firstValueFrom(api.policy(selection, 'sensor'));
    http.expectOne('/api/v1/sensors/sensor/moisture-alert-policy').flush(policy());
    await read;
    const input = { recoveryMarginPct: 5, expectedVersion: 0, expectedThresholdVersion: 1 };
    const write = firstValueFrom(api.put(selection, 'sensor', input));
    const req = http.expectOne('/api/v1/sensors/sensor/moisture-alert-policy');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(input);
    req.flush(policy());
    expect((await write).policy?.version).toBe(1);
  });
  it('consulta paginada vinculada al dispositivo y origen', async () => {
    const result = firstValueFrom(api.list(selection, 5));
    const req = http.expectOne((r) => r.url.endsWith('/moisture-alerts'));
    expect(req.request.params.get('source')).toBe('demo');
    expect(req.request.params.get('deviceId')).toBe('device');
    req.flush({ items: [moistureAlert()], total: 6, limit: 5, offset: 5 });
    expect((await result).total).toBe(6);
  });
  it('no reintenta escritura incierta ni acepta reconocimiento sin sello', async () => {
    const result = firstValueFrom(api.acknowledge(selection, 'alert'));
    const assertion = expect(result).rejects.toThrow();
    http.expectOne('/api/v1/plots/plot/moisture-alerts/alert/acknowledge').flush(moistureAlert());
    await assertion;
  });
  it('rechaza páginas de otro origen', async () => {
    const result = firstValueFrom(api.list(selection, 0));
    const assertion = expect(result).rejects.toThrow();
    http
      .expectOne((r) => r.url.endsWith('/moisture-alerts'))
      .flush({ items: [{ ...moistureAlert(), source: 'real' }], total: 1, limit: 5, offset: 0 });
    await assertion;
  });
});
describe('Ciclo del panel independiente de telemetría', () => {
  let facade: MoistureAlertsFacade, http: HttpTestingController;
  const page = () => ({ items: [moistureAlert()], total: 1, limit: 5, offset: 0 });
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), MoistureAlertsFacade],
    });
    facade = TestBed.inject(MoistureAlertsFacade);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    facade.stop();
    http.verify({ ignoreCancelled: true });
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('consulta, reconoce sin cerrar y vuelve a consultar', async () => {
    facade.select(selection);
    await vi.advanceTimersByTimeAsync(100);
    http.expectOne((r) => r.url.endsWith('/moisture-alerts')).flush(page());
    facade.acknowledge('alert');
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ ...moistureAlert(), acknowledgedAt: '2026-11-21T00:00:12Z' });
    expect(facade.message()).toContain('no significa recuperación');
    await vi.advanceTimersByTimeAsync(100);
    http.expectOne((r) => r.url.endsWith('/moisture-alerts')).flush(page());
    expect(facade.page().items[0].closedAt).toBeNull();
  });
  it('cambio de selección cancela respuestas y borra evidencia anterior', async () => {
    facade.select(selection);
    await vi.advanceTimersByTimeAsync(100);
    const old = http.expectOne((r) => r.url.endsWith('/moisture-alerts'));
    facade.select({ ...selection, deviceId: 'other' });
    expect(old.cancelled).toBe(true);
    expect(facade.page().items).toEqual([]);
    await vi.advanceTimersByTimeAsync(100);
    http
      .expectOne((r) => r.params.get('deviceId') === 'other')
      .flush({ ...page(), items: [], total: 0 });
    expect(facade.error()).toBe('');
  });
  it('error no fabrica ausencia normal y reconocimiento incierto obliga a releer', async () => {
    facade.select(selection);
    await vi.advanceTimersByTimeAsync(100);
    http.expectOne((r) => r.url.endsWith('/moisture-alerts')).flush(page());
    facade.acknowledge('alert');
    http.expectOne((r) => r.method === 'POST').flush({}, { status: 500, statusText: 'Error' });
    expect(facade.uncertain()).toBe(true);
    facade.acknowledge('alert');
    http.expectNone((r) => r.method === 'POST');
    facade.reload();
    await vi.advanceTimersByTimeAsync(100);
    http
      .expectOne((r) => r.url.endsWith('/moisture-alerts'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(facade.error()).not.toBe('');
    expect(facade.page().items).toEqual([]);
  });
});
