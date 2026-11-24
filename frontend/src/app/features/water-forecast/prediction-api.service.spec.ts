import type { PredictionAvailability } from '@cacaosmart/contracts';
import { describe, expect, it } from 'vitest';
import { checkedPrediction } from './prediction-api.service';

export function predictionFixture(): PredictionAvailability {
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
describe('Contrato de disponibilidad, no pronósticos ficticios', () => {
  it('acepta ceros sin rellenar pronósticos o muestras', () => {
    const value = predictionFixture();
    expect(checkedPrediction(value, 'plot', 'device', 'real')).toBe(value);
  });
  it.each(['plotId', 'source', 'status', 'reason', 'schemaVersion'] as const)(
    'rechaza identidad/estado incompatible %s',
    (field) => {
      const value = { ...predictionFixture(), [field]: 'unexpected' } as PredictionAvailability;
      expect(() => checkedPrediction(value, 'plot', 'device', 'real')).toThrow();
    },
  );
  it('rechaza modelo, agua, pronóstico o ventana alterados', () => {
    const original = predictionFixture();
    for (const extra of [
      { model: {} },
      { waterDemand: { liters: 1 } },
      { predictions: [{}] },
      { device: { ...original.device, id: 'other' } },
      { target: { ...original.target, unit: 'L' } },
      { window: { ...original.window, toExclusive: '2026-11-25T00:00:00Z' } },
    ]) {
      expect(() =>
        checkedPrediction(
          { ...original, ...extra } as PredictionAvailability,
          'plot',
          'device',
          'real',
        ),
      ).toThrow();
    }
  });
  it('rechaza muestras imposibles, zonas duplicadas y días sin evidencia temporal', () => {
    const original = predictionFixture();
    for (const extra of [
      { validSamples: 1 },
      { samples: -1 },
      { validDaysUtc: 31 },
      { code: 'soil_2' },
      { validDaysUtc: 1 },
      { firstValidAt: 'bad' },
    ]) {
      const value = structuredClone(original);
      Object.assign(value.zones[0], extra);
      expect(() => checkedPrediction(value, 'plot', 'device', 'real')).toThrow();
    }
  });
});
