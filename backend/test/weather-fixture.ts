import { WEATHER_UNITS, WEATHER_VARIABLES } from '../src/weather/open-meteo.provider';

/** Explicit synthetic fixture; never seeds the main database or contacts a weather service. */
export function weatherFixture(from: string, to: string, timezone = 'America/Guayaquil') {
  const hours = (Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1) * 24;
  return {
    latitude: 0, longitude: 0, timezone, utc_offset_seconds: timezone === 'America/Guayaquil' ? -18000 : -21600,
    hourly_units: Object.fromEntries(WEATHER_VARIABLES.map((v, i) => [v, WEATHER_UNITS[i]])),
    hourly: {
      time: Array.from({ length: hours }, (_, i) => `${new Date(Date.parse(from) + Math.floor(i / 24) * 86400000).toISOString().slice(0, 10)}T${String(i % 24).padStart(2, '0')}:00`),
      temperature_2m: Array<number | null>(hours).fill(24),
      relative_humidity_2m: Array<number | null>(hours).fill(80),
      precipitation: Array<number | null>(hours).fill(0.5),
      et0_fao_evapotranspiration: Array<number | null>(hours).fill(0.1),
    },
  };
}
