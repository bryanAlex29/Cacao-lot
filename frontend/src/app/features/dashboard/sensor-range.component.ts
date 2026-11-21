import { Component, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { SensorRangeState } from '../../core/sensor-thresholds/sensor-thresholds.types';

@Component({
  selector: 'app-sensor-range',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `<div class="range-info" [attr.aria-busy]="state().status === 'loading'">
    @if (state().status === 'configured' && state().range; as range) {
      <p class="limits">
        Mín. {{ range.minValue | number: '1.0-2' }} {{ unit() }} · Máx.
        {{ range.maxValue | number: '1.0-2' }} {{ unit() }}
      </p>
      <p>Rango configurado · solo monitoreo</p>
      <p>
        Vigente desde {{ range.effectiveAt | date: 'dd/MM/yyyy HH:mm:ss' }} · v{{ range.version }}
      </p>
    } @else {
      <p>{{ labels[state().status] }}</p>
    }
    @if (state().checkedAt) {
      <p>Consultado {{ state().checkedAt | date: 'HH:mm:ss' }} · hora local</p>
    }
    @if (canEdit() && (state().status === 'configured' || state().status === 'unconfigured')) {
      <button type="button" (click)="configure.emit()">Configurar rango</button>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .range-info {
        margin: 12px 0 6px;
        padding: 8px;
        border-radius: 8px;
        background: var(--green-soft);
        color: #165a23;
      }
      p {
        margin: 3px 0;
        font-size: 11px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      .limits {
        font-weight: 700;
      }
      button {
        margin-top: 8px;
        min-height: 44px;
        padding: 8px;
        max-width: 100%;
        border: 1px solid var(--green);
        border-radius: 8px;
        background: var(--green);
        color: white;
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
    `,
  ],
})
export class SensorRangeComponent {
  readonly canEdit = input(false);
  readonly configure = output<void>();
  readonly state = input.required<SensorRangeState>();
  readonly labels: Record<SensorRangeState['status'], string> = {
    unselected: 'Selecciona un dispositivo para consultar rangos',
    loading: 'Consultando rango…',
    configured: 'Rango configurado',
    unconfigured: 'Sin rango configurado',
    disabled: 'Rango no disponible · sensor o dispositivo deshabilitado',
    error: 'No se pudo consultar el rango',
  };
  unit(): string {
    return this.state().unit === 'CELSIUS' ? '°C' : '%';
  }
}
