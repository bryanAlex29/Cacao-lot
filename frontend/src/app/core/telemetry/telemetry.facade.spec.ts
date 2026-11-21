import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type {
  TelemetryReading,
  TelemetrySnapshot,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { ApiTelemetryDataSource, DemoTelemetryDataSource } from './api-telemetry-data-source';
import { TelemetryFacade } from './telemetry.facade';
import type { TelemetryStream } from './telemetry-data-source';

const selection: TelemetrySubscription = {
  plotId: 'plot-test',
  deviceId: 'device-test',
  source: 'real',
};
const reading: TelemetryReading = {
  eventId: 'new',
  deviceId: selection.deviceId,
  source: 'real',
  recordedAt: null,
  receivedAt: '2026-11-20T00:00:00.000Z',
  timestampOrigin: 'server',
  soilMoisture: { soil_1: 0, soil_2: 50, soil_3: null },
  temperatureC: 28,
  airHumidityPct: 80,
  rainDetected: false,
  valve: { relayCommandedOpen: true, feedbackOpen: null },
  quality: {
    soil_1: 'uncalibrated',
    soil_2: 'uncalibrated',
    soil_3: 'missing',
    temperatureC: 'uncalibrated',
    airHumidityPct: 'uncalibrated',
    rainDetected: 'valid',
    relayCommandedOpen: 'valid',
    feedbackOpen: 'missing',
  },
};
const snapshot: TelemetrySnapshot = {
  plotId: selection.plotId,
  source: 'real',
  device: {
    id: selection.deviceId,
    status: 'online',
    lastSeenAt: reading.receivedAt,
    expectedIntervalSeconds: 60,
  },
  reading,
};

describe('TelemetryFacade: recuperación REST y aislamiento', () => {
  let facade: TelemetryFacade;
  let events: Subject<TelemetryStream>;
  let api: {
    snapshot: ReturnType<typeof vi.fn>;
    history: ReturnType<typeof vi.fn>;
    updates: ReturnType<typeof vi.fn>;
  };
  let demo: typeof api;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(reading.receivedAt));
    events = new Subject();
    api = {
      snapshot: vi.fn(() => of(snapshot)),
      history: vi.fn(() => of({ items: [reading], total: 250, limit: 100, offset: 0 })),
      updates: vi.fn(() => events),
    };
    demo = {
      snapshot: vi.fn(() => of({ ...snapshot, source: 'demo' })),
      history: vi.fn(() => of({ items: [], total: 0, limit: 100, offset: 0 })),
      updates: vi.fn(() => new Subject<TelemetryStream>()),
    };
    TestBed.configureTestingModule({
      providers: [
        TelemetryFacade,
        { provide: ApiTelemetryDataSource, useValue: api },
        { provide: DemoTelemetryDataSource, useValue: demo },
      ],
    });
    facade = TestBed.inject(TelemetryFacade);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const flush = () => vi.advanceTimersByTime(110);

  it('recupera snapshot e histórico sin convertir null/cero ni feedback desconocido', () => {
    facade.select(selection);
    flush();
    expect(facade.snapshot()?.reading?.soilMoisture).toEqual({
      soil_1: 0,
      soil_2: 50,
      soil_3: null,
    });
    expect(facade.snapshot()?.reading?.valve.feedbackOpen).toBeNull();
    expect(api.history).toHaveBeenCalledWith(
      selection,
      '2026-11-19T00:00:00.100Z',
      '2026-11-20T00:00:00.100Z',
      0,
    );
    expect(demo.snapshot).not.toHaveBeenCalled();
  });
  it('demo es explícito, no consulta datos reales', () => {
    facade.select({ ...selection, source: 'demo' });
    flush();
    expect(demo.snapshot).toHaveBeenCalled();
    expect(api.snapshot).not.toHaveBeenCalled();
  });
  it('mensajes atrasados no reemplazan el último: resincroniza con REST', () => {
    facade.select(selection);
    flush();
    events.next({
      kind: 'reading',
      event: {
        schemaVersion: '1.0',
        plotId: selection.plotId,
        reading: { ...reading, eventId: 'old', receivedAt: '2026-01-01T00:00:00Z' },
      },
    });
    flush();
    expect(facade.snapshot()?.reading?.eventId).toBe('new');
    expect(api.snapshot).toHaveBeenCalledTimes(2);
  });
  it('desconexión conserva fecha original y reconexión recupera la lectura perdida', () => {
    facade.select(selection);
    flush();
    events.next({ kind: 'disconnected' });
    expect(facade.stream()).toBe('disconnected');
    expect(facade.snapshot()?.reading?.receivedAt).toBe(reading.receivedAt);
    api.snapshot.mockReturnValue(of({ ...snapshot, reading: { ...reading, eventId: 'missed' } }));
    events.next({ kind: 'connected' });
    flush();
    expect(facade.stream()).toBe('connected');
    expect(facade.snapshot()?.reading?.eventId).toBe('missed');
  });
  it('consulta periódica recupera datos sin socket', () => {
    facade.select(selection);
    flush();
    vi.advanceTimersByTime(15110);
    expect(api.snapshot.mock.calls.length).toBeGreaterThan(1);
  });
  it('fallo real no produce fallback demo y mantiene error visible', () => {
    api.snapshot.mockReturnValue(throwError(() => new Error('offline')));
    facade.select(selection);
    flush();
    expect(facade.error()).toContain('No se pudieron');
    expect(facade.snapshot()).toBeNull();
    expect(demo.snapshot).not.toHaveBeenCalled();
  });
  it('selección nueva cancela respuestas anteriores y elimina suscripciones', () => {
    const pending = new Subject<TelemetrySnapshot>();
    api.snapshot.mockReturnValueOnce(pending);
    facade.select(selection);
    flush();
    facade.select({ ...selection, deviceId: 'other' });
    flush();
    pending.next({ ...snapshot, reading: { ...reading, eventId: 'wrong-device' } });
    pending.complete();
    expect(facade.snapshot()?.reading?.eventId).not.toBe('wrong-device');
    expect(events.observers).toHaveLength(1);
    facade.stop();
    expect(events.observers).toHaveLength(0);
    expect(facade.snapshot()).toBeNull();
  });
  it('cambia intervalo y pagina sin cargar todo el histórico', () => {
    facade.select(selection);
    flush();
    facade.page(100);
    flush();
    expect(api.history.mock.calls.at(-1)?.[3]).toBe(100);
    facade.setDays(7);
    flush();
    expect(facade.offset()).toBe(0);
    expect(api.history.mock.calls.at(-1)?.[1]).toContain('2026-11-13');
    facade.setDays(99);
    expect(facade.days()).toBe(7);
  });
  it('conexión caduca sin lecturas nuevas y marca dato antiguo', () => {
    facade.select(selection);
    flush();
    expect(facade.status()).toBe('online');
    vi.advanceTimersByTime(122000);
    expect(facade.status()).toBe('stale');
    expect(facade.readingStale()).toBe(true);
    vi.advanceTimersByTime(180000);
    expect(facade.status()).toBe('offline');
  });
  it('al reconectar manualmente reinicia suscripción sin duplicarla', () => {
    facade.select(selection);
    flush();
    facade.reconnect();
    flush();
    expect(events.observers).toHaveLength(1);
    expect(api.updates).toHaveBeenCalledTimes(2);
  });
  it('device.status no vuelve a descargar histórico ni retrocede última conexión', () => {
    facade.select(selection);
    flush();
    const calls = api.history.mock.calls.length;
    events.next({
      kind: 'status',
      event: {
        ...selection,
        status: 'offline',
        lastSeenAt: snapshot.device!.lastSeenAt,
        expectedIntervalSeconds: 60,
      },
    });
    flush();
    expect(facade.status()).toBe('offline');
    expect(api.history.mock.calls.length).toBe(calls);
    events.next({
      kind: 'status',
      event: {
        ...selection,
        status: 'online',
        lastSeenAt: '2026-01-01T00:00:00Z',
        expectedIntervalSeconds: 60,
      },
    });
    expect(facade.status()).toBe('offline');
  });
});
