import type { DeviceOfflineAlert, OfflineAlertCloseReason } from '@cacaosmart/contracts';
import type { OfflineAlert } from '@prisma/client';
import { connectionStatus } from '../devices/connection-status';

export interface MonitoredDevice {
  isActive: boolean;
  lastSeenAt: Date | null;
  expectedIntervalSeconds: number;
  plot: { archivedAt: Date | null; owner: { isActive: boolean } };
}

export function monitoringEligible(device: MonitoredDevice): boolean {
  return device.isActive && !device.plot.archivedAt && device.plot.owner.isActive;
}

export function shouldOpenOfflineAlert(device: MonitoredDevice, now: Date): boolean {
  return (
    monitoringEligible(device) &&
    device.lastSeenAt !== null &&
    connectionStatus(device, now) === 'OFFLINE'
  );
}

export function offlineClosure(
  device: MonitoredDevice,
  alert: Pick<OfflineAlert, 'lastSeenAt' | 'expectedIntervalSeconds' | 'detectedAt'>,
  now: Date,
): { closedAt: Date; closeReason: OfflineAlertCloseReason } | null {
  if (!monitoringEligible(device) || !device.lastSeenAt)
    return { closedAt: now, closeReason: 'MONITORING_STOPPED' };
  // Receipt of a new accepted message proves contact, even when its measurement timestamp is old.
  // Replayed identical events do not update lastSeenAt in the existing ingestion pipeline.
  if (device.lastSeenAt > alert.lastSeenAt)
    return {
      closedAt: new Date(Math.max(device.lastSeenAt.getTime(), alert.detectedAt.getTime())),
      closeReason: 'CONTACT_RESTORED',
    };
  if (device.expectedIntervalSeconds !== alert.expectedIntervalSeconds)
    return { closedAt: now, closeReason: 'INTERVAL_CHANGED' };
  return null;
}

export function toOfflineAlert(row: OfflineAlert): DeviceOfflineAlert {
  return {
    id: row.id,
    deviceId: row.deviceId,
    plotId: row.plotId,
    source: row.source,
    type: 'DEVICE_OFFLINE',
    severity: 'warning',
    lastSeenAt: row.lastSeenAt.toISOString(),
    expectedIntervalSeconds: row.expectedIntervalSeconds,
    detectedAt: row.detectedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    closeReason: row.closeReason as OfflineAlertCloseReason | null,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  };
}
