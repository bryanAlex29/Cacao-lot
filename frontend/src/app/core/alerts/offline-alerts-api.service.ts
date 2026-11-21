import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { DeviceOfflineAlert, Page, TelemetrySubscription } from '@cacaosmart/contracts';

export function checkedOfflineAlert(
  alert: DeviceOfflineAlert,
  selection: TelemetrySubscription,
): DeviceOfflineAlert {
  const date = (value: unknown): value is string =>
    typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (
    !alert ||
    typeof alert.id !== 'string' ||
    !alert.id ||
    alert.plotId !== selection.plotId ||
    alert.deviceId !== selection.deviceId ||
    alert.source !== selection.source ||
    alert.type !== 'DEVICE_OFFLINE' ||
    alert.severity !== 'warning' ||
    !date(alert.lastSeenAt) ||
    !date(alert.detectedAt) ||
    !Number.isInteger(alert.expectedIntervalSeconds) ||
    alert.expectedIntervalSeconds < 1 ||
    Date.parse(alert.detectedAt) <=
      Date.parse(alert.lastSeenAt) + alert.expectedIntervalSeconds * 5000 ||
    (alert.acknowledgedAt !== null &&
      (!date(alert.acknowledgedAt) ||
        Date.parse(alert.acknowledgedAt) < Date.parse(alert.detectedAt))) ||
    (alert.closedAt === null
      ? alert.closeReason !== null
      : !date(alert.closedAt) ||
        Date.parse(alert.closedAt) < Date.parse(alert.detectedAt) ||
        !['CONTACT_RESTORED', 'MONITORING_STOPPED', 'INTERVAL_CHANGED'].includes(
          alert.closeReason ?? '',
        ))
  )
    throw new Error('Alerta incompatible con el dispositivo y origen seleccionados');
  return alert;
}

@Injectable({ providedIn: 'root' })
export class OfflineAlertsApi {
  private readonly http = inject(HttpClient);
  list(selection: TelemetrySubscription, offset: number, limit = 5) {
    return this.http
      .get<Page<DeviceOfflineAlert>>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/alerts`,
        {
          params: { deviceId: selection.deviceId, source: selection.source, offset, limit },
        },
      )
      .pipe(
        timeout(8000),
        map((page) => {
          if (
            !page ||
            !Array.isArray(page.items) ||
            !Number.isInteger(page.total) ||
            page.total < 0 ||
            page.limit !== limit ||
            page.offset !== offset ||
            page.items.length > limit ||
            page.items.length > page.total ||
            new Set(page.items.map((alert) => alert?.id)).size !== page.items.length
          )
            throw new Error('Página de alertas incompatible');
          page.items.forEach((alert) => checkedOfflineAlert(alert, selection));
          return page;
        }),
      );
  }

  acknowledge(selection: TelemetrySubscription, alertId: string) {
    return this.http
      .post<DeviceOfflineAlert>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/alerts/${encodeURIComponent(alertId)}/acknowledge`,
        {},
      )
      .pipe(
        timeout(8000),
        map((response) => {
          const alert = checkedOfflineAlert(response, selection);
          if (alert.id !== alertId || !alert.acknowledgedAt)
            throw new Error('Reconocimiento no confirmado');
          return alert;
        }),
      ); // A write is never retried automatically, even though the server operation is idempotent.
  }
}
