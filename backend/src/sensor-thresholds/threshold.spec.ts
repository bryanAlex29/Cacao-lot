import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { PutSensorThresholdInput } from '@cacaosmart/contracts';
import { PutSensorThresholdDto } from './threshold.dto';
import { quantitativeIdentity, validateThreshold } from './threshold.rules';

const soil = { variable: 'SOIL_MOISTURE', unit: 'PERCENT' } as const;
const input = { ...soil, minValue: 20, maxValue: 70, expectedVersion: 0 };

describe('Contrato y reglas de rangos por sensor', () => {
  it.each<PutSensorThresholdInput>([
    { ...input, minValue: 0, maxValue: 100 },
    { ...input, variable: 'AIR_HUMIDITY' },
    { ...input, variable: 'TEMPERATURE', unit: 'CELSIUS', minValue: -50, maxValue: 100 },
  ])('acepta un contrato cuantitativo %j', async (body) => {
    expect(await validate(plainToInstance(PutSensorThresholdDto, body))).toHaveLength(0);
    expect(() => validateThreshold(body, body)).not.toThrow();
  });

  it.each([
    { minValue: '20' },
    { minValue: null },
    { minValue: undefined },
    { minValue: NaN },
    { minValue: -Infinity },
    { maxValue: Infinity },
    { maxValue: '70' },
    { maxValue: null },
    { maxValue: undefined },
    { variable: 'RAIN_DETECTED' },
    { unit: 'BOOLEAN' },
    { expectedVersion: undefined },
    { expectedVersion: null },
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: '0' },
    { expectedVersion: 2147483647 },
    { source: 'demo' },
    { updatedBy: 'client' },
    { effectiveAt: '2026-01-01T00:00:00Z' },
    { hysteresis: 5 },
  ])('rechaza tipo, versión o campos no permitidos %j', async (override) => {
    const errors = await validate(
      plainToInstance(PutSensorThresholdDto, { ...input, ...override }),
      {
        whitelist: true,
        forbidNonWhitelisted: true,
      },
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it.each([
    { minValue: 70, maxValue: 70 },
    { minValue: 80 },
    { minValue: -1 },
    { maxValue: 101 },
    { minValue: NaN },
    { maxValue: Infinity },
    { unit: 'CELSIUS' },
    { variable: 'TEMPERATURE' },
  ])('rechaza rangos o identidad incoherentes %j', (override) => {
    expect(() => validateThreshold(soil, { ...input, ...override } as typeof input)).toThrow();
  });

  it('no acepta rangos numéricos para lluvia', () => {
    expect(() => quantitativeIdentity({ variable: 'RAIN_DETECTED', unit: 'BOOLEAN' })).toThrow();
  });
});
