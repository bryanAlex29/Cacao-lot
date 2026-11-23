export interface HistoryPeriod {
  from: string;
  to: string;
}

export function localDateTime(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

/** Canonical UTC bounds for an inclusive, fixed query; never a rolling window. */
export function validHistoryPeriod(period: HistoryPeriod): boolean {
  const start = Date.parse(period.from),
    end = Date.parse(period.to);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    new Date(start).toISOString() === period.from &&
    new Date(end).toISOString() === period.to &&
    start <= end &&
    end - start <= 31 * 86400000
  );
}

export function historyPeriodFromLocal(from: string, to: string): HistoryPeriod | null {
  const parse = (value: string): Date | null => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
    const date = new Date(value);
    // Reject impossible dates and nonexistent local times rather than silently normalizing them.
    return Number.isFinite(date.getTime()) &&
      localDateTime(date) === (value.length === 16 ? `${value}:00` : value)
      ? date
      : null;
  };
  const start = parse(from),
    end = parse(to);
  if (!start || !end) return null;
  const period = { from: start.toISOString(), to: end.toISOString() };
  return validHistoryPeriod(period) ? period : null;
}
