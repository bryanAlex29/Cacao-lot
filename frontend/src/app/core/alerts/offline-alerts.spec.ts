import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type { DeviceOfflineAlert, Page, TelemetrySubscription } from '@cacaosmart/contracts';
import { checkedOfflineAlert, OfflineAlertsApi } from './offline-alerts-api.service';
import { OfflineAlertsFacade } from './offline-alerts.facade';

const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'real' };
const alert: DeviceOfflineAlert = {
  ...selection,
  id: 'alert',
  type: 'DEVICE_OFFLINE',
  severity: 'warning',
  lastSeenAt: '2026-11-21T00:00:00Z',
  expectedIntervalSeconds: 5,
  detectedAt: '2026-11-21T00:00:26Z',
  closedAt: null,
  closeReason: null,
  acknowledgedAt: null,
};
const acknowledged = { ...alert, acknowledgedAt: '2026-11-21T00:00:27Z' };
const page: Page<DeviceOfflineAlert> = { items: [alert], total: 1, limit: 5, offset: 0 };

describe('Alerta validada por identidad, origen y evidencia temporal', () => {
  it.each([
    alert,
    acknowledged,
    { ...alert, closedAt: '2026-11-21T00:00:30Z', closeReason: 'CONTACT_RESTORED' as const },
    { ...alert, closedAt: '2026-11-21T00:00:30Z', closeReason: 'MONITORING_STOPPED' as const },
  ])('acepta estado observado sin equiparar reconocimiento con recuperación %j', (value) => {
    expect(checkedOfflineAlert(value, selection)).toEqual(value);
  });
  it.each([
    { id: '' },
    { plotId: 'other' },
    { deviceId: 'other' },
    { source: 'demo' },
    { type: 'LOW_MOISTURE' },
    { severity: 'critical' },
    { lastSeenAt: 'bad' },
    { detectedAt: 'bad' },
    { detectedAt: '2026-11-21T00:00:25Z' },
    { expectedIntervalSeconds: 0 },
    { expectedIntervalSeconds: 1.5 },
    { acknowledgedAt: 'bad' },
    { acknowledgedAt: '2026-11-21T00:00:00Z' },
    { closeReason: 'CONTACT_RESTORED' },
    { closedAt: '2026-11-21T00:00:30Z' },
    { closedAt: '2026-11-21T00:00:20Z', closeReason: 'CONTACT_RESTORED' },
  ])('rechaza respuestas ajenas o malformadas %j', (override) => {
    expect(() =>
      checkedOfflineAlert({ ...alert, ...override } as DeviceOfflineAlert, selection),
    ).toThrow();
  });
});

describe('API de alertas: lectura paginada y reconocimiento explícito', () => {
  let api: OfflineAlertsApi, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(OfflineAlertsApi);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  it('consulta un dispositivo y origen sin mezclar páginas', () => {
    const next = vi.fn();
    api.list(selection, 0).subscribe(next);
    const request = http.expectOne((r) => r.url === '/api/v1/plots/plot/alerts');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('deviceId')).toBe('device');
    expect(request.request.params.get('source')).toBe('real');
    expect(request.request.params.get('limit')).toBe('5');
    request.flush(page);
    expect(next).toHaveBeenCalledWith(page);
  });
  it.each([
    { offset: 5 },
    { limit: 20 },
    { total: -1 },
    { items: null },
    { items: [alert, alert] },
    { items: [{ ...alert, deviceId: 'other' }] },
  ])('rechaza páginas incompatibles %j', (override) => {
    const error = vi.fn();
    api.list(selection, 0).subscribe({ error });
    http.expectOne((r) => r.url.endsWith('/alerts')).flush({ ...page, ...override });
    expect(error).toHaveBeenCalledTimes(1);
  });
  it('POST no envía actor, fecha, origen ni estado de recuperación', () => {
    const next = vi.fn();
    api.acknowledge(selection, alert.id).subscribe(next);
    const request = http.expectOne('/api/v1/plots/plot/alerts/alert/acknowledge');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush(acknowledged);
    expect(next).toHaveBeenCalledWith(acknowledged);
  });
  it.each([alert, { ...acknowledged, id: 'other' }])(
    'no confirma un POST con respuesta incoherente %j',
    (value) => {
      const error = vi.fn();
      api.acknowledge(selection, alert.id).subscribe({ error });
      http.expectOne('/api/v1/plots/plot/alerts/alert/acknowledge').flush(value);
      expect(error).toHaveBeenCalledTimes(1);
    },
  );
  it('timeout cancela un POST y no provoca otro intento', () => {
    vi.useFakeTimers();
    const error = vi.fn();
    api.acknowledge(selection, alert.id).subscribe({ error });
    const request = http.expectOne('/api/v1/plots/plot/alerts/alert/acknowledge');
    vi.advanceTimersByTime(8001);
    expect(request.cancelled).toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    http.expectNone('/api/v1/plots/plot/alerts/alert/acknowledge');
  });
});

describe('Fachada de alertas independiente de mediciones y configuración', () => {
  let facade: OfflineAlertsFacade;
  let api: { list: ReturnType<typeof vi.fn>; acknowledge: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    api = { list: vi.fn(() => of(page)), acknowledge: vi.fn(() => of(acknowledged)) };
    TestBed.configureTestingModule({
      providers: [OfflineAlertsFacade, { provide: OfflineAlertsApi, useValue: api }],
    });
    facade = TestBed.inject(OfflineAlertsFacade);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  const flush = () => vi.advanceTimersByTime(110);
  it('consulta al seleccionar y cada 15 s, sin selección no consulta', () => {
    facade.select(null);
    flush();
    expect(api.list).not.toHaveBeenCalled();
    facade.select(selection);
    flush();
    expect(facade.page()).toEqual(page);
    vi.advanceTimersByTime(15000);
    expect(api.list).toHaveBeenCalledTimes(2);
  });
  it('un error visible no se confunde con ausencia de alertas y permite reintentar', () => {
    api.list.mockReturnValueOnce(throwError(() => new Error('offline')));
    facade.select(selection);
    flush();
    expect(facade.error()).toContain('No se pudieron');
    expect(facade.checkedAt()).toBeNull();
    facade.reload();
    flush();
    expect(facade.error()).toBe('');
    expect(facade.page()).toEqual(page);
  });
  it('reconocer recarga después del commit, no cambia la condición ni envía escrituras duplicadas', () => {
    facade.select(selection);
    flush();
    const write = new Subject<DeviceOfflineAlert>();
    api.acknowledge.mockReturnValue(write);
    facade.acknowledge('alert');
    facade.acknowledge('alert');
    expect(api.acknowledge).toHaveBeenCalledTimes(1);
    expect(facade.page().items[0].closedAt).toBeNull();
    api.list.mockReturnValue(of({ ...page, items: [acknowledged] }));
    write.next(acknowledged);
    write.complete();
    flush();
    expect(facade.page().items[0].acknowledgedAt).toBeTruthy();
    expect(facade.page().items[0].closedAt).toBeNull();
    expect(facade.message()).toContain('no restablece');
  });
  it('un POST incierto no se reenvía automáticamente y exige consultar antes de otro intento', () => {
    facade.select(selection);
    flush();
    api.acknowledge.mockReturnValue(throwError(() => new Error('503')));
    facade.acknowledge('alert');
    facade.acknowledge('alert');
    expect(facade.uncertain()).toBe(true);
    expect(api.acknowledge).toHaveBeenCalledTimes(1);
    facade.reload();
    flush();
    expect(facade.uncertain()).toBe(false);
  });
  it('cambiar dispositivo/origen o salir cancela GET y POST sin repintar la selección nueva', () => {
    facade.select(selection);
    flush();
    const write = new Subject<DeviceOfflineAlert>();
    api.acknowledge.mockReturnValue(write);
    facade.acknowledge('alert');
    expect(write.observed).toBe(true);
    facade.select({ ...selection, source: 'demo' });
    expect(write.observed).toBe(false);
    expect(facade.page().items).toEqual([]);
    const read = new Subject<Page<DeviceOfflineAlert>>();
    api.list.mockReturnValue(read);
    flush();
    expect(read.observed).toBe(true);
    facade.stop();
    expect(read.observed).toBe(false);
    write.next(acknowledged);
    read.next(page);
    flush();
    expect(facade.page().items).toEqual([]);
  });
  it('GET anterior al reconocimiento se cancela para no borrar el estado confirmado', () => {
    facade.select(selection);
    flush();
    const read = new Subject<Page<DeviceOfflineAlert>>();
    api.list.mockReturnValue(read);
    facade.reload();
    flush();
    expect(read.observed).toBe(true);
    // A write already in progress may finish while a periodic GET is in flight.
    facade.stop();
    facade.select(selection);
    api.list.mockReturnValue(of(page));
    flush();
    const write = new Subject<DeviceOfflineAlert>();
    api.acknowledge.mockReturnValue(write);
    facade.acknowledge('alert');
    api.list.mockReturnValue(read);
    facade.reload();
    flush();
    expect(read.observed).toBe(true);
    write.next(acknowledged);
    expect(read.observed).toBe(false);
    write.complete();
  });
  it('pagina y al cambiar selección vuelve a cero; no escribe IDs ausentes de la página', () => {
    api.list.mockReturnValue(of({ ...page, total: 9 }));
    facade.select(selection);
    flush();
    facade.changePage(5);
    flush();
    expect(api.list).toHaveBeenLastCalledWith(selection, 5);
    facade.acknowledge('other');
    expect(api.acknowledge).not.toHaveBeenCalled();
    facade.select(selection);
    flush();
    expect(api.list).toHaveBeenLastCalledWith(selection, 0);
  });
});
