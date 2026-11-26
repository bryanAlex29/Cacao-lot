import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Subscription } from 'rxjs';
import type {
  RegressionForecast,
  RegressionForecastZone,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { RegressionForecastApi } from './regression-forecast-api.service';

@Component({
  selector: 'app-regression-forecast',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  templateUrl: './regression-forecast.component.html',
  styleUrl: './experimental-forecast.component.css',
})
export class RegressionForecastComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  private readonly api = inject(RegressionForecastApi);
  private request = new Subscription();
  readonly data = signal<RegressionForecast | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly names = { soil_1: 'Zona A', soil_2: 'Zona B', soil_3: 'Zona C' };
  readonly partitions = [
    { key: 'validation', label: 'Validación' },
    { key: 'test', label: 'Prueba' },
  ] as const;
  readonly reasons: Record<RegressionForecastZone['reason'], string> = {
    available: 'Estimación experimental disponible; no es una recomendación de riego',
    sensor_missing: 'Sensor no registrado',
    sensor_disabled: 'Sensor deshabilitado',
    device_disabled: 'Equipo deshabilitado',
    model_not_registered: 'No hay un modelo evaluado registrado para esta sonda y origen',
    model_not_available_at_cutoff:
      'La última versión utiliza datos posteriores al corte; no se publica',
    model_incompatible: 'La versión guardada no supera las comprobaciones de integridad o contrato',
    missing_features: 'Faltan lecturas de los dos días anteriores conocidas al corte UTC',
    unusable_features: 'Una de las últimas lecturas no es utilizable; no se rellena ni sustituye',
    output_out_of_range: 'Salida fuera de 0–100 % o no finita: bloqueada, no recortada',
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
      next: (data) => {
        this.data.set(data);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          'No se pudo consultar la regresión. Reintenta; no se sustituye por una predicción ficticia.',
        );
      },
    });
  }
}
