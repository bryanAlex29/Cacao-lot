import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import {
  auditTime,
  catchError,
  forkJoin,
  interval,
  map,
  merge,
  of,
  Subject,
  Subscription,
  switchMap,
  tap,
  takeUntil,
} from 'rxjs';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { SensorThresholdsApi } from './sensor-thresholds-api.service';
import {
  quantitativeSensors,
  QuantitativeSensorCode,
  rangeStates,
  SensorRangeMap,
  SensorRangeState,
  ThresholdSensor,
} from './sensor-thresholds.types';

/** Configuration has its own lifecycle: a failure never blocks or fabricates telemetry. */
@Injectable()
export class SensorThresholdsFacade {
  private readonly api = inject(SensorThresholdsApi);
  private scope = new Subscription();
  private refresh = new Subject<void>();
  private active = false;
  private readonly cancelLoads = new Subject<void>();
  readonly states = signal<SensorRangeMap>(rangeStates('unselected'));
  readonly busy = signal(false);
  readonly hasErrors = computed(() =>
    Object.values(this.states()).some((s) => s.status === 'error'),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  stop(): void {
    this.scope.unsubscribe();
    this.scope = new Subscription();
    this.active = false;
    this.busy.set(false);
    this.states.set(rangeStates('unselected'));
  }

  select(
    selection: TelemetrySubscription,
    sensors: ThresholdSensor[],
    deviceActive: boolean,
  ): void {
    this.stop();
    this.active = true;
    const selected = { ...selection };
    const inventory = sensors.map((sensor) => ({ ...sensor }));
    this.refresh = new Subject<void>();
    this.states.set(rangeStates(deviceActive ? 'loading' : 'disabled'));
    this.busy.set(deviceActive);
    this.scope.add(
      merge(of(undefined), this.refresh, interval(60000))
        .pipe(
          auditTime(100),
          tap(() => {
            this.states.set(rangeStates(deviceActive ? 'loading' : 'disabled'));
            this.busy.set(deviceActive);
          }),
          switchMap(() =>
            forkJoin(
              (Object.keys(quantitativeSensors) as QuantitativeSensorCode[]).map((code) => {
                const expected = quantitativeSensors[code];
                const matches = inventory.filter((sensor) => sensor.code === code);
                const sensor = matches[0];
                const state = (status: SensorRangeState['status']): SensorRangeState => ({
                  status,
                  range: null,
                  unit: null,
                  checkedAt: null,
                });
                if (!deviceActive || (sensor && !sensor.enabled))
                  return of({ code, state: state('disabled') });
                if (
                  matches.length !== 1 ||
                  !sensor?.id ||
                  sensor.variable !== expected.variable ||
                  sensor.unit !== expected.unit
                )
                  return of({ code, state: state('error') });
                return this.api.get(selected, sensor, code).pipe(
                  map((response) => ({
                    code,
                    state: {
                      status: response.threshold === null ? 'unconfigured' : 'configured',
                      range: response.threshold,
                      unit: response.unit,
                      checkedAt: new Date().toISOString(),
                    } satisfies SensorRangeState,
                  })),
                  catchError(() => of({ code, state: state('error') })),
                );
              }),
            ).pipe(takeUntil(this.cancelLoads)),
          ),
        )
        .subscribe((entries) => {
          this.states.set(
            Object.fromEntries(entries.map(({ code, state }) => [code, state])) as SensorRangeMap,
          );
          this.busy.set(false);
        }),
    );
  }

  reload(): void {
    if (this.active) this.refresh.next();
  }

  reloadAfterSave(): void {
    if (!this.active) return;
    // A GET started before the commit must not repaint the card with an older range.
    this.cancelLoads.next();
    this.states.set(rangeStates('loading'));
    this.busy.set(true);
    this.reload();
  }
}
