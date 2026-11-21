import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type {
  SensorThresholdHistoryResponse,
  TelemetryReading,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { checkedThresholdHistory, ThresholdHistoryApi } from './threshold-history-api.service';
import { historyWindow, ThresholdHistoryFacade } from './threshold-history.facade';
import type { ThresholdSensor } from './sensor-thresholds.types';

const from = '2026-11-20T00:00:00.000Z',
  middle = '2026-11-20T12:00:00.000Z',
  to = '2026-11-21T00:00:00.001Z';
const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'real' };
const inventory: ThresholdSensor[] = ['soil_1', 'soil_2', 'soil_3'].map((code) => ({
  id: `uuid-${code}`,
  code,
  variable: 'SOIL_MOISTURE',
  unit: 'PERCENT',
  enabled: true,
}));
const range = { minValue: 20, maxValue: 70, effectiveAt: middle, version: 1 };
const response = (sensorId = inventory[0].id): SensorThresholdHistoryResponse => ({
  ...selection,
  sensorId,
  variable: 'SOIL_MOISTURE',
  unit: 'PERCENT',
  from,
  to,
  intervals: [
    { from, to: middle, threshold: null },
    { from: middle, to, threshold: range },
  ],
});
const readings = [
  { deviceId: 'device', source: 'real', recordedAt: null, receivedAt: '2026-11-21T00:00:00.000Z' },
  { deviceId: 'device', source: 'real', recordedAt: from, receivedAt: middle },
] as TelemetryReading[];

describe('Contrato histórico validado antes de dibujar', () => {
  it('acepta ausencia explícita seguida de un rango y cobertura exacta', () => {
    expect(checkedThresholdHistory(response(), selection, inventory[0], from, to)).toEqual(
      response(),
    );
  });
  it.each([
    { sensorId: 'other' },
    { deviceId: 'other' },
    { plotId: 'other' },
    { source: 'demo' },
    { variable: 'TEMPERATURE' },
    { unit: 'CELSIUS' },
    { from: middle },
    { to: middle },
    { intervals: [] },
    { intervals: null },
    { intervals: [{ from, to: middle, threshold: null }] },
    { intervals: [{ from: middle, to, threshold: range }] },
    { intervals: [{ from, to: 'bad', threshold: null }] },
    { intervals: [{ from, to, threshold: { ...range, effectiveAt: to } }] },
    { intervals: [{ from, to, threshold: { ...range, effectiveAt: from, maxValue: 101 } }] },
    { intervals: [{ from, to, threshold: { ...range, effectiveAt: from, minValue: 80 } }] },
    { intervals: [{ from, to, threshold: { ...range, effectiveAt: from, version: 0 } }] },
    {
      intervals: [
        { from, to: middle, threshold: { ...range, effectiveAt: from } },
        { from: middle, to, threshold: null },
      ],
    },
  ])('rechaza respuesta ajena, incompleta o incompatible %j', (override) => {
    expect(() =>
      checkedThresholdHistory(
        { ...response(), ...override } as SensorThresholdHistoryResponse,
        selection,
        inventory[0],
        from,
        to,
      ),
    ).toThrow();
  });
  it('usa recordedAt cuando existe y receivedAt como alternativa; incluye la lectura más reciente', () => {
    expect(historyWindow(readings)).toEqual({ from, to });
    expect(historyWindow([])).toBeNull();
    expect(historyWindow([{ ...readings[0], receivedAt: 'bad' }])).toBeNull();
  });
});

describe('API histórica: solo lectura y periodo de la página', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('hace GET con UUID, fechas y timeout sin modificar rangos', () => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(ThresholdHistoryApi),
      http = TestBed.inject(HttpTestingController);
    const error = vi.fn();
    api.get(selection, { ...inventory[0], code: 'soil_1' }, from, to).subscribe({ error });
    const request = http.expectOne((r) => r.url.endsWith('/uuid-soil_1/thresholds/history'));
    expect(request.request.method).toBe('GET');
    expect(request.request.body).toBeNull();
    expect(request.request.params.get('from')).toBe(from);
    expect(request.request.params.get('to')).toBe(to);
    vi.advanceTimersByTime(8001);
    expect(error).toHaveBeenCalledTimes(1);
    expect(request.cancelled).toBe(true);
    http.verify();
  });
});

describe('Fachada histórica: aislamiento, cancelación y errores independientes', () => {
  let facade: ThresholdHistoryFacade;
  let api: { get: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      get: vi.fn((_selected: TelemetrySubscription, sensor: ThresholdSensor) =>
        of(response(sensor.id)),
      ),
    };
    TestBed.configureTestingModule({
      providers: [ThresholdHistoryFacade, { provide: ThresholdHistoryApi, useValue: api }],
    });
    facade = TestBed.inject(ThresholdHistoryFacade);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const flush = () => vi.advanceTimersByTime(110);

  it('consulta solo tres sondas y el dominio temporal de la página actual', () => {
    facade.load(selection, inventory, true, readings);
    flush();
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(api.get).toHaveBeenCalledWith(selection, { ...inventory[0], code: 'soil_1' }, from, to);
    expect(facade.states().soil_1.status).toBe('ready');
  });
  it('un fallo no suprime las otras dos sondas y permite reintento', () => {
    api.get.mockImplementation((_selection: TelemetrySubscription, sensor: ThresholdSensor) =>
      sensor.code === 'soil_1' ? throwError(() => new Error('offline')) : of(response(sensor.id)),
    );
    facade.load(selection, inventory, true, readings);
    flush();
    expect(facade.states().soil_1.status).toBe('error');
    expect(facade.states().soil_2.status).toBe('ready');
    api.get.mockImplementation((_selection: TelemetrySubscription, sensor: ThresholdSensor) =>
      of(response(sensor.id)),
    );
    facade.reload();
    flush();
    expect(facade.states().soil_1.status).toBe('ready');
  });
  it('deshabilitados y un inventario incompatible no envían consultas', () => {
    facade.load(
      selection,
      inventory.map((s) => ({ ...s, enabled: false })),
      true,
      readings,
    );
    flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(facade.states().soil_1.status).toBe('disabled');
    facade.load(selection, [], true, readings);
    flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(facade.states().soil_1.status).toBe('error');
  });
  it('cambiar selección cancela inmediatamente peticiones antiguas y el debounce pendiente', () => {
    const old = new Subject<SensorThresholdHistoryResponse>();
    api.get.mockReturnValue(old);
    facade.load(selection, inventory, true, readings);
    flush();
    expect(old.observed).toBe(true);
    facade.load({ ...selection, source: 'demo' }, inventory, true, []);
    expect(old.observed).toBe(false);
    old.next(response());
    flush();
    expect(facade.states().soil_1.status).toBe('idle');
    facade.load(selection, inventory, true, readings);
    facade.stop();
    flush();
    expect(api.get).toHaveBeenCalledTimes(3);
  });
  it('recargar después de guardar cancela GET anteriores al commit', () => {
    const old = new Subject<SensorThresholdHistoryResponse>();
    api.get.mockReturnValue(old);
    facade.load(selection, inventory, true, readings);
    flush();
    facade.reload();
    expect(old.observed).toBe(false);
    api.get.mockImplementation((_selection: TelemetrySubscription, sensor: ThresholdSensor) =>
      of(response(sensor.id)),
    );
    flush();
    expect(facade.states().soil_1.status).toBe('ready');
  });
  it('rechaza lecturas de otro equipo/origen sin buscar datos de sustitución', () => {
    facade.load({ ...selection, deviceId: 'other' }, inventory, true, readings);
    flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(facade.states().soil_1.status).toBe('error');
  });
  it('una nueva página limpia límites anteriores antes de cargar otros', () => {
    facade.load(selection, inventory, true, readings);
    flush();
    expect(facade.states().soil_1.intervals.length).toBeGreaterThan(0);
    facade.load(selection, inventory, true, [{ ...readings[0], receivedAt: from }]);
    expect(facade.states().soil_1.intervals).toEqual([]);
    expect(facade.states().soil_1.status).toBe('loading');
    facade.stop();
    facade.reload();
    flush();
    expect(facade.states().soil_1.status).toBe('idle');
  });
});
