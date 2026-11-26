import { isUUID } from 'class-validator';

export interface ThingSpeakBinding {
  channelId: number;
  ownerId: string;
  plotId: string;
  deviceId: string;
  pollIntervalSeconds: number;
}

export function parseThingSpeakBinding(input: unknown): ThingSpeakBinding {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Asociación ThingSpeak inválida.');
  }
  const value = input as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) => !['channelId', 'ownerId', 'plotId', 'deviceId', 'pollIntervalSeconds'].includes(key),
    ) ||
    value.channelId !== 3554501 ||
    !['ownerId', 'plotId', 'deviceId'].every(
      (key) => typeof value[key] === 'string' && isUUID(value[key], '4'),
    ) ||
    typeof value.pollIntervalSeconds !== 'number' ||
    !Number.isInteger(value.pollIntervalSeconds) ||
    value.pollIntervalSeconds < 20 ||
    value.pollIntervalSeconds > 3600
  ) {
    throw new Error('Asociación ThingSpeak inválida.');
  }
  return value as unknown as ThingSpeakBinding;
}
