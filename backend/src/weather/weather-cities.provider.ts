import { Injectable } from '@nestjs/common';
import type { WeatherCity } from '@cacaosmart/contracts';

export type ResolvedWeatherCity = WeatherCity & { latitude: number; longitude: number };
const endpoint = 'https://geocoding-api.open-meteo.com/v1/';
function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid city');
  return raw as Record<string, unknown>;
}
export function normalizeWeatherCity(raw: unknown): ResolvedWeatherCity {
  const value = object(raw);
  const text = (key: string) => {
    const result = value[key];
    if (
      typeof result !== 'string' ||
      !result.trim() ||
      result.length > 200 ||
      [...result].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new Error('Invalid city name');
    return result.trim();
  };
  const id = value['id'],
    latitude = value['latitude'],
    longitude = value['longitude'];
  if (
    !Number.isSafeInteger(id) ||
    Number(id) < 1 ||
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    Math.abs(latitude) > 90 ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    Math.abs(longitude) > 180
  )
    throw new Error('Invalid city coordinates');
  const countryCode = text('country_code');
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new Error('Invalid city country');
  return {
    id: Number(id),
    name: text('name'),
    region: value['admin1'] ? text('admin1') : null,
    country: text('country'),
    countryCode,
    latitude,
    longitude,
  };
}
export function publicWeatherCity(city: ResolvedWeatherCity): WeatherCity {
  return {
    id: city.id,
    name: city.name,
    region: city.region,
    country: city.country,
    countryCode: city.countryCode,
  };
}

@Injectable()
export class WeatherCitiesProvider {
  private readonly cache = new Map<string, { until: number; value: Promise<unknown> }>();
  private read(path: 'search' | 'get', params: Record<string, string>): Promise<unknown> {
    const url = new URL(path, endpoint);
    url.search = new URLSearchParams(params).toString();
    const key = url.toString(),
      hit = this.cache.get(key);
    if (hit && hit.until > Date.now()) return hit.value;
    if (this.cache.size >= 100) this.cache.delete(this.cache.keys().next().value!);
    const value = this.fetch(url);
    const entry = { until: Date.now() + 3600000, value };
    this.cache.set(key, entry);
    void value.catch(() => {
      entry.until = Date.now() + 60000;
    });
    return value;
  }
  async search(name: string): Promise<WeatherCity[]> {
    const body = object(
      await this.read('search', { name, count: '5', language: 'es', format: 'json' }),
    );
    if (body['results'] === undefined) return [];
    const results = body['results'];
    if (!Array.isArray(results) || results.length > 5) throw new Error('Invalid city results');
    const cities = results.map(normalizeWeatherCity);
    if (new Set(cities.map((c) => c.id)).size !== cities.length)
      throw new Error('Duplicate city results');
    return cities.map(publicWeatherCity);
  }
  async resolve(id: number): Promise<ResolvedWeatherCity> {
    const city = normalizeWeatherCity(
      await this.read('get', { id: String(id), language: 'es', format: 'json' }),
    );
    if (city.id !== id) throw new Error('Invalid city identity');
    return city;
  }
  private async fetch(url: URL): Promise<unknown> {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (!response.ok || !response.body) throw new Error('City service unavailable');
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) throw new Error('City response too large');
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
}
