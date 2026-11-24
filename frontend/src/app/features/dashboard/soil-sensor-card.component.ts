import { Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { DataSource, SensorHealth, SoilSensorId } from '@cacaosmart/contracts';
import { SensorRangeComponent } from './sensor-range.component';
import type { SensorRangeState } from '../../core/sensor-thresholds/sensor-thresholds.types';
import { assessSensor } from '../../core/sensor-thresholds/sensor-assessment';
import { SensorAssessmentComponent } from './sensor-assessment.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-soil-sensor-card',
  standalone: true,
  imports: [DatePipe, DecimalPipe, SensorRangeComponent, SensorAssessmentComponent, IconComponent],
  template: `<article [class.missing]="assessment().value === null">
    <span class="leaf"><app-icon name="leaf" /></span>
    <h3>Sensor {{ number() }}</h3>
    <p>Zona {{ zone() }}</p>
    <strong
      >{{ assessment().value === null ? '—' : (assessment().value | number: '1.0-1')
      }}<small> %</small></strong
    >
    <app-sensor-assessment [assessment]="assessment()" />
    <div class="track" aria-hidden="true">
      <div
        [style.width.%]="assessment().value ?? 0"
        [style.background]="assessment().barColor"
      ></div>
    </div>
    <app-sensor-range [state]="range()" [canEdit]="canEdit()" (configure)="configure.emit()" />
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
  readonly code = input.required<SoilSensorId>();
  readonly source = input.required<DataSource>();
  readonly canEdit = input(false);
  readonly configure = output<void>();
  readonly number = input.required<number>();
  readonly zone = input.required<string>();
  readonly value = input<number | null>(null);
  readonly quality = input<SensorHealth>('missing');
  readonly timestamp = input<string | null>(null);
  readonly stale = input(false);
  readonly range = input.required<SensorRangeState>();
  readonly assessment = computed(() =>
    assessSensor({
      code: this.code(),
      source: this.source(),
      value: this.value(),
      quality: this.quality(),
      stale: this.stale(),
      range: this.range(),
    }),
  );
}
