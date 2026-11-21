import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type { SensorThresholdResponse, TelemetrySubscription } from '@cacaosmart/contracts';
import { SensorThresholdsApi } from './sensor-thresholds-api.service';
import { SensorThresholdsFacade } from './sensor-thresholds.facade';
import {
  quantitativeSensors,
  QuantitativeSensorCode,
  ThresholdSensor,
} from './sensor-thresholds.types';

const selection: TelemetrySubscription = { plotId: 'plot-a', deviceId: 'device-a', source: 'real' };
const inventory: ThresholdSensor[] = Object.entries(quantitativeSensors).map(
  ([code, identity]) => ({
    id: `uuid-${code}`,
    code,
    ...identity,
    enabled: true,
  }),
);
const range = {
  id: 'range-a',
  minValue: 0,
  maxValue: 65,
  hysteresis: 0,
  version: 1,
  updatedBy: 'admin-a',
  effectiveAt: '2026-11-21T00:00:00Z',
};
const response = (
  code: QuantitativeSensorCode = 'soil_1',
  selected = selection,
): SensorThresholdResponse => ({
  sensorId: `uuid-${code}`,
  plotId: selected.plotId,
  deviceId: selected.deviceId,
  source: selected.source,
  ...quantitativeSensors[code],
  threshold: range,
});

describe('API de consulta de rangos: identidad y contrato', () => {
  let api: SensorThresholdsApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(SensorThresholdsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });
  const requestUrl = '/api/v1/sensors/uuid-soil_1/thresholds';

  it.each([null, range])(
    'solo hace GET con UUID y conserva rango/ausencia explícita %j',
    (threshold) => {
      let result: SensorThresholdResponse | undefined;
      api.get(selection, inventory[0], 'soil_1').subscribe((value) => (result = value));
      const request = http.expectOne(requestUrl);
      expect(request.request.method).toBe('GET');
      expect(request.request.body).toBeNull();
      request.flush({ ...response(), threshold });
      expect(result?.threshold).toEqual(threshold);
    },
  );

  it.each([
    { sensorId: 'another-sensor' },
    { deviceId: 'another-device' },
    { plotId: 'another-plot' },
    { source: 'demo' },
    { variable: 'TEMPERATURE' },
    { unit: 'CELSIUS' },
    { threshold: undefined },
    { threshold: { ...range, minValue: 80 } },
    { threshold: { ...range, minValue: '0' } },
    { threshold: { ...range, maxValue: 101 } },
    { threshold: { ...range, version: 0 } },
    { threshold: { ...range, effectiveAt: 'invalid-date' } },
  ])('rechaza respuestas ajenas o malformadas sin inventar rangos %j', (override) => {
    const next = vi.fn(),
      error = vi.fn();
    api.get(selection, inventory[0], 'soil_1').subscribe({ next, error });
    http.expectOne(requestUrl).flush({ ...response(), ...override });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('conserva DEMO únicamente cuando coincide con la selección', () => {
    const next = vi.fn();
    api.get({ ...selection, source: 'demo' }, inventory[0], 'soil_1').subscribe(next);
    http.expectOne(requestUrl).flush(response('soil_1', { ...selection, source: 'demo' }));
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ source: 'demo' }));
  });

  it('limita a ocho segundos una consulta sin respuesta y la cancela', () => {
    vi.useFakeTimers();
    try {
      const next = vi.fn(),
        error = vi.fn();
      api.get(selection, inventory[0], 'soil_1').subscribe({ next, error });
      const pending = http.expectOne(requestUrl);
      vi.advanceTimersByTime(8001);
      expect(error).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      expect(pending.cancelled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('PUT envía versión e identidad sin propietario, origen ni autor del cliente', () => {
    const input = {
      variable: 'SOIL_MOISTURE' as const,
      unit: 'PERCENT' as const,
      minValue: 0,
      maxValue: 65,
      expectedVersion: 0,
    };
    const next = vi.fn();
    api.put(selection, inventory[0], 'soil_1', input).subscribe(next);
    const pending = http.expectOne(requestUrl);
    expect(pending.request.method).toBe('PUT');
    expect(pending.request.body).toEqual(input);
    pending.flush(response());
    expect(next).toHaveBeenCalledTimes(1);
  });

  it.each([null, { ...range, minValue: 10 }, { ...range, version: 9 }])(
    'no confirma PUT con respuesta inconsistente %j',
    (threshold) => {
      const error = vi.fn();
      api
        .put(selection, inventory[0], 'soil_1', {
          variable: 'SOIL_MOISTURE',
          unit: 'PERCENT',
          minValue: 0,
          maxValue: 65,
          expectedVersion: 0,
        })
        .subscribe({ error });
      http.expectOne(requestUrl).flush({ ...response(), threshold });
      expect(error).toHaveBeenCalledTimes(1);
    },
  );

  it('un error de PUT no provoca reintentos automáticos', () => {
    const error = vi.fn();
    api
      .put(selection, inventory[0], 'soil_1', {
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        minValue: 0,
        maxValue: 65,
        expectedVersion: 0,
      })
      .subscribe({ error });
    http.expectOne(requestUrl).flush({}, { status: 409, statusText: 'Conflict' });
    expect(error).toHaveBeenCalledTimes(1);
    http.expectNone(requestUrl);
  });
});

describe('Fachada de rangos: ciclo independiente de telemetría', () => {
  let facade: SensorThresholdsFacade;
  let api: { get: ReturnType<typeof vi.fn> };
  const flush = () => vi.advanceTimersByTime(110);
  beforeEach(() => {
    vi.useFakeTimers();
    api = {
      get: vi.fn(
        (selected: TelemetrySubscription, _sensor: ThresholdSensor, code: QuantitativeSensorCode) =>
          of(response(code, selected)),
      ),
    };
    TestBed.configureTestingModule({
      providers: [SensorThresholdsFacade, { provide: SensorThresholdsApi, useValue: api }],
    });
    facade = TestBed.inject(SensorThresholdsFacade);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('consulta los cinco sensores cuantitativos por UUID, no la lluvia', () => {
    facade.select(
      selection,
      [
        ...inventory,
        {
          id: 'rain',
          code: 'rainDetected',
          variable: 'RAIN_DETECTED',
          unit: 'BOOLEAN',
          enabled: true,
        },
      ],
      true,
    );
    expect(facade.busy()).toBe(true);
    flush();
    expect(api.get).toHaveBeenCalledTimes(5);
    expect(api.get.mock.calls.map((call) => call[1].id)).toEqual(inventory.map((s) => s.id));
    expect(facade.states().soil_1.range?.minValue).toBe(0);
    expect(facade.busy()).toBe(false);
  });

  it('distingue sin configuración de error y conserva el resto de sensores', () => {
    api.get.mockImplementation(
      (selected: TelemetrySubscription, _sensor: ThresholdSensor, code: QuantitativeSensorCode) =>
        code === 'soil_1'
          ? of({ ...response(code, selected), threshold: null })
          : code === 'soil_2'
            ? throwError(() => new Error('403'))
            : of(response(code, selected)),
    );
    facade.select(selection, inventory, true);
    flush();
    expect(facade.states().soil_1.status).toBe('unconfigured');
    expect(facade.states().soil_2.status).toBe('error');
    expect(facade.states().soil_3.status).toBe('configured');
    expect(facade.hasErrors()).toBe(true);
  });

  it('oculta rangos anteriores si su nueva consulta falla, sin fallback DEMO', () => {
    facade.select(selection, inventory, true);
    flush();
    expect(facade.states().soil_1.status).toBe('configured');
    api.get.mockReturnValue(throwError(() => new Error('offline')));
    facade.reload();
    flush();
    expect(facade.states().soil_1).toMatchObject({ status: 'error', range: null });
    expect(api.get.mock.calls.every((call) => call[0].source === 'real')).toBe(true);
    api.get.mockImplementation(
      (selected: TelemetrySubscription, _sensor: ThresholdSensor, code: QuantitativeSensorCode) =>
        of(response(code, selected)),
    );
    facade.reload();
    flush();
    expect(facade.hasErrors()).toBe(false);
    expect(facade.states().soil_1.status).toBe('configured');
  });

  it.each([
    { ...selection, deviceId: 'device-b' },
    { ...selection, plotId: 'plot-b' },
    { ...selection, source: 'demo' as const },
  ])('cambiar selección cancela respuestas tardías anteriores %j', (nextSelection) => {
    const pending = new Subject<SensorThresholdResponse>();
    api.get.mockReturnValue(pending);
    facade.select(selection, inventory, true);
    flush();
    expect(pending.observers).toHaveLength(5);
    api.get.mockImplementation(
      (selected: TelemetrySubscription, _sensor: ThresholdSensor, code: QuantitativeSensorCode) =>
        of({ ...response(code, selected), threshold: null }),
    );
    facade.select(nextSelection, inventory, true);
    expect(facade.states().soil_1.range).toBeNull();
    expect(pending.observers).toHaveLength(0);
    flush();
    pending.next(response());
    pending.complete();
    expect(facade.states().soil_1.status).toBe('unconfigured');
    expect(api.get.mock.calls.at(-1)?.[0]).toEqual(nextSelection);
  });

  it('detiene consultas/timers y limpia rangos al salir o cerrar sesión', () => {
    const pending = new Subject<SensorThresholdResponse>();
    api.get.mockReturnValue(pending);
    facade.select(selection, inventory, true);
    flush();
    facade.stop();
    expect(pending.observers).toHaveLength(0);
    expect(facade.states().soil_1.status).toBe('unselected');
    expect(facade.busy()).toBe(false);
    facade.reload();
    vi.advanceTimersByTime(120000);
    expect(api.get).toHaveBeenCalledTimes(5);
  });

  it('actualiza cada 60 s y agrupa reintentos sin consultar en cada lectura', () => {
    facade.select(selection, inventory, true);
    flush();
    vi.advanceTimersByTime(15000);
    expect(api.get).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(45000);
    expect(api.get).toHaveBeenCalledTimes(10);
    facade.reload();
    facade.reload();
    facade.reload();
    flush();
    expect(api.get).toHaveBeenCalledTimes(15);
  });

  it('no consulta sensores ni dispositivos deshabilitados', () => {
    facade.select(
      selection,
      inventory.map((s) => ({ ...s, enabled: false })),
      true,
    );
    flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(facade.states().soil_1.status).toBe('disabled');
    facade.select(selection, inventory, false);
    flush();
    expect(api.get).not.toHaveBeenCalled();
    expect(facade.states().temperatureC.status).toBe('disabled');
  });

  it('la destrucción del dashboard libera consultas y temporizadores', () => {
    const pending = new Subject<SensorThresholdResponse>();
    api.get.mockReturnValue(pending);
    facade.select(selection, inventory, true);
    flush();
    TestBed.resetTestingModule();
    expect(pending.observers).toHaveLength(0);
    vi.advanceTimersByTime(120000);
    expect(api.get).toHaveBeenCalledTimes(5);
  });

  it('tras guardar cancela GET anteriores al commit antes de recargar tarjetas', () => {
    const old = new Subject<SensorThresholdResponse>();
    api.get.mockReturnValue(old);
    facade.select(selection, inventory, true);
    flush();
    expect(old.observers).toHaveLength(5);
    facade.reloadAfterSave();
    expect(old.observers).toHaveLength(0);
    expect(facade.states().soil_1.status).toBe('loading');
    api.get.mockImplementation(
      (selected: TelemetrySubscription, _sensor: ThresholdSensor, code: QuantitativeSensorCode) =>
        of({ ...response(code, selected), threshold: { ...range, version: 2 } }),
    );
    flush();
    old.next(response());
    old.complete();
    expect(facade.states().soil_1.range?.version).toBe(2);
    expect(facade.busy()).toBe(false);
  });

  it.each([
    { sensors: [] },
    { sensors: [inventory[0], inventory[0]] },
    { sensors: [{ ...inventory[0], unit: 'CELSIUS' }] },
  ])(
    'inventario ausente, ambiguo o incompatible no equivale a rango sin configurar %j',
    ({ sensors }) => {
      facade.select(selection, sensors, true);
      flush();
      expect(api.get).not.toHaveBeenCalled();
      expect(facade.states().soil_1.status).toBe('error');
    },
  );
});
