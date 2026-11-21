import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { advanceMoisture, MoistureSequence, resetSequence } from './moisture.rules';
import { PutMoisturePolicyDto } from './moisture.dto';
import type { SensorHealth } from '@cacaosmart/contracts';

const start = Date.parse('2026-11-21T00:00:00Z');
const context = {
  now: new Date(start + 9000),
  epoch: new Date(start - 1),
  maxGapMs: 10000,
  source: 'demo' as 'real' | 'demo',
  min: 30,
  margin: 5,
  active: false,
};
const empty = (): MoistureSequence => ({ ...resetSequence(), lastEffectiveAt: null });
const sample = (
  ms: number,
  value: number | null,
  quality: SensorHealth = value === null ? 'missing' : 'uncalibrated',
) => ({ time: new Date(start + ms), value, quality });
describe('Antirrebote e histéresis por sonda, sin control de riego', () => {
  it('solo tres lecturas estrictamente bajo mínimo abren el episodio', () => {
    let state = advanceMoisture(empty(), sample(0, 29), context);
    expect(state.action).toBe('none');
    expect(state.lowCount).toBe(1);
    state = advanceMoisture(state, sample(1000, 0), context);
    expect(state.action).toBe('none');
    expect(state.lowCount).toBe(2);
    state = advanceMoisture(state, sample(2000, 29.99), context);
    expect(state.action).toBe('open');
    expect(state.firstLowAt).toEqual(new Date(start));
  });
  it.each([30, 31, 35, 100])('%s rompe la confirmación de baja (mínimo incluido)', (value) => {
    const state = advanceMoisture(
      advanceMoisture(empty(), sample(0, 10), context),
      sample(1000, value),
      context,
    );
    expect(state.lowCount).toBe(0);
    expect(state.firstLowAt).toBeNull();
  });
  it('recupera solo con tres lecturas ≥ mínimo + margen y conserva activa la condición en la banda', () => {
    const active = { ...context, active: true };
    let state = advanceMoisture(empty(), sample(0, 35), active);
    expect(state.recoveryCount).toBe(1);
    state = advanceMoisture(state, sample(1000, 34.99), active);
    expect(state.recoveryCount).toBe(0);
    for (const ms of [2000, 3000, 4000]) state = advanceMoisture(state, sample(ms, 35), active);
    expect(state.action).toBe('recover');
  });
  it.each([
    { value: null, quality: 'missing' as const },
    { value: 20, quality: 'invalid' as const },
    { value: NaN, quality: 'valid' as const },
    { value: 101, quality: 'valid' as const },
    { value: -1, quality: 'valid' as const },
  ])('dato ausente/inválido rompe ambos conteos sin resolver %j', (override) => {
    const previous = { ...empty(), lowCount: 2, firstLowAt: new Date(start - 1) };
    const state = advanceMoisture(previous, { time: new Date(start), ...override }, context);
    expect(state.action).toBe('none');
    expect(state.lowCount).toBe(0);
    expect(state.recoveryCount).toBe(0);
  });
  it('dato antiguo y pausa de telemetría no mantienen confirmaciones', () => {
    const previous = {
      ...empty(),
      lowCount: 2,
      firstLowAt: new Date(start - 2),
      lastEffectiveAt: new Date(start - 1),
    };
    expect(
      advanceMoisture(previous, sample(0, 10), { ...context, now: new Date(start + 10001) })
        .lowCount,
    ).toBe(0);
    expect(
      advanceMoisture(previous, sample(20000, 10), { ...context, now: new Date(start + 20000) })
        .lowCount,
    ).toBe(1);
  });
  it('igual fecha o fuera de orden se ignora sin sumar ni romper secuencias', () => {
    const previous = advanceMoisture(empty(), sample(1000, 10), context);
    expect(advanceMoisture(previous, sample(1000, null), context)).toEqual(previous);
    expect(advanceMoisture(previous, sample(0, 10), context)).toEqual(previous);
  });
  it('una fecha futura no contamina el marcador cronológico', () => {
    const state = advanceMoisture(empty(), sample(10000, 10), context);
    expect(state.lowCount).toBe(0);
    expect(state.lastEffectiveAt).toBeNull();
    expect(advanceMoisture(state, sample(8000, 10), context).lowCount).toBe(1);
  });
  it('lecturas en o antes de la vigencia no confirman una configuración nueva', () => {
    expect(
      advanceMoisture(empty(), sample(0, 10), { ...context, epoch: new Date(start) }).lowCount,
    ).toBe(0);
  });
  it('real sin calibrar no confirma baja ni recuperación; DEMO es explícitamente permitido', () => {
    expect(advanceMoisture(empty(), sample(0, 10), { ...context, source: 'real' }).lowCount).toBe(
      0,
    );
    expect(
      advanceMoisture(empty(), sample(0, 40), { ...context, source: 'real', active: true })
        .recoveryCount,
    ).toBe(0);
    expect(
      advanceMoisture(empty(), sample(0, 10, 'valid'), { ...context, source: 'real' }).lowCount,
    ).toBe(1);
    expect(advanceMoisture(empty(), sample(0, 10), context).lowCount).toBe(1);
  });
  it.each([
    {},
    { recoveryMarginPct: 0 },
    { recoveryMarginPct: -1 },
    { recoveryMarginPct: 101 },
    { recoveryMarginPct: '5' },
    { recoveryMarginPct: null },
    { recoveryMarginPct: Infinity },
    { expectedVersion: -1 },
    { expectedVersion: '0' },
    { expectedThresholdVersion: 0 },
    { ownerId: 'client' },
  ])('rechaza política inválida o campos del cliente %j', async (override) => {
    const body = Object.keys(override).length
      ? { recoveryMarginPct: 5, expectedVersion: 0, expectedThresholdVersion: 1, ...override }
      : {};
    expect(
      (
        await validate(plainToInstance(PutMoisturePolicyDto, body), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    ).toBeGreaterThan(0);
  });
});
