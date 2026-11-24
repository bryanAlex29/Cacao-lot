import { Component, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { SoilMoistureAlert, TelemetrySubscription } from '@cacaosmart/contracts';
import { MoistureAlertsFacade } from '../../core/alerts/moisture-alerts.facade';
import { MoisturePolicyComponent } from './moisture-policy.component';
import type { ThresholdSensor } from '../../core/sensor-thresholds/sensor-thresholds.types';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-moisture-alerts-panel',
  standalone: true,
  imports: [DatePipe, MoisturePolicyComponent, IconComponent],
  host: { class: 'moisture' },
  providers: [MoistureAlertsFacade],
  template: `<section aria-label="Alertas de baja humedad" [attr.aria-busy]="alerts.busy()">
    <h3 class="alert-heading"><app-icon name="water" /> Baja humedad por sonda</h3>
    @if (selection()?.source === 'demo') {
      <p class="demo">DEMO · Alertas de demostración</p>
    }
    @if (selection(); as selected) {
      <details class="alert-settings">
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
            <p class="alert-time">
              Confirmada {{ alert.confirmedAt | date: 'dd/MM/yyyy HH:mm:ss' }} · detectada
              {{ alert.detectedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
            </p>
            <details class="alert-evidence">
              <summary>Evidencia de baja humedad</summary>
              <p>
                Tercera lectura: {{ alert.triggerValue }} % · mínimo {{ alert.minValue }} % ·
                recuperación ≥ {{ alert.minValue + alert.recoveryMarginPct }} %.
              </p>
              <p>
                Rango v{{ alert.thresholdVersion }} · margen v{{ alert.policyVersion }} del
                episodio.
              </p>
            </details>
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
        <p class="checked-at">
          Consultado {{ alerts.checkedAt() | date: 'HH:mm:ss' }} · hora local
        </p>
      }
    } @else {
      <p>Selecciona un dispositivo para consultar sus alertas de humedad.</p>
    }
    @if (alerts.message()) {
      <p role="status">{{ alerts.message() }}</p>
    }
    <p>Reconocer no significa recuperación de humedad.</p>
    <details class="alert-help">
      <summary>Reglas y límites de humedad</summary>
      <p>
        Activación: 3 lecturas consecutivas bajo el mínimo. Recuperación: 3 iguales o superiores al
        mínimo + margen. No controla el riego.
      </p>
      <p>
        Datos ausentes, inválidos o antiguos rompen las confirmaciones, pero no resuelven alertas.
        Los reales sin calibrar no cuentan. La ausencia de alertas no confirma salud del cultivo.
      </p>
    </details>
  </section>`,
  styleUrl: '../../shared/ui/alert-panel.css',
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
