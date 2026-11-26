import type { SensorHealth, QualityKey } from '@cacaosmart/contracts';

/** Contexto interno. Nunca se acepta desde un DTO/HTTP de ingesta. */
export interface ExternalObservation {
  ownerId: string;
  channelId: number;
  entryId: number;
  providerObservedAt: string;
  quality: Record<QualityKey, SensorHealth>;
}

export function requireExternalObservation(
  context: ExternalObservation,
  eventId: string,
  recordedAt: string | null,
) {
  const time = Date.parse(context.providerObservedAt);
  if (
    context.channelId !== 3554501 ||
    !Number.isSafeInteger(context.entryId) ||
    context.entryId < 1 ||
    recordedAt !== null ||
    !Number.isFinite(time) ||
    time > Date.now() + 60000 ||
    eventId !== `thingspeak:${context.channelId}:${context.entryId}`
  )
    throw new Error('Observación externa inválida.');
}
