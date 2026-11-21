import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { SensorThresholdAudit } from '@prisma/client';
import { thresholdIntervals, MAX_THRESHOLD_CHANGES } from './threshold-history';
import type { OwnedSensor } from './threshold.repository';
import { ThresholdHistoryQueryDto } from './threshold-history.dto';

const date = (day: number) => new Date(Date.UTC(2026, 10, day));
const range = (version: number, day: number, minValue = 20, maxValue = 70) => ({
  id: 'range',
  updatedBy: 'owner',
  minValue,
  maxValue,
  version,
  effectiveAt: date(day).toISOString(),
  hysteresis: 0,
  variable: 'SOIL_MOISTURE' as const,
  unit: 'PERCENT' as const,
});
const first = range(1, 2),
  second = range(2, 4, 30, 80),
  third = range(3, 6, 40, 90);
const sensor = (current: typeof first | null): OwnedSensor => ({
  id: 'sensor',
  deviceId: 'device',
  variable: 'SOIL_MOISTURE',
  unit: 'PERCENT',
  device: { plotId: 'plot', source: 'real', plot: { owner: { role: 'ADMIN' } } },
  thresholds: current
    ? [{ ...current, effectiveAt: new Date(current.effectiveAt), sensorId: 'sensor' }]
    : [],
});
const audit = (value: typeof first, oldValue: typeof first | null): SensorThresholdAudit => ({
  id: `audit-${value.version}`,
  sensorId: 'sensor',
  plotId: 'plot',
  actorId: 'owner',
  source: 'real',
  variable: 'SOIL_MOISTURE',
  version: value.version,
  changedAt: new Date(value.effectiveAt),
  newValue: value,
  oldValue,
});
const a = audit(first, null),
  b = audit(second, first),
  c = audit(third, second);

describe('Vigencia histórica sin aplicar el rango actual al pasado', () => {
  it('consulta anterior a toda configuración permanece sin rango, aunque exista uno hoy', () => {
    expect(thresholdIntervals(sensor(third), date(1), date(2), null, [], a)).toEqual([
      { from: date(1).toISOString(), to: date(2).toISOString(), threshold: null },
    ]);
  });
  it('recupera el rango previo al inicio y recorta sin cambiar su fecha de vigencia', () => {
    const intervals = thresholdIntervals(sensor(third), date(3), date(5), a, [b], c);
    expect(
      intervals.map((i) => [i.from, i.to, i.threshold?.minValue, i.threshold?.version]),
    ).toEqual([
      [date(3).toISOString(), date(4).toISOString(), 20, 1],
      [date(4).toISOString(), date(5).toISOString(), 30, 2],
    ]);
    expect(intervals[0].threshold?.effectiveAt).toBe(first.effectiveAt);
  });
  it('editar hoy no cambia el intervalo de ayer', () => {
    const original = thresholdIntervals(sensor(second), date(2), date(4), a, [], b);
    expect(thresholdIntervals(sensor(third), date(2), date(4), a, [], b)).toEqual(original);
    expect(original[0].threshold?.maxValue).toBe(70);
  });
  it('incluye inicio y excluye fin: el rango nuevo comienza exactamente en su fecha', () => {
    const intervals = thresholdIntervals(sensor(third), date(4), date(6), b, [], c);
    expect(intervals).toHaveLength(1);
    expect(intervals[0].threshold?.version).toBe(2);
  });
  it('marca ausencia antes del primer rango sin inventar mínimos o máximos', () => {
    const intervals = thresholdIntervals(sensor(second), date(1), date(5), null, [a, b], null);
    expect(intervals.map((i) => i.threshold?.version ?? null)).toEqual([null, 1, 2]);
  });
  it('ausencia total es cobertura explícita null, no lista incompleta', () => {
    expect(
      thresholdIntervals(sensor(null), date(1), date(7), null, [], null)[0].threshold,
    ).toBeNull();
  });
  it('versiones en el mismo milisegundo no generan diagonales ni intervalos de longitud cero', () => {
    const tied = { ...second, effectiveAt: first.effectiveAt };
    const intervals = thresholdIntervals(
      sensor(tied),
      date(1),
      date(5),
      null,
      [a, audit(tied, first)],
      null,
    );
    expect(intervals.map((i) => i.threshold?.version ?? null)).toEqual([null, 2]);
  });
  it.each([
    { source: 'demo' },
    { plotId: 'other' },
    { sensorId: 'other' },
    { variable: 'TEMPERATURE' },
    { actorId: 'other' },
    { version: 7 },
    { newValue: { ...second, maxValue: 101 } },
    { newValue: { ...second, unit: 'CELSIUS' } },
    { newValue: { ...second, minValue: null } },
    { newValue: { ...second, effectiveAt: 'bad' } },
    { newValue: null },
    { oldValue: null },
    { oldValue: { ...first, minValue: 19 } },
  ])('rechaza auditoría incompatible o incompleta %j', (override) => {
    expect(() =>
      thresholdIntervals(
        sensor(third),
        date(3),
        date(5),
        a,
        [{ ...b, ...override } as SensorThresholdAudit],
        c,
      ),
    ).toThrow();
  });
  it('rechaza una versión perdida dentro del periodo', () => {
    expect(() => thresholdIntervals(sensor(third), date(3), date(7), a, [c], null)).toThrow();
  });
  it('rechaza una versión perdida inmediatamente después del periodo', () => {
    expect(() => thresholdIntervals(sensor(third), date(3), date(4), a, [], c)).toThrow();
  });
  it('no confunde un rango actual sin auditoría con ausencia de configuración', () => {
    expect(() => thresholdIntervals(sensor(first), date(3), date(5), null, [], null)).toThrow();
  });
  it('no oculta truncamiento cuando hay demasiados cambios', () => {
    expect(() =>
      thresholdIntervals(
        sensor(first),
        date(1),
        date(7),
        null,
        Array(MAX_THRESHOLD_CHANGES + 1).fill(a),
        null,
      ),
    ).toThrow('periodo menor');
  });
});

describe('Filtro de fechas del historial de rangos', () => {
  it('acepta ISO con zona horaria', async () => {
    expect(
      await validate(
        plainToInstance(ThresholdHistoryQueryDto, {
          from: '2026-11-01T00:00:00-05:00',
          to: '2026-11-02T00:00:00Z',
        }),
      ),
    ).toHaveLength(0);
  });
  it.each([
    {},
    { from: 'bad', to: date(3).toISOString() },
    { from: '2026-02-30T00:00:00Z', to: date(3).toISOString() },
    { from: '2026-11-01', to: date(3).toISOString() },
    { from: '2026-11-01T00:00:00', to: date(3).toISOString() },
    { from: date(1).toISOString(), to: date(3).toISOString(), source: 'demo' },
  ])('rechaza fechas ambiguas, inválidas y campos ajenos %j', async (query) => {
    const errors = await validate(plainToInstance(ThresholdHistoryQueryDto, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
