import { Component, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { SoilMoistureAlert, TelemetrySubscription } from '@cacaosmart/contracts';
import { MoistureAlertsFacade } from '../../core/alerts/moisture-alerts.facade';
import { MoisturePolicyComponent } from './moisture-policy.component';
import type { ThresholdSensor } from '../../core/sensor-thresholds/sensor-thresholds.types';

@Component({
  selector: 'app-moisture-alerts-panel',
  standalone: true,
  imports: [DatePipe, MoisturePolicyComponent],
  providers: [MoistureAlertsFacade],
  template: `<section aria-label="Alertas de baja humedad" [attr.aria-busy]="alerts.busy()">
    <h3>Baja humedad por sonda</h3>
    <p>
      Activación: 3 lecturas consecutivas bajo el mínimo. Recuperación: 3 iguales o superiores al
      mínimo + margen. No controla el riego.
    </p>
    @if (selection()?.source === 'demo') {
      <p class="demo">DEMO · Alertas de demostración</p>
    }
    @if (selection(); as selected) {
      <details>
        <summary>Configuración de alertas A/B/C</summary>
        @for (sensor of sensors(); track sensor.id) {
          @if (sensor.code === 'soil_1' || sensor.code === 'soil_2' || sensor.code === 'soil_3') {
            <app-moisture-policy
              [selection]="selected"
              [sensorId]="sensor.id"
              [label]="zone(sensor.code)"
            />
          }
        }
      </details>
      <button
        type="button"
        [disabled]="alerts.busy() || alerts.writing()"
        (click)="alerts.reload()"
      >
        Actualizar alertas de humedad
      </button>
      @if (alerts.error()) {
        <p role="alert">{{ alerts.error() }}</p>
      } @else if (alerts.busy() && !alerts.checkedAt()) {
        <p role="status">Consultando alertas de humedad…</p>
      } @else if (!alerts.page().items.length) {
        <p>Sin alertas de baja humedad registradas para este dispositivo.</p>
      }
      <ul>
        @for (alert of alerts.page().items; track alert.id) {
          <li [class.active]="!alert.closedAt" [attr.data-moisture-alert-id]="alert.id">
            <strong>{{ zone(alert.code) }} · {{ conditionLabel(alert) }}</strong>
            <p>
              Tercera lectura: {{ alert.triggerValue }} % · mínimo {{ alert.minValue }} % ·
              recuperación ≥ {{ alert.minValue + alert.recoveryMarginPct }} %.
            </p>
            <p>
              Confirmada {{ alert.confirmedAt | date: 'dd/MM/yyyy HH:mm:ss' }} · detectada
              {{ alert.detectedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
            </p>
            <p>
              Rango v{{ alert.thresholdVersion }} · margen v{{ alert.policyVersion }} del episodio.
            </p>
            @if (alert.closedAt) {
              <p>Cierre {{ alert.closedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            }
            @if (alert.acknowledgedAt) {
              <p>Reconocida {{ alert.acknowledgedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            } @else {
              <p>Pendiente de reconocimiento</p>
              <button
                type="button"
                [disabled]="
                  alerts.busy() || alerts.writing() || alerts.uncertain() || !!alerts.error()
                "
                (click)="alerts.acknowledge(alert.id)"
              >
                Reconocer alerta de humedad
              </button>
            }
          </li>
        }
      </ul>
      @if (alerts.page().total > alerts.page().limit) {
        <div class="pages">
          <button
            type="button"
            [disabled]="alerts.busy() || !alerts.page().offset"
            (click)="alerts.changePage(alerts.page().offset - alerts.page().limit)"
          >
            Humedad reciente
          </button>
          <span
            >{{ alerts.page().total }} alertas · página
            {{ alerts.page().offset / alerts.page().limit + 1 }}</span
          >
          <button
            type="button"
            [disabled]="
              alerts.busy() || alerts.page().offset + alerts.page().limit >= alerts.page().total
            "
            (click)="alerts.changePage(alerts.page().offset + alerts.page().limit)"
          >
            Humedad anterior
          </button>
        </div>
      }
      @if (alerts.checkedAt()) {
        <p>Consultado {{ alerts.checkedAt() | date: 'HH:mm:ss' }} · hora local</p>
      }
    } @else {
      <p>Selecciona un dispositivo para consultar sus alertas de humedad.</p>
    }
    @if (alerts.message()) {
      <p role="status">{{ alerts.message() }}</p>
    }
    <p>
      Datos ausentes, inválidos o antiguos rompen las confirmaciones, pero no resuelven alertas. Los
      reales sin calibrar no cuentan. La ausencia de alertas no confirma salud del cultivo.
    </p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        border-top: 1px solid #d9e2db;
        margin-top: 18px;
        padding-top: 12px;
      }
      h3 {
        font-size: 16px;
      }
      p,
      summary {
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      summary {
        cursor: pointer;
        padding: 8px;
      }
      .demo {
        background: #dceff7;
        color: #114f70;
        padding: 8px;
        border-radius: 8px;
      }
      ul {
        list-style: none;
        padding: 0;
      }
      li {
        border: 1px solid #d9e2db;
        border-radius: 10px;
        padding: 10px;
        margin: 12px 0;
        background: #f5f7f5;
      }
      li.active {
        background: #fde5e5;
        border-color: #b75959;
      }
      strong {
        font-size: 13px;
      }
      li p {
        margin: 6px 0;
      }
      button {
        font-size: 12px;
        min-height: 36px;
        max-width: 100%;
        white-space: normal;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        padding: 8px 11px;
        color: #17632e;
        background: white;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      :is(button, summary):focus-visible {
        outline: 3px solid #1263bd;
        outline-offset: 2px;
      }
      .pages {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        font-size: 11px;
      }
    `,
  ],
})
export class MoistureAlertsPanelComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  readonly sensors = input<ThresholdSensor[]>([]);
  readonly alerts = inject(MoistureAlertsFacade);
  constructor() {
    effect(() => this.alerts.select(this.selection()));
  }
  zone(code: string): string {
    return (
      (
        {
          soil_1: 'Sensor 1 · Zona A',
          soil_2: 'Sensor 2 · Zona B',
          soil_3: 'Sensor 3 · Zona C',
        } as Record<string, string>
      )[code] ?? code
    );
  }
  conditionLabel(alert: SoilMoistureAlert): string {
    if (!alert.closedAt) return 'Baja humedad · condición activa';
    return {
      RECOVERED: 'Humedad recuperada',
      CONFIGURATION_CHANGED: 'Cerrada por configuración modificada',
      MONITORING_STOPPED: 'Cerrada al deshabilitar monitoreo',
    }[alert.closeReason!];
  }
}
