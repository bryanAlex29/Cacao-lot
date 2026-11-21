import { InjectionToken } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  DataSource,
  Page,
  TelemetryReading,
  TelemetrySnapshot,
  TelemetrySubscription,
  TelemetryUpdatedEvent,
  DeviceStatusEvent,
} from '@cacaosmart/contracts';

export type TelemetryStream =
  | { kind: 'connected' | 'disconnected' | 'error' }
  | { kind: 'reading'; event: TelemetryUpdatedEvent }
  | { kind: 'status'; event: DeviceStatusEvent };

/** Ambos orígenes usan la API autorizada; demo nunca genera datos en el navegador. */
export interface TelemetryDataSource {
  readonly source: DataSource;
  snapshot(selection: TelemetrySubscription): Observable<TelemetrySnapshot>;
  history(
    selection: TelemetrySubscription,
    from: string,
    to: string,
    offset: number,
  ): Observable<Page<TelemetryReading>>;
  updates(selection: TelemetrySubscription): Observable<TelemetryStream>;
}

export const TELEMETRY_DATA_SOURCE = new InjectionToken<TelemetryDataSource>('TelemetryDataSource');
