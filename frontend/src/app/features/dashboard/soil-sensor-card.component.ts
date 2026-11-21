import { Component, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { SensorHealth } from '@cacaosmart/contracts';

@Component({
  selector: 'app-soil-sensor-card',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `<article [class.missing]="value() === null">
    <span class="leaf" aria-hidden="true">♧</span>
    <h3>Sensor {{ number() }}</h3>
    <p>Zona {{ zone() }}</p>
    <strong>{{ value() === null ? '—' : (value() | number: '1.0-1') }}<small> %</small></strong>
    <span class="quality">{{
      value() === null
        ? 'Sin datos'
        : stale()
          ? 'Desactualizado'
          : quality() === 'uncalibrated'
            ? 'Sin calibrar'
            : 'Dato recibido'
    }}</span>
    <div class="track" aria-hidden="true"><div [style.width.%]="value() ?? 0"></div></div>
    <p class="note">Sin rango configurado</p>
    <time>{{ timestamp() ? (timestamp() | date: 'dd/MM HH:mm:ss') : 'Sin actualización' }}</time>
  </article>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      article {
        padding: 18px 12px;
        background: #f7faf6;
        border: 1px solid #e2e7e2;
        border-radius: 14px;
        text-align: center;
        height: 100%;
      }
      h3 {
        font-size: 16px;
        margin: 8px 0 4px;
      }
      p {
        color: #526158;
        font-size: 13px;
        margin: 0 0 12px;
      }
      .leaf {
        font-size: 28px;
        color: #087d16;
      }
      strong {
        display: block;
        font-size: 32px;
        color: #087d16;
      }
      small {
        font-size: 17px;
      }
      .quality {
        display: inline-block;
        background: #fff3d6;
        color: #704900;
        padding: 5px 9px;
        border-radius: 20px;
        font-size: 12px;
        margin: 12px 0;
      }
      .track {
        height: 7px;
        background: #e2e7e2;
        border-radius: 8px;
        overflow: hidden;
      }
      .track div {
        height: 100%;
        background: #087d16;
      }
      .note {
        margin: 12px 0 6px;
        font-size: 11px;
      }
      time {
        font-size: 11px;
        color: #526158;
      }
      .missing strong {
        color: #526158;
      }
    `,
  ],
})
export class SoilSensorCardComponent {
  readonly number = input.required<number>();
  readonly zone = input.required<string>();
  readonly value = input<number | null>(null);
  readonly quality = input<SensorHealth>('missing');
  readonly timestamp = input<string | null>(null);
  readonly stale = input(false);
}
