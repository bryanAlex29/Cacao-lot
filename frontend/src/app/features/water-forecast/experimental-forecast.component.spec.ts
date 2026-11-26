import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExperimentalMoistureForecast, TelemetrySubscription } from '@cacaosmart/contracts';
import { ExperimentalForecastComponent } from './experimental-forecast.component';
import { checkedForecast } from './experimental-forecast-api.service';

const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'demo' };
function snapshot(): ExperimentalMoistureForecast {
  const at = Date.parse('2026-11-25T00:00:00.000Z');
  return {
    schemaVersion: 'persistence-forecast-v1',
    ...selection,
    generatedAt: '2026-11-25T12:00:00.000Z',
    informationCutoff: '2026-11-25T00:00:00.000Z',
    target: {
      from: '2026-11-25T00:00:00.000Z',
      toExclusive: '2026-11-26T00:00:00.000Z',
      timezone: 'UTC',
      variable: 'soil_moisture',
      unit: '%',
      horizonDays: 1,
    },
    model: { name: 'persistence', version: '1.0.0', fitted: false, fieldValidated: false },
    status: 'experimental',
    uncertainty: 'not_calibrated',
    waterDemand: null,
    zones: (['soil_1', 'soil_2', 'soil_3'] as const).map((code, i) => ({
      code,
      sensorId: code,
      reason: i === 0 ? 'available' : 'missing_previous_day',
      predictedPct: i === 0 ? 0 : null,
      evidence:
        i === 0
          ? { observedAt: '2026-11-24T23:00:00.000Z', receivedAt: '2026-11-24T23:00:01.000Z' }
          : null,
      evaluation: {
        from: new Date(at - 30 * 86400000).toISOString(),
        toExclusive: '2026-11-25T00:00:00.000Z',
        samples: 0,
        maePp: null,
        rmsePp: null,
        biasPp: null,
      },
      history: Array.from({ length: 30 }, (_, index) => ({
        day: new Date(at - (30 - index) * 86400000).toISOString(),
        observedPct: null,
        predictedPct: null,
      })),
    })),
  };
}
describe('Contrato de referencia experimental', () => {
  it('acepta ceros y ausencia sin convertirlos en precisión o agua calculada', () => {
    expect(checkedForecast(snapshot(), selection).zones[0].predictedPct).toBe(0);
  });
  it('rechaza identidad, etiquetas de validación, números y evidencia futura incompatibles', () => {
    for (const mutate of [
      (data: ExperimentalMoistureForecast) => {
        data.deviceId = 'foreign';
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].predictedPct = NaN;
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].predictedPct = 101;
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].evidence!.receivedAt = '2026-11-25T00:00:00.001Z';
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].reason = 'sensor_disabled';
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].evaluation.maePp = 0;
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[0].history[0].day = data.generatedAt;
      },
      (data: ExperimentalMoistureForecast) => {
        data.zones[1].code = 'soil_1';
      },
    ]) {
      const data = snapshot();
      mutate(data);
      expect(() => checkedForecast(data, selection)).toThrow('incompatible');
    }
    const data = snapshot();
    Object.assign(data.model, { fieldValidated: true });
    expect(() => checkedForecast(data, selection)).toThrow();
  });
  it('contrasta métricas con los pares del histórico y exige unidades coherentes', () => {
    const data = snapshot(),
      zone = data.zones[0];
    Object.assign(zone.history[0], { observedPct: 20, predictedPct: 30 });
    Object.assign(zone.evaluation, { samples: 1, maePp: 10, rmsePp: 10, biasPp: 10 });
    expect(checkedForecast(data, selection).zones[0].evaluation.samples).toBe(1);
    zone.evaluation.maePp = 0;
    expect(() => checkedForecast(data, selection)).toThrow();
  });
});
describe('Panel de referencia de humedad', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [ExperimentalForecastComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(ExperimentalForecastComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      http,
      request: () => http.expectOne((req) => req.url.endsWith('/predictions/experimental')),
    };
  }
  it('solo consulta al pulsar y muestra referencia, fechas, cero, motivos y límites', async () => {
    const { fixture, http, request } = await setup();
    http.expectNone((req) => req.url.endsWith('/experimental'));
    fixture.componentInstance.load();
    const pending = request();
    expect(pending.request.method).toBe('GET');
    expect(pending.request.params.get('deviceId')).toBe('device');
    expect(pending.request.params.get('source')).toBe('demo');
    pending.flush(snapshot());
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.zone')).toHaveLength(1);
    expect(fixture.componentInstance.data()?.zones).toHaveLength(3);
    expect(root.querySelector('.value')?.textContent).toContain('0 %');
    expect(root.textContent).toContain('DEMO');
    expect(root.textContent).toContain('sin validación de campo');
    expect(root.textContent).toContain('No evaluable');
    expect(root.querySelectorAll('table')).toHaveLength(1);
    expect(root.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    http.verify();
  });
  it('cambiar equipo cancela petición y limpia resultados sin mezclar identidades', async () => {
    const { fixture, http, request } = await setup();
    fixture.componentInstance.load();
    const pending = request();
    fixture.componentRef.setInput('selection', { ...selection, deviceId: 'new' });
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.componentInstance.data()).toBeNull();
    expect(fixture.componentInstance.busy()).toBe(false);
    http.verify();
  });
  it('error recuperable sin fallback, datos falsos ni escrituras', async () => {
    const { fixture, http, request } = await setup();
    fixture.componentInstance.load();
    request().flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('Reintenta');
    expect(fixture.componentInstance.data()).toBeNull();
    fixture.componentInstance.load();
    request().flush(snapshot());
    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.componentInstance.data()?.status).toBe('experimental');
    http.verify();
  });
  it('sin selección o al destruir no conserva peticiones ni datos', async () => {
    const { fixture, http, request } = await setup();
    fixture.componentInstance.load();
    const pending = request();
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.verify();
  });
  it('el gráfico no une huecos de datos', async () => {
    const { fixture, http } = await setup();
    const data = snapshot();
    data.zones[0].history[23].observedPct = 10;
    data.zones[0].history[25].observedPct = 20;
    fixture.componentInstance.data.set(data);
    const path = fixture.componentInstance.path(data.zones[0], 'observedPct');
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain('L');
    http.verify();
  });
});
