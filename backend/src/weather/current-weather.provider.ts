import { Injectable } from '@nestjs/common';
import type { CurrentWeather } from '@cacaosmart/contracts';

type Conditions = NonNullable<CurrentWeather['current']>;
type Location = { latitude: number; longitude: number };
export const CURRENT_WEATHER_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const variables = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'weather_code',
  'is_day',
];
const codes = new Set([
  0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86,
  95, 96, 97, 99,
]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid weather');
  return value as Record<string, unknown>;
}
export function normalizeCurrentWeather(
  raw: unknown,
  location: Location,
  now = new Date(),
): Conditions {
  const body = object(raw),
    current = object(body['current']),
    units = object(body['current_units']);
  const expected = ['°C', '°C', '%', 'mm', 'wmo code', ''];
  if (
    body['timezone'] !== 'GMT' ||
    body['utc_offset_seconds'] !== 0 ||
    typeof body['latitude'] !== 'number' ||
    !Number.isFinite(body['latitude']) ||
    typeof body['longitude'] !== 'number' ||
    !Number.isFinite(body['longitude']) ||
    Math.abs(body['latitude'] - location.latitude) > 1 ||
    Math.abs(body['longitude'] - location.longitude) > 1 ||
    units['time'] !== 'unixtime' ||
    units['interval'] !== 'seconds'
  )
    throw new Error('Invalid weather location/units');
  const time = current['time'],
    interval = current['interval'];
  if (
    typeof time !== 'number' ||
    !Number.isFinite(time) ||
    now.getTime() - time * 1000 > 3600000 ||
    time * 1000 - now.getTime() > 900000 ||
    typeof interval !== 'number' ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 3600
  )
    throw new Error('Invalid weather time');
  const ranges = [
    [-100, 70],
    [-120, 90],
    [0, 100],
    [0, 1000],
    [0, 99],
    [0, 1],
  ];
  const values = variables.map((name, i) => {
    const value = current[name];
    if (units[name] !== expected[i]) throw new Error('Invalid weather unit');
    if (value === null) return null;
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < ranges[i][0] ||
      value > ranges[i][1] ||
      (i === 4 && !codes.has(value)) ||
      (i === 5 && value !== 0 && value !== 1)
    )
      throw new Error('Invalid weather value');
    return value;
  });
  return {
    observedAt: new Date(time * 1000).toISOString(),
    fetchedAt: now.toISOString(),
    temperatureC: values[0],
    apparentTemperatureC: values[1],
    humidityPct: values[2],
    precipitationMm: values[3],
    intervalSeconds: interval,
    weatherCode: values[4],
    isDay: values[5] === null ? null : values[5] === 1,
    provider: 'Open-Meteo',
    quality: 'modeled',
  };
}

@Injectable()
export class CurrentWeatherProvider {
  private readonly cache = new Map<string, { until: number; value: Promise<Conditions> }>();
  read(location: Location): Promise<Conditions> {
    const key = `${location.latitude}:${location.longitude}`;
    const hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    const entry = { until: Date.now() + 15 * 60000, value: this.fetch(location) };
    this.cache.set(key, entry);
    // Failed attempts are cached briefly, without returning obsolete conditions as current.
    void entry.value.catch(() => {
      entry.until = Date.now() + 60000;
    });
    return entry.value;
  }
  private async fetch(location: Location): Promise<Conditions> {
    const url = new URL(CURRENT_WEATHER_ENDPOINT);
    url.search = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: variables.join(','),
      timezone: 'GMT',
      timeformat: 'unixtime',
      temperature_unit: 'celsius',
      precipitation_unit: 'mm',
      forecast_days: '1',
    }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error('Weather unavailable');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) throw new Error('Weather response too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return normalizeCurrentWeather(JSON.parse(Buffer.concat(chunks).toString('utf8')), location);
  }
}
