import { Component, input } from '@angular/core';
import type { SensorAssessment } from '../../core/sensor-thresholds/sensor-assessment';

@Component({
  selector: 'app-sensor-assessment',
  standalone: true,
  template: `<div class="assessment" [attr.data-comparison]="assessment().comparison">
    <span
      class="quality"
      [class.warning]="assessment().qualityLabel === 'Sin calibrar'"
      [class.danger]="assessment().comparison === 'invalid'"
      >{{ assessment().qualityLabel }}</span
    >
    @if (assessment().comparison !== 'missing' && assessment().comparison !== 'invalid') {
      <span class="comparison" [class]="'comparison ' + assessment().tone">
        <span aria-hidden="true">{{ assessment().icon }}</span> {{ assessment().label }}
      </span>
    }
    @if (assessment().note) {
      <small>{{ assessment().note }}</small>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .assessment {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin: 12px 0;
      }
      .quality,
      .comparison {
        display: inline-block;
        border-radius: 20px;
        padding: 5px 8px;
        font-size: 12px;
        line-height: 1.4;
      }
      .quality,
      .neutral {
        color: #385141;
        background: #edf3ed;
      }
      .comparison {
        font-weight: 700;
      }
      .warning {
        background: #fff3d6;
        color: #704900;
      }
      .danger {
        background: #fde5e5;
        color: #8b2020;
      }
      .within {
        background: var(--green-soft);
        color: #165a23;
      }
      .demo {
        background: #dceff7;
        color: #114f70;
      }
      small {
        flex-basis: 100%;
        color: var(--muted);
        font-size: 11px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class SensorAssessmentComponent {
  readonly assessment = input.required<SensorAssessment>();
}
