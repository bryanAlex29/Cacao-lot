import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ExperimentalForecastQueryDto } from './prediction.dto';
import { referenceForecast, ExperimentalForecastService } from './experimental-forecast.service';
import {
  DailyForecastRow,
  ExperimentalForecastRepository,
} from './experimental-forecast.repository';
import { SourcePolicy } from '../integrations/source-policy.service';

const now = new Date('2026-11-25T12:00:00.000Z');
const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
function row(day = '2026-11-24', value: number | null = 0): DailyForecastRow {
  return {
    sensorId: 'soil-a',
    code: 'soil_1',
    enabled: true,
    day: new Date(`${day}T00:00:00.000Z`),
    featureValue: value,
    featureQuality: 'valid',
    featureAt: new Date(`${day}T23:00:00.000Z`),
    featureReceivedAt: new Date(`${day}T23:00:01.000Z`),
    observedValue: value,
    observedQuality: 'valid',
  };
}
describe('Referencia experimental por zona, sin ajuste ni control del riego', () => {
  it('conserva cero y fija objetivo/corte UTC sin fingir emisión a medianoche', () => {
    const result = referenceForecast(selection, true, [row()], now);
    expect(result).toMatchObject({
      generatedAt: now.toISOString(),
      informationCutoff: '2026-11-25T00:00:00.000Z',
      target: { from: '2026-11-25T00:00:00.000Z', toExclusive: '2026-11-26T00:00:00.000Z' },
      status: 'experimental',
      model: { fitted: false, fieldValidated: false },
      waterDemand: null,
    });
    expect(result.zones[0].predictedPct).toBe(0);
    expect(result.zones[0].evidence?.receivedAt).toBe('2026-11-24T23:00:01.000Z');
    expect(result.zones[1]).toMatchObject({ reason: 'sensor_missing', predictedPct: null });
  });
  it('sin lecturas utilizables no inventa métricas cero ni sustituye días ausentes', () => {
    const zone = referenceForecast(selection, true, [row('2026-11-23', 40)], now).zones[0];
    expect(zone.reason).toBe('missing_previous_day');
    expect(zone.predictedPct).toBeNull();
    expect(zone.evaluation).toMatchObject({ samples: 0, maePp: null, rmsePp: null, biasPp: null });
    expect(zone.history).toHaveLength(30);
  });
  it.each(['missing', 'invalid', 'uncalibrated'] as const)(
    'rechaza última calidad %s sin fallback',
    (quality) => {
      const zone = referenceForecast(selection, true, [{ ...row(), featureQuality: quality }], now)
        .zones[0];
      expect(zone.reason).toBe('unusable_previous_day');
      expect(zone.predictedPct).toBeNull();
      expect(zone.evidence).toBeNull();
    },
  );
  it.each([null, -1, 101, NaN, Infinity])('rechaza valor inutilizable %s', (value) => {
    expect(
      referenceForecast(selection, true, [row('2026-11-24', value)], now).zones[0].predictedPct,
    ).toBeNull();
  });
  it('una recepción posterior al corte no se usa como información conocida', () => {
    const late = { ...row(), featureReceivedAt: new Date('2026-11-25T00:00:00.001Z') };
    expect(referenceForecast(selection, true, [late], now).zones[0].predictedPct).toBeNull();
    late.featureReceivedAt = new Date('2026-11-25T00:00:00.000Z');
    expect(referenceForecast(selection, true, [late], now).zones[0].predictedPct).toBe(0);
  });
  it('calcula errores retrospectivos por pares y conserva huecos', () => {
    const zone = referenceForecast(
      selection,
      true,
      [row('2026-11-22', 20), row('2026-11-23', 30), row('2026-11-24', 25)],
      now,
    ).zones[0];
    expect(zone.evaluation).toMatchObject({ samples: 2, maePp: 7.5, biasPp: -2.5 });
    expect(zone.evaluation.rmsePp).toBeCloseTo(Math.sqrt(62.5));
    expect(zone.history.at(-1)).toMatchObject({ observedPct: 25, predictedPct: 30 });
    expect(zone.history[0].observedPct).toBeNull();
  });
  it('no agrega A/B/C ni pronostica equipos o sensores deshabilitados', () => {
    const rows = [
      row(),
      { ...row(), sensorId: 'soil-b', code: 'soil_2' as const, featureValue: 65, enabled: false },
    ];
    const result = referenceForecast(selection, true, rows, now);
    expect(result.zones[0].predictedPct).toBe(0);
    expect(result.zones[1]).toMatchObject({ reason: 'sensor_disabled', predictedPct: null });
    expect(referenceForecast(selection, false, rows, now).zones[0].reason).toBe('device_disabled');
  });
  it('valida selección explícita y no admite horizontes inventados', () => {
    for (const input of [
      {},
      { deviceId: 'bad' },
      { deviceId: '73ccf773-40ec-41b1-9a0a-870bfefb7609', horizonDays: 7 },
    ])
      expect(
        validateSync(plainToInstance(ExperimentalForecastQueryDto, input)).length,
      ).toBeGreaterThan(0);
    expect(
      validateSync(
        plainToInstance(ExperimentalForecastQueryDto, {
          deviceId: '73ccf773-40ec-41b1-9a0a-870bfefb7609',
        }),
      ),
    ).toHaveLength(0);
  });
  it('aplica SourcePolicy antes de consultar la parcela autorizada', async () => {
    const get = jest.fn().mockResolvedValue({ device: { isActive: true }, rows: [row()] });
    const requireSource = jest.fn();
    const service = new ExperimentalForecastService(
      { get } as unknown as ExperimentalForecastRepository,
      { require: requireSource } as unknown as SourcePolicy,
    );
    await service.get('plot', 'owner', 'device', 'demo');
    expect(get).toHaveBeenCalledWith(
      'plot',
      'owner',
      'device',
      'demo',
      expect.any(Date),
      expect.any(Date),
    );
    requireSource.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await expect(service.get('plot', 'owner', 'device', 'demo')).rejects.toThrow('blocked');
    expect(get).toHaveBeenCalledTimes(1);
  });
});
