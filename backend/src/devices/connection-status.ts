import type { DeviceStatus } from '@prisma/client';

/** Márgenes relativos al intervalo configurado; no son umbrales agronómicos. */
export function connectionStatus(
  device: { isActive: boolean; lastSeenAt: Date | null; expectedIntervalSeconds: number },
  now = new Date(),
): DeviceStatus {
  if (!device.isActive) return 'OFFLINE';
  if (!device.lastSeenAt) return 'UNKNOWN';
  const elapsed = Math.max(0, now.getTime() - device.lastSeenAt.getTime());
  if (elapsed > device.expectedIntervalSeconds * 5000) return 'OFFLINE';
  if (elapsed > device.expectedIntervalSeconds * 2000) return 'STALE';
  return 'ONLINE';
}
