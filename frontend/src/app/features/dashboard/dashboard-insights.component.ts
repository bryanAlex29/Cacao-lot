import { Component, input } from '@angular/core';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { OfflineAlertsPanelComponent } from './offline-alerts-panel.component';
import { MoistureAlertsPanelComponent } from './moisture-alerts-panel.component';
import type { ThresholdSensor } from '../../core/sensor-thresholds/sensor-thresholds.types';
import { IconComponent } from '../../shared/ui/icon.component';
import { WaterConsumptionExampleComponent } from './water-consumption-example.component';

@Component({
  selector: 'app-dashboard-insights',
  standalone: true,
  imports: [
    OfflineAlertsPanelComponent,
    MoistureAlertsPanelComponent,
    IconComponent,
    WaterConsumptionExampleComponent,
  ],
  template: `<div class="top">
      <section class="water">
        <h2><app-icon name="water" /> Agua y consumo</h2>
        <app-water-consumption-example [selection]="selection()" />
      </section>
      <section class="alerts" id="alerts" tabindex="-1">
        <h2><app-icon name="alert" /> Alertas</h2>
        <app-offline-alerts-panel [selection]="selection()" />
        <app-moisture-alerts-panel [selection]="selection()" [sensors]="sensors()" />
      </section>
    </div>
    <section class="ods">
      <h2>Compromiso con el territorio</h2>
      <div>
        <article><b>6</b><span>Agua limpia y saneamiento</span></article>
        <article><b>12</b><span>Producción y consumo responsables</span></article>
        <article><b>13</b><span>Acción por el clima</span></article>
      </div>
      <p class="note">Objetivos de diseño; no resultados de impacto medidos.</p>
    </section>`,
  styles: [
    `
      :host {
        display: grid;
        gap: 14px;
        min-width: 0;
        align-content: start;
      }
      section {
        background: white;
        border: 1px solid var(--border);
        border-radius: var(--radius-card);
        box-shadow: var(--shadow-card);
        padding: 20px;
        min-width: 0;
      }
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 17px;
        margin: 0 0 18px;
      }
      .top {
        display: grid;
        grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
        align-items: start;
        gap: 14px;
      }
      h2 app-icon {
        color: var(--green);
      }
      .note {
        font-size: 11px;
        color: var(--muted);
        line-height: 1.7;
      }
      .alerts p {
        font-size: 13px;
        color: #526158;
      }
      .ods > div {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .ods article {
        border-radius: 8px;
        color: white;
        background: #086b80;
        padding: 12px 10px;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .ods article:nth-child(2) {
        background: #9c5b08;
      }
      .ods article:nth-child(3) {
        background: #267135;
      }
      .ods b {
        font-size: 29px;
      }
      .ods span {
        font-size: 10px;
        line-height: 1.5;
      }
      @media (max-width: 1250px) {
        section {
          padding: 16px;
        }
      }
      @media (max-width: 620px) {
        section {
          padding: 14px;
        }
        .top {
          grid-template-columns: 1fr;
        }
        .ods article {
          display: block;
        }
        .ods span {
          display: block;
        }
      }
    `,
  ],
})
export class DashboardInsightsComponent {
  readonly sensors = input<ThresholdSensor[]>([]);
  readonly selection = input<TelemetrySubscription | null>(null);
}
