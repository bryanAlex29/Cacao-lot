import type { ThingSpeakSnapshot } from './thingspeak.client';

type Quality = 'valid' | 'missing' | 'invalid';

function measurement(raw: string | null | undefined, min: number, max: number) {
  if (raw === null || raw === undefined || raw.trim() === '') {
    return { value: null, quality: 'missing' as Quality };
  }
  // No convertir booleanos, hexadecimal u otro texto a mediciones.
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw.trim())) {
    return { value: null, quality: 'invalid' as Quality };
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max
    ? { value, quality: 'valid' as Quality }
    : { value: null, quality: 'invalid' as Quality };
}

function relayState(raw: string | null | undefined): { value: boolean | null; quality: Quality } {
  const value = raw?.trim() ?? '';
  if (value === '') return { value: null, quality: 'missing' };
  if (value === '1') return { value: true, quality: 'valid' };
  if (value === '0') return { value: false, quality: 'valid' };
  return { value: null, quality: 'invalid' };
}

/** Mapa confirmado por el propietario; no implica destino autorizado ni ingesta. */
export function mapThingSpeakSnapshot(snapshot: ThingSpeakSnapshot) {
  if (snapshot.channelId !== 3554501) {
    throw new Error('No hay un mapa confirmado para este canal ThingSpeak.');
  }
  if (!snapshot.entry) return null;
  const { fields, entryId, createdAt } = snapshot.entry;
  const temperature = measurement(fields.field1, -50, 100);
  const air = measurement(fields.field2, 0, 100);
  const soil = measurement(fields.field3, 0, 100);
  const relay = relayState(fields.field4);
  return {
    provider: 'thingspeak' as const,
    channelId: snapshot.channelId,
    entryId,
    // No presentar la hora del proveedor como hora fiable del ESP32.
    providerCreatedAt: createdAt,
    temperatureC: temperature.value,
    airHumidityPct: air.value,
    soilMoisture: { soil_1: soil.value, soil_2: null, soil_3: null },
    rainDetected: null,
    valve: { relayCommandedOpen: relay.value, feedbackOpen: null },
    quality: {
      temperatureC: temperature.quality,
      airHumidityPct: air.quality,
      soil_1: soil.quality,
      soil_2: 'missing' as const,
      soil_3: 'missing' as const,
      rainDetected: 'missing' as const,
      relayCommandedOpen: relay.quality,
      feedbackOpen: 'missing' as const,
    },
    soilCalibration: { soil_1: 'user-confirmed' as const },
  };
}
