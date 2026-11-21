import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type {
  MoisturePolicyResponse,
  Page,
  PutMoisturePolicyInput,
  SoilMoistureAlert,
  TelemetrySubscription,
} from '@cacaosmart/contracts';

const date = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
const positiveVersion = (value: number) => Number.isInteger(value) && value > 0;
const percent = (value: number) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
export function checkedMoisturePolicy(
  row: MoisturePolicyResponse,
  selection: TelemetrySubscription,
  sensorId: string,
) {
  if (
    !row ||
    row.sensorId !== sensorId ||
    row.plotId !== selection.plotId ||
    row.deviceId !== selection.deviceId ||
    row.source !== selection.source ||
    !['soil_1', 'soil_2', 'soil_3'].includes(row.code) ||
    ![
      'unconfigured',
      'no_range',
      'incompatible_margin',
      'disabled',
      'real_uncalibrated',
      'ready',
    ].includes(row.status) ||
    (row.range !== null &&
      (!row.range ||
        !percent(row.range.minValue) ||
        !percent(row.range.maxValue) ||
        row.range.minValue >= row.range.maxValue ||
        !positiveVersion(row.range.version) ||
        !date(row.range.effectiveAt))) ||
    (row.policy !== null &&
      (!row.policy ||
        !percent(row.policy.recoveryMarginPct) ||
        row.policy.recoveryMarginPct <= 0 ||
        !positiveVersion(row.policy.version) ||
        !date(row.policy.updatedAt))) ||
    (row.status === 'ready' &&
      (!row.range ||
        !row.policy ||
        row.range.minValue + row.policy.recoveryMarginPct > row.range.maxValue))
  )
    throw new Error('Política de humedad incompatible');
  return row;
}
export function checkedMoistureAlert(row: SoilMoistureAlert, selection: TelemetrySubscription) {
  if (
    !row ||
    !row.id ||
    typeof row.id !== 'string' ||
    !row.sensorId ||
    typeof row.sensorId !== 'string' ||
    row.plotId !== selection.plotId ||
    row.deviceId !== selection.deviceId ||
    row.source !== selection.source ||
    row.type !== 'LOW_SOIL_MOISTURE' ||
    !['soil_1', 'soil_2', 'soil_3'].includes(row.code) ||
    !percent(row.minValue) ||
    !percent(row.maxValue) ||
    row.minValue >= row.maxValue ||
    !percent(row.recoveryMarginPct) ||
    row.recoveryMarginPct <= 0 ||
    row.minValue + row.recoveryMarginPct > row.maxValue ||
    !percent(row.triggerValue) ||
    row.triggerValue >= row.minValue ||
    !positiveVersion(row.policyVersion) ||
    !positiveVersion(row.thresholdVersion) ||
    !date(row.firstLowAt) ||
    !date(row.confirmedAt) ||
    !date(row.detectedAt) ||
    Date.parse(row.firstLowAt) >= Date.parse(row.confirmedAt) ||
    Date.parse(row.confirmedAt) > Date.parse(row.detectedAt) ||
    (row.closedAt === null
      ? row.closeReason !== null
      : !date(row.closedAt) ||
        Date.parse(row.closedAt) < Date.parse(row.detectedAt) ||
        !['RECOVERED', 'CONFIGURATION_CHANGED', 'MONITORING_STOPPED'].includes(
          row.closeReason ?? '',
        )) ||
    (row.acknowledgedAt !== null &&
      (!date(row.acknowledgedAt) || Date.parse(row.acknowledgedAt) < Date.parse(row.detectedAt)))
  )
    throw new Error('Alerta de humedad incompatible');
  return row;
}
@Injectable({ providedIn: 'root' })
export class MoistureAlertsApi {
  private readonly http = inject(HttpClient);
  policy(selection: TelemetrySubscription, id: string) {
    return this.http
      .get<MoisturePolicyResponse>(
        `/api/v1/sensors/${encodeURIComponent(id)}/moisture-alert-policy`,
      )
      .pipe(
        timeout(8000),
        map((row) => checkedMoisturePolicy(row, selection, id)),
      );
  }
  put(selection: TelemetrySubscription, id: string, input: PutMoisturePolicyInput) {
    return this.http
      .put<MoisturePolicyResponse>(
        `/api/v1/sensors/${encodeURIComponent(id)}/moisture-alert-policy`,
        input,
      )
      .pipe(
        timeout(8000),
        map((row) => checkedMoisturePolicy(row, selection, id)),
      );
  }
  list(selection: TelemetrySubscription, offset: number, limit = 5) {
    return this.http
      .get<Page<SoilMoistureAlert>>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/moisture-alerts`,
        { params: { deviceId: selection.deviceId, source: selection.source, offset, limit } },
      )
      .pipe(
        timeout(8000),
        map((page) => {
          if (
            !page ||
            !Array.isArray(page.items) ||
            !Number.isInteger(page.total) ||
            page.total < 0 ||
            page.offset !== offset ||
            page.limit !== limit ||
            page.items.length > limit ||
            page.items.length > page.total ||
            new Set(page.items.map((row) => row?.id)).size !== page.items.length
          )
            throw new Error('Página de humedad incompatible');
          page.items.forEach((row) => checkedMoistureAlert(row, selection));
          return page;
        }),
      );
  }
  acknowledge(selection: TelemetrySubscription, id: string) {
    return this.http
      .post<SoilMoistureAlert>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/moisture-alerts/${encodeURIComponent(id)}/acknowledge`,
        {},
      )
      .pipe(
        timeout(8000),
        map((row) => {
          checkedMoistureAlert(row, selection);
          if (row.id !== id || !row.acknowledgedAt) throw new Error('Reconocimiento no confirmado');
          return row;
        }),
      );
  }
}
