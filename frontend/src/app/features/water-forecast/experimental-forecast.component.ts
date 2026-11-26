import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import type {
  ExperimentalForecastZone,
  ExperimentalMoistureForecast,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { ExperimentalForecastApi } from './experimental-forecast-api.service';

@Component({
  selector: 'app-experimental-forecast',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './experimental-forecast.component.html',
  styleUrl: './experimental-forecast.component.css',
})
export class ExperimentalForecastComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  private readonly api = inject(ExperimentalForecastApi);
  private request = new Subscription();
  readonly data = signal<ExperimentalMoistureForecast | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly names = { soil_1: 'Zona A', soil_2: 'Zona B', soil_3: 'Zona C' };
  readonly reasons: Record<ExperimentalForecastZone['reason'], string> = {
    available: 'Referencia experimental disponible',
    sensor_missing: 'Sensor no registrado',
    sensor_disabled: 'Sensor deshabilitado',
    device_disabled: 'Equipo deshabilitado',
    missing_previous_day: 'Falta una lectura del día anterior recibida antes del corte',
    unusable_previous_day:
      'La última lectura del día anterior no es utilizable; no se sustituye por otra más antigua',
  };
  constructor() {
    effect(() => {
      this.selection();
      this.reset();
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }
  private reset() {
    this.request.unsubscribe();
    this.data.set(null);
    this.busy.set(false);
    this.error.set('');
  }
  load() {
    this.reset();
    const selection = this.selection();
    if (!selection) return;
    this.busy.set(true);
    this.request = this.api.get(selection).subscribe({
      next: (value) => {
        this.data.set(value);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          'No se pudo consultar la referencia experimental. Reintenta; no se usarán datos de ejemplo.',
        );
      },
    });
  }
  points(zone: ExperimentalForecastZone) {
    return [
      ...zone.history.slice(-7),
      {
        day: this.data()!.target.from,
        observedPct: null,
        predictedPct: zone.predictedPct,
      },
    ];
  }
  path(zone: ExperimentalForecastZone, field: 'observedPct' | 'predictedPct') {
    let previous = false;
    return this.points(zone)
      .map((point, i) => {
        const value = point[field];
        if (value === null) {
          previous = false;
          return '';
        }
        const command = previous ? 'L' : 'M';
        previous = true;
        return `${command}${this.x(i)} ${this.y(value)}`;
      })
      .join(' ');
  }
  x(index: number) {
    return 25 + index * 44;
  }
  y(value: number) {
    return 115 - value;
  }
}
