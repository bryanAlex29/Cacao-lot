import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import type { RegressionForecast, TelemetrySubscription } from '@cacaosmart/contracts';
import { checkedRegression } from './regression-forecast-api.service';
import { RegressionForecastComponent } from './regression-forecast.component';

const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'demo' };
function snapshot(): RegressionForecast {
  const score = { samples: 15, maePp: 2, rmsePp: 3, biasPp: 1, outOfRangePredictions: 0 };
  return {
    schemaVersion: 'regression-forecast-v1',
    ...selection,
    generatedAt: '2026-12-02T12:00:00.000Z',
    informationCutoff: '2026-12-02T00:00:00.000Z',
    target: {
      from: '2026-12-02T00:00:00.000Z',
      toExclusive: '2026-12-03T00:00:00.000Z',
      timezone: 'UTC',
      variable: 'soil_moisture',
      unit: '%',
      horizonDays: 1,
    },
    status: 'experimental',
    fieldValidated: false,
    uncertainty: 'not_calibrated',
    waterDemand: null,
    zones: (['soil_1', 'soil_2', 'soil_3'] as const).map((code, i) => ({
      code,
      sensorId: code,
      reason: i === 0 ? 'available' : 'model_not_registered',
      predictedPct: i === 0 ? 20 : null,
      persistencePct: i === 0 ? 0 : null,
      features:
        i === 0
          ? [
              {
                lag: 1,
                moisturePct: 0,
                observedAt: '2026-12-01T12:00:00.000Z',
                receivedAt: '2026-12-01T13:00:00.000Z',
              },
              {
                lag: 2,
                moisturePct: 40,
                observedAt: '2026-11-30T12:00:00.000Z',
                receivedAt: '2026-12-01T13:00:00.000Z',
              },
            ]
          : null,
      model:
        i === 0
          ? {
              id: 'version',
              version: 'linear-two-lag-1.0.0',
              registeredAt: '2026-12-01T12:00:00.000Z',
              trainedUntilExclusive: '2026-11-01',
              evaluatedThrough: '2026-11-30T00:00:00.000Z',
              trainSamples: 30,
              evaluation: {
                validation: { regression: { ...score }, persistence: { ...score } },
                test: { regression: { ...score }, persistence: { ...score } },
              },
            }
          : null,
    })),
  };
}
describe('Regresión experimental: contrato y panel privado', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('conserva cero de persistencia y acepta lag2 recibido al día siguiente antes del corte', () => {
    expect(checkedRegression(snapshot(), selection).zones[0].persistencePct).toBe(0);
  });
  it('rechaza identidad, validación inventada, métricas incompatibles y evidencia futura', () => {
    for (const change of [
      (v: RegressionForecast) => {
        v.deviceId = 'foreign';
      },
      (v: RegressionForecast) => {
        Object.assign(v, { fieldValidated: true });
      },
      (v: RegressionForecast) => {
        v.zones[0].predictedPct = 101;
      },
      (v: RegressionForecast) => {
        v.zones[0].model!.evaluatedThrough = '2026-12-02T00:00:00.001Z';
      },
      (v: RegressionForecast) => {
        v.zones[0].model!.evaluation.test.regression.samples = 1;
      },
      (v: RegressionForecast) => {
        v.zones[0].features![1].receivedAt = '2026-12-02T00:00:00.001Z';
      },
      (v: RegressionForecast) => {
        v.zones[0].persistencePct = 1;
      },
      (v: RegressionForecast) => {
        v.zones[1].reason = 'available';
      },
    ]) {
      const data = snapshot();
      change(data);
      expect(() => checkedRegression(data, selection)).toThrow();
    }
  });
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [RegressionForecastComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(RegressionForecastComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      http,
      request: () => http.expectOne((r) => r.url.endsWith('/predictions/regression')),
    };
  }
  it('no entrena ni consulta automáticamente: muestra comparación, versión, métricas y ausencia', async () => {
    const { fixture, http, request } = await setup();
    http.expectNone((r) => r.url.endsWith('/regression'));
    fixture.componentInstance.load();
    const req = request();
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('source')).toBe('demo');
    req.flush(snapshot());
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelectorAll('.zone')).toHaveLength(1);
    expect(fixture.componentInstance.data()?.zones).toHaveLength(3);
    expect(root.querySelector('.value')?.textContent).toContain('20 %');
    expect(root.textContent).toContain('0 %');
    expect(root.textContent).toContain('Sin validación de campo');
    expect(root.textContent).toContain('linear-two-lag-1.0.0');
    expect(root.querySelectorAll('table')).toHaveLength(2);
    expect(root.textContent).not.toContain('Zona B');
    expect(root.textContent).not.toContain('Zona C');
    http.verify();
  });
  it('cambiar equipo cancela y limpia; error permite reintento sin números inventados', async () => {
    const { fixture, http, request } = await setup();
    fixture.componentInstance.load();
    const pending = request();
    fixture.componentRef.setInput('selection', { ...selection, deviceId: 'new' });
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    expect(fixture.componentInstance.data()).toBeNull();
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    fixture.componentInstance.load();
    request().flush({}, { status: 503, statusText: 'Unavailable' });
    expect(fixture.componentInstance.error()).toContain('Reintenta');
    fixture.componentInstance.load();
    request().flush(snapshot());
    expect(fixture.componentInstance.error()).toBe('');
    expect(fixture.componentInstance.data()?.status).toBe('experimental');
    http.verify();
  });
  it('destruir el panel cancela peticiones pendientes', async () => {
    const { fixture, http, request } = await setup();
    fixture.componentInstance.load();
    const pending = request();
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
    http.verify();
  });
});
