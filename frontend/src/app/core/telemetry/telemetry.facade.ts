import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  auditTime,
  catchError,
  forkJoin,
  interval,
  merge,
  of,
  Subject,
  Subscription,
  switchMap,
  tap,
  takeUntil,
} from 'rxjs';
import type {
  ConnectionStatus,
  Page,
  TelemetryReading,
  TelemetrySnapshot,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { ApiTelemetryDataSource, DemoTelemetryDataSource } from './api-telemetry-data-source';
import { matchesIrrigationEvent } from '../irrigation/irrigation-event';
import { matchesSensorStatus } from './sensor-status-event';
import { HistoryPeriod, validHistoryPeriod } from './history-period';

@Injectable()
export class TelemetryFacade {
  private readonly api = inject(ApiTelemetryDataSource);
  private readonly demo = inject(DemoTelemetryDataSource);
  private scope = new Subscription();
  private refresh = new Subject<void>();
  private readonly cancelRequests = new Subject<void>();
  private readonly now = signal(Date.now());
  readonly snapshot = signal<TelemetrySnapshot | null>(null);
  readonly history = signal<Page<TelemetryReading>>({ items: [], total: 0, limit: 100, offset: 0 });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly stream = signal<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  readonly days = signal(1);
  readonly period = signal<HistoryPeriod | null>(null);
  readonly irrigationRefresh = signal(0);
  readonly sensorRefresh = signal(0);
  private lastSensorSignature?: string;
  private lastIrrigationId?: string;
  readonly offset = signal(0);
  readonly readingStale = computed(() => {
    const snapshot = this.snapshot();
    const reading = snapshot?.reading;
    return (
      !reading ||
      !snapshot?.device ||
      this.now() - Date.parse(reading.recordedAt ?? reading.receivedAt) >
        snapshot.device.expectedIntervalSeconds * 2000
    );
  });
  private selection?: TelemetrySubscription;
  readonly status = computed<ConnectionStatus>(() => {
    const device = this.snapshot()?.device;
    if (device?.status === 'offline') return 'offline';
    if (!device?.lastSeenAt) return 'unknown';
    const age = this.now() - new Date(device.lastSeenAt).getTime();
    return age > device.expectedIntervalSeconds * 5000
      ? 'offline'
      : age > device.expectedIntervalSeconds * 2000
        ? 'stale'
        : 'online';
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      this.stop();
    });
  }
  stop(): void {
    this.scope.unsubscribe();
    this.scope = new Subscription();
    this.selection = undefined;
    this.lastIrrigationId = undefined;
    this.irrigationRefresh.set(0);
    this.sensorRefresh.set(0);
    this.lastSensorSignature = undefined;
    this.snapshot.set(null);
    this.period.set(null);
    this.days.set(1);
    this.history.set({ items: [], total: 0, limit: 100, offset: 0 });
    this.busy.set(false);
  }
  select(selection: TelemetrySubscription, period: HistoryPeriod | null = null, days = 1): void {
    this.stop();
    this.period.set(period);
    this.days.set(days);
    this.selection = { ...selection };
    this.offset.set(0);
    this.error.set('');
    this.stream.set('connecting');
    this.busy.set(true);
    this.refresh = new Subject<void>();
    const source = selection.source === 'demo' ? this.demo : this.api;
    // Cancelar solicitudes anteriores impide aplicar respuestas de otra selección o fuera de orden.
    this.scope.add(
      merge(of(undefined), this.refresh, interval(15000))
        .pipe(
          auditTime(100),
          tap(() => this.busy.set(true)),
          switchMap(() => {
            const fixed = this.period();
            const to = fixed?.to ?? new Date().toISOString();
            const from =
              fixed?.from ?? new Date(Date.parse(to) - this.days() * 86400000).toISOString();
            return forkJoin({
              snapshot: source.snapshot(selection),
              history: source.history(selection, from, to, this.offset()),
            }).pipe(
              takeUntil(this.cancelRequests),
              catchError(() => {
                this.error.set(
                  'No se pudieron recuperar las mediciones. Revisa tu sesión y conexión; no se sustituyen por datos simulados.',
                );
                this.busy.set(false);
                return of(null);
              }),
            );
          }),
        )
        .subscribe((result) => {
          if (!result) return;
          this.snapshot.set(result.snapshot);
          this.history.set(result.history);
          this.now.set(Date.now());
          this.error.set('');
          this.busy.set(false);
        }),
    );
    this.scope.add(
      source.updates(selection).subscribe((event) => {
        if (event.kind === 'connected') {
          this.irrigationRefresh.update((value) => value + 1);
          this.stream.set('connected');
          this.reload();
        } else if (event.kind === 'error' || event.kind === 'disconnected')
          this.stream.set(event.kind);
        else if (event.kind === 'reading')
          this.reload(); // REST decide el último con desempate de servidor.
        else if (event.kind === 'irrigation') {
          if (
            matchesIrrigationEvent(event.event, selection) &&
            event.event.observation.id !== this.lastIrrigationId
          ) {
            this.lastIrrigationId = event.event.observation.id;
            this.irrigationRefresh.update((value) => value + 1);
            this.reload(); // Invalidation only: REST remains authoritative for ordering.
          }
        } else if (event.kind === 'sensor') {
          if (matchesSensorStatus(event.event, selection)) {
            const signature = JSON.stringify(event.event.sensors);
            if (signature !== this.lastSensorSignature) {
              this.lastSensorSignature = signature;
              this.sensorRefresh.update((value) => value + 1);
              this.reload(); // Derived health invalidates REST; never overwrite newer measurements.
            }
          }
        } else if (event.kind === 'status') {
          const snapshot = this.snapshot();
          const device = snapshot?.device;
          // Estado de conexión no necesita descargar el histórico otra vez ni retroceder lastSeenAt.
          if (
            snapshot &&
            device &&
            event.event.deviceId === device.id &&
            Date.parse(event.event.lastSeenAt ?? '1970-01-01') >=
              Date.parse(device.lastSeenAt ?? '1970-01-01')
          ) {
            this.snapshot.set({
              ...snapshot,
              device: {
                ...device,
                status: event.event.status,
                lastSeenAt: event.event.lastSeenAt,
                expectedIntervalSeconds: event.event.expectedIntervalSeconds,
              },
            });
          }
        }
      }),
    );
  }
  reload(): void {
    if (this.selection) this.refresh.next();
  }
  reconnect(): void {
    if (this.selection) this.select({ ...this.selection }, this.period(), this.days());
  }
  setDays(days: number): void {
    if (![1, 7, 30].includes(days)) return;
    this.cancelRequests.next();
    this.period.set(null);
    this.days.set(days);
    this.offset.set(0);
    this.clearHistory();
    this.reload();
  }
  setPeriod(period: HistoryPeriod): void {
    if (!validHistoryPeriod(period)) return;
    this.cancelRequests.next();
    this.period.set({ ...period });
    this.offset.set(0);
    this.clearHistory();
    this.reload();
  }
  private clearHistory(): void {
    this.history.set({ items: [], total: 0, limit: 100, offset: 0 });
    this.error.set('');
    this.busy.set(!!this.selection);
  }
  page(offset: number): void {
    if (offset < 0 || offset >= this.history().total) return;
    this.cancelRequests.next();
    this.offset.set(offset);
    this.clearHistory();
    this.reload();
  }
}
