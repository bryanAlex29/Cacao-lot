import { describe, expect, it } from 'vitest';
import { historyPeriodFromLocal, localDateTime, validHistoryPeriod } from './history-period';

describe('Fechas históricas locales y UTC', () => {
  it('convierte hora local y conserva segundos, sin asumir zona de Ecuador', () => {
    const from = new Date(2026, 10, 22, 8, 20, 15),
      to = new Date(2026, 10, 22, 9, 30, 25);
    expect(historyPeriodFromLocal(localDateTime(from), localDateTime(to))).toEqual({
      from: from.toISOString(),
      to: to.toISOString(),
    });
  });
  it('admite omitir segundos y un instante inclusivo', () => {
    const local = '2026-11-22T12:30';
    expect(historyPeriodFromLocal(local, local)).toEqual({
      from: new Date(local).toISOString(),
      to: new Date(local).toISOString(),
    });
  });
  it.each([
    '',
    'invalid',
    '2026-02-30T12:00',
    '2026-11-22',
    '2026-11-22T25:00',
    '2026-11-22T12:00Z',
  ])('rechaza fecha imposible/no local: %s', (from) => {
    expect(historyPeriodFromLocal(from, '2026-11-22T12:00')).toBeNull();
  });
  it('máximo31 días inclusive en tiempo real, no días de calendario', () => {
    const from = '2026-10-01T00:00:00.000Z';
    expect(validHistoryPeriod({ from, to: '2026-11-01T00:00:00.000Z' })).toBe(true);
    expect(validHistoryPeriod({ from, to: '2026-11-01T00:00:00.001Z' })).toBe(false);
    expect(validHistoryPeriod({ from, to: '2026-09-30T00:00:00.000Z' })).toBe(false);
    expect(validHistoryPeriod({ from: 'bad', to: from })).toBe(false);
    expect(validHistoryPeriod({ from: '2026-10-01T00:00:00', to: from })).toBe(false);
  });
});
