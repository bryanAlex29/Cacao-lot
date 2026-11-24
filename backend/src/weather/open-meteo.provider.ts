import { Injectable } from '@nestjs/common';
import type { WeatherProfile } from '@prisma/client';

export const WEATHER_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
export const WEATHER_VARIABLES = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'et0_fao_evapotranspiration'] as const;
export const WEATHER_UNITS = ['°C', '%', 'mm', 'mm'] as const;
export interface WeatherValue { date: string; variable: string; unit: string; value: number | null; quality: 'modeled' | 'missing' }
export interface WeatherData { raw: Record<string, unknown>; provenance: Record<string, string | number>; items: WeatherValue[] }

/** A conservative window: seven complete days ending seven UTC dates ago. Not current weather. */
export function weatherWindow(now = new Date()): { from: string; to: string } {
  return { from: new Date(now.getTime() - 13 * 86400000).toISOString().slice(0, 10),
    to: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid weather structure');
  return value as Record<string, unknown>;
}
function finite(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }

export function normalizeWeather(raw: unknown, profile: Pick<WeatherProfile, 'latitude' | 'longitude' | 'timezone'>, from: string, to: string): WeatherData {
  const body = object(raw), hourly = object(body['hourly']), units = object(body['hourly_units']);
  const offset = profile.timezone === 'America/Guayaquil' ? -18000 : -21600;
  if (body['timezone'] !== profile.timezone || body['utc_offset_seconds'] !== offset ||
      !finite(body['latitude']) || !finite(body['longitude']) || Math.abs(body['latitude'] - profile.latitude) > 1 ||
      Math.abs(body['longitude'] - profile.longitude) > 1) throw new Error('Invalid weather location');
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new Error('Invalid weather window');
  const times = hourly['time'];
  if (!Array.isArray(times) || times.length !== days * 24) throw new Error('Incomplete weather hours');
  for (let i = 0; i < times.length; i++) {
    const date = new Date(Date.parse(from) + Math.floor(i / 24) * 86400000).toISOString().slice(0, 10);
    if (times[i] !== `${date}T${String(i % 24).padStart(2, '0')}:00`) throw new Error('Invalid weather timestamps');
  }
  const items: WeatherValue[] = [];
  WEATHER_VARIABLES.forEach((variable, index) => {
    const values = hourly[variable];
    if (units[variable] !== WEATHER_UNITS[index] || !Array.isArray(values) || values.length !== times.length)
      throw new Error('Invalid weather units/coverage');
    const min = index === 0 ? -100 : 0, max = index === 0 ? 70 : index === 1 ? 100 : index === 2 ? 1000 : 20;
    if (values.some((value: unknown) => value !== null && (!finite(value) || value < min || value > max)))
      throw new Error('Invalid weather values');
    for (let day = 0; day < days; day++) {
      const hours = values.slice(day * 24, day * 24 + 24) as (number | null)[];
      const complete = hours.every((value) => value !== null);
      const sum = hours.reduce<number>((total, value) => total + (value ?? 0), 0);
      items.push({ date: String(times[day * 24]).slice(0, 10), variable,
        unit: WEATHER_UNITS[index], value: complete ? Math.round((index < 2 ? sum / 24 : sum) * 1000) / 1000 : null,
        quality: complete ? 'modeled' : 'missing' });
    }
  });
  return { raw: body, items, provenance: {
    provider: 'Open-Meteo', dataset: 'ERA5', model: 'era5', endpoint: WEATHER_ENDPOINT,
    requestedLatitude: profile.latitude, requestedLongitude: profile.longitude,
    gridLatitude: body['latitude'], gridLongitude: body['longitude'], timezone: profile.timezone,
    resolution: '0.25° (~25 km)', sourceTemporalResolution: 'hourly',
    aggregation: 'local-calendar-day; mean temperature/humidity, sum precipitation/ET0; requires 24 non-null hours',
    adapterVersion: 'era5-hourly-v1', licence: 'CC BY 4.0',
    attribution: 'Open-Meteo; Copernicus Climate Change Service / ECMWF ERA5',
    documentation: 'https://open-meteo.com/en/docs/historical-weather-api',
  } };
}

@Injectable()
export class OpenMeteoProvider {
  async fetch(profile: Pick<WeatherProfile, 'latitude' | 'longitude' | 'timezone'>, from: string, to: string): Promise<WeatherData> {
    const url = new URL(WEATHER_ENDPOINT);
    url.search = new URLSearchParams({ latitude: String(profile.latitude), longitude: String(profile.longitude),
      timezone: profile.timezone, start_date: from, end_date: to, hourly: WEATHER_VARIABLES.join(','),
      models: 'era5', temperature_unit: 'celsius', precipitation_unit: 'mm' }).toString();
    // Fixed HTTPS host, no redirects/custom URL, no names, plot IDs, tokens or photos sent.
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error('Weather provider unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 262144) throw new Error('Weather response too large');
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    return normalizeWeather(JSON.parse(Buffer.concat(chunks).toString('utf8')), profile, from, to);
  }
}
