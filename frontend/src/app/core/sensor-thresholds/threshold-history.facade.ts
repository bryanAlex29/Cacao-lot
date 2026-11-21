import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { catchError, forkJoin, map, of, Subject, Subscription, switchMap, timer } from 'rxjs';
import type {
  SensorThresholdInterval,
  SoilSensorId,
  TelemetryReading,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { ThresholdHistoryApi } from './threshold-history-api.service';
import type { ThresholdSensor } from './sensor-thresholds.types';

export const soilCodes = ['soil_1', 'soil_2', 'soil_3'] as const;
export interface ThresholdHistoryState {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disabled';
  intervals: SensorThresholdInterval[];
}
export type ThresholdHistoryMap = Record<SoilSensorId, ThresholdHistoryState>;
export const historyStates = (status: ThresholdHistoryState['status']): ThresholdHistoryMap => ({
  soil_1: { status, intervals: [] },
  soil_2: { status, intervals: [] },
  soil_3: { status, intervals: [] },
});

/** Same time domain as the existing paginated measurement chart; +1ms includes its newest point. */
export function historyWindow(readings: TelemetryReading[]): { from: string; to: string } | null {
  if (!readings.length) return null;
  const times = readings.map((row) => Date.parse(row.recordedAt ?? row.receivedAt));
  if (times.some((time) => !Number.isFinite(time))) return null;
  return {
    from: new Date(Math.min(...times)).toISOString(),
    to: new Date(Math.max(...times) + 1).toISOString(),
  };
}

interface HistoryRequest {
  selection: TelemetrySubscription;
  sensors: ThresholdSensor[];
  active: boolean;
  from: string;
  to: string;
}

/** Independent cancellation/errors: a range failure never blocks measurements or the cards. */
@Injectable()
export class ThresholdHistoryFacade {
  private readonly api = inject(ThresholdHistoryApi);
  private readonly requests = new Subject<HistoryRequest | null>();
  private pending?: HistoryRequest;
  private work = new Subscription();
  readonly states = signal<ThresholdHistoryMap>(historyStates('idle'));

  constructor() {
    this.work = this.requests
      .pipe(
        switchMap((request) =>
          request === null
            ? of(null)
            : timer(100).pipe(
                switchMap(() =>
                  forkJoin(
                    soilCodes.map((code) => {
                      const matches = request.sensors.filter((sensor) => sensor.code === code);
                      const sensor = matches[0];
                      const result = (status: ThresholdHistoryState['status']) => ({
                        code,
                        state: { status, intervals: [] } satisfies ThresholdHistoryState,
                      });
                      if (!request.active || (sensor && !sensor.enabled))
                        return of(result('disabled'));
                      if (
                        matches.length !== 1 ||
                        !sensor?.id ||
                        sensor.variable !== 'SOIL_MOISTURE' ||
                        sensor.unit !== 'PERCENT'
                      )
                        return of(result('error'));
                      return this.api
                        .get(request.selection, { ...sensor, code }, request.from, request.to)
                        .pipe(
                          map((response) => ({
                            code,
                            state: {
                              status: 'ready',
                              intervals: response.intervals,
                            } satisfies ThresholdHistoryState,
                          })),
                          catchError(() => of(result('error'))),
                        );
                    }),
                  ),
                ),
              ),
        ),
      )
      .subscribe((entries) => {
        if (entries)
          this.states.set(
            Object.fromEntries(
              entries.map(({ code, state }) => [code, state]),
            ) as ThresholdHistoryMap,
          );
      });
    inject(DestroyRef).onDestroy(() => {
      this.stop();
      this.work.unsubscribe();
    });
  }

  load(
    selection: TelemetrySubscription | null,
    sensors: ThresholdSensor[],
    active: boolean,
    readings: TelemetryReading[],
  ): void {
    this.stop();
    const window = historyWindow(readings);
    if (!selection || !window) return;
    if (
      readings.some((row) => row.deviceId !== selection.deviceId || row.source !== selection.source)
    ) {
      this.states.set(historyStates('error'));
      return;
    }
    this.pending = {
      selection: { ...selection },
      sensors: sensors.map((s) => ({ ...s })),
      active,
      ...window,
    };
    this.reload();
  }

  reload(): void {
    if (!this.pending) return;
    this.states.set(historyStates('loading'));
    this.requests.next(this.pending);
  }

  stop(): void {
    this.pending = undefined;
    this.requests.next(null);
    this.states.set(historyStates('idle'));
  }
}
