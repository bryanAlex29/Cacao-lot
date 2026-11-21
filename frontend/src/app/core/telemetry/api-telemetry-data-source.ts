import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { io } from 'socket.io-client';
import type {
  DataSource,
  DeviceStatusEvent,
  Page,
  TelemetryReading,
  TelemetrySnapshot,
  TelemetrySubscription,
  TelemetryUpdatedEvent,
} from '@cacaosmart/contracts';
import { AuthService } from '../auth/auth.service';
import type { TelemetryDataSource, TelemetryStream } from './telemetry-data-source';

@Injectable({ providedIn: 'root' })
export class ApiTelemetryDataSource implements TelemetryDataSource {
  readonly source: DataSource = 'real';
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  snapshot(selection: TelemetrySubscription) {
    return this.http.get<TelemetrySnapshot>(`/api/v1/plots/${selection.plotId}/dashboard`, {
      params: { source: this.source, deviceId: selection.deviceId },
    });
  }
  history(selection: TelemetrySubscription, from: string, to: string, offset: number) {
    return this.http.get<Page<TelemetryReading>>(`/api/v1/plots/${selection.plotId}/readings`, {
      params: { source: this.source, deviceId: selection.deviceId, from, to, limit: 100, offset },
    });
  }
  updates(selection: TelemetrySubscription): Observable<TelemetryStream> {
    return new Observable((subscriber) => {
      const token = this.auth.accessToken();
      if (!token) {
        subscriber.next({ kind: 'error' });
        return;
      }
      const socket = io('/telemetry', {
        autoConnect: false,
        path: '/socket.io',
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
        timeout: 8000,
      });
      const matches = (event: { plotId: string; source: DataSource; deviceId: string }) =>
        event.plotId === selection.plotId &&
        event.deviceId === selection.deviceId &&
        event.source === this.source;
      socket.on('connect', () => {
        socket
          .timeout(5000)
          .emit(
            'subscribe',
            { ...selection, source: this.source },
            (error: Error | null, result: { ok?: boolean } | undefined) => {
              if (subscriber.closed) return;
              if (error || !result?.ok) {
                subscriber.next({ kind: 'error' });
                socket.disconnect();
              } else subscriber.next({ kind: 'connected' });
            },
          );
      });
      socket.on('disconnect', (reason) => {
        subscriber.next({ kind: 'disconnected' });
        // Revocación del servidor no dispara reconexión automática; REST seguirá verificando sesión.
        if (reason === 'io server disconnect') subscriber.next({ kind: 'error' });
      });
      socket.on('connect_error', () => subscriber.next({ kind: 'error' }));
      socket.on('telemetry.updated', (event: TelemetryUpdatedEvent) => {
        if (
          event?.schemaVersion === '1.0' &&
          event.reading &&
          matches({
            plotId: event.plotId,
            source: event.reading.source,
            deviceId: event.reading.deviceId,
          })
        )
          subscriber.next({ kind: 'reading', event });
      });
      socket.on('device.status', (event: DeviceStatusEvent) => {
        if (event && matches(event)) subscriber.next({ kind: 'status', event });
      });
      socket.connect();
      return () => {
        socket.removeAllListeners();
        socket.disconnect();
      };
    });
  }
}

@Injectable({ providedIn: 'root' })
export class DemoTelemetryDataSource extends ApiTelemetryDataSource {
  override readonly source: DataSource = 'demo';
}
