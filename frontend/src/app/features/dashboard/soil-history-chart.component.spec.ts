import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryReading } from '@cacaosmart/contracts';
import {
  historyStates,
  ThresholdHistoryMap,
} from '../../core/sensor-thresholds/threshold-history.facade';
import { SoilHistoryChartComponent, thresholdLines } from './soil-history-chart.component';

const t = (hour: number) => new Date(Date.UTC(2026, 10, 20, hour)).toISOString();
const row = (hour: number): TelemetryReading => ({
  deviceId: 'device',
  source: 'demo',
  eventId: `event-${hour}`,
  receivedAt: t(hour),
  recordedAt: null,
  timestampOrigin: 'server',
  soilMoisture: { soil_1: 45, soil_2: 55, soil_3: null },
  temperatureC: null,
  airHumidityPct: null,
  rainDetected: null,
  valve: { relayCommandedOpen: null, feedbackOpen: null },
  quality: {
    soil_1: 'uncalibrated',
    soil_2: 'uncalibrated',
    soil_3: 'missing',
    temperatureC: 'missing',
    airHumidityPct: 'missing',
    rainDetected: 'missing',
    relayCommandedOpen: 'missing',
    feedbackOpen: 'missing',
  },
});
const readings = [row(10), row(0)];
const states = (): ThresholdHistoryMap => ({
  ...historyStates('ready'),
  soil_1: {
    status: 'ready',
    intervals: [
      { from: t(0), to: t(2), threshold: null },
      {
        from: t(2),
        to: t(5),
        threshold: { minValue: 20, maxValue: 70, version: 1, effectiveAt: t(2) },
      },
      {
        from: t(5),
        to: t(11),
        threshold: { minValue: 30, maxValue: 80, version: 2, effectiveAt: t(5) },
      },
    ],
  },
  soil_2: { status: 'error', intervals: [] },
  soil_3: { status: 'ready', intervals: [{ from: t(0), to: t(11), threshold: null }] },
});

describe('Segmentos mínimo/máximo por vigencia', () => {
  it('recorta a la página, no dibuja antes de configurar y no une versiones con diagonales', () => {
    const lines = thresholdLines(readings, states());
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => [line.version, line.bound, line.x1, line.x2])).toEqual([
      [1, 'min', 169, 355],
      [1, 'max', 169, 355],
      [2, 'min', 355, 665],
      [2, 'max', 355, 665],
    ]);
    expect(lines[0].y).toBe(174);
    expect(lines[2].y).toBe(156);
    expect(lines[0].dash).not.toBe(lines[1].dash);
  });
  it('la configuración posterior a la última lectura no aparece sobre el pasado', () => {
    const map = states();
    map.soil_1.intervals.push({
      from: t(11),
      to: t(12),
      threshold: { minValue: 1, maxValue: 99, version: 3, effectiveAt: t(11) },
    });
    expect(thresholdLines(readings, map).some((line) => line.version === 3)).toBe(false);
  });
  it('sin datos no crea líneas; una lectura única conserva un dominio mínimo', () => {
    expect(thresholdLines([], states())).toEqual([]);
    const lines = thresholdLines([row(6)], states());
    expect(lines).toHaveLength(2);
    expect(lines[0].x1).toBe(45);
    expect(lines[0].x2).toBe(665);
  });
  it.each(['idle', 'loading', 'error', 'disabled'] as const)(
    'no conserva líneas para estado %s',
    (status) => {
      expect(thresholdLines(readings, historyStates(status))).toEqual([]);
    },
  );
});

describe('Gráfico y tabla accesible sin alterar las lecturas', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    TestBed.configureTestingModule({ imports: [SoilHistoryChartComponent] });
    const fixture = TestBed.createComponent(SoilHistoryChartComponent);
    fixture.componentRef.setInput('readings', readings);
    fixture.componentRef.setInput('thresholds', states());
    fixture.componentRef.setInput('source', 'demo');
    fixture.detectChanges();
    return fixture;
  }
  it('mantiene tres series y añade límites identificados, vigencias y advertencia DEMO', () => {
    const fixture = setup();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('svg path')).toHaveLength(3);
    expect(element.querySelectorAll('line[data-threshold]')).toHaveLength(4);
    expect(element.querySelector('line[data-bound="min"] title')?.textContent).toContain(
      'Zona A · Mín. 20 % · v1',
    );
    expect(element.textContent).toContain('Sin rango configurado');
    expect(element.textContent).toContain('Rangos históricos no disponibles');
    expect(element.textContent).toContain('DEMO · Mediciones y rangos de demostración');
    expect(element.querySelector('.threshold-table table')?.textContent).toContain('Versión');
    expect(fixture.componentInstance.readings()).toBe(readings);
  });
  it('reintenta solo los rangos y actualiza segmentos sin recrear ni modificar las mediciones', () => {
    const fixture = setup();
    const retry = vi.fn();
    fixture.componentInstance.retryThresholds.subscribe(retry);
    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
    expect(retry).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('thresholds', historyStates('loading'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('line[data-threshold]')).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('svg path')).toHaveLength(3);
  });
});
