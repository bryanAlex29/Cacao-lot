import { Component, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { DeviceOfflineAlert, TelemetrySubscription } from '@cacaosmart/contracts';
import { OfflineAlertsFacade } from '../../core/alerts/offline-alerts.facade';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-offline-alerts-panel',
  standalone: true,
  imports: [DatePipe, IconComponent],
  providers: [OfflineAlertsFacade],
  template: `<div [attr.aria-busy]="alerts.busy()">
    <h3 class="alert-heading"><app-icon name="monitor" /> Conexión del dispositivo</h3>
    @if (selection()?.source === 'demo') {
      <p class="demo">DEMO · Alertas de demostración</p>
    }
    @if (!selection()) {
      <p>Selecciona un dispositivo para consultar sus alertas.</p>
    } @else {
      <button
        type="button"
        class="secondary"
        [disabled]="alerts.busy() || alerts.writing()"
        (click)="alerts.reload()"
      >
        Actualizar alertas
      </button>
      @if (alerts.error()) {
        <p role="alert">{{ alerts.error() }}</p>
      } @else if (alerts.busy() && !alerts.checkedAt()) {
        <p role="status">Consultando alertas…</p>
      } @else if (!alerts.page().items.length) {
        <p>Sin alertas de desconexión registradas para este dispositivo.</p>
      }
      <ul>
        @for (alert of alerts.page().items; track alert.id) {
          <li [class.active]="!alert.closedAt" [attr.data-alert-id]="alert.id">
            <strong
              ><span aria-hidden="true">{{ alert.closedAt ? '◷' : '⚠' }}</span>
              {{ conditionLabel(alert) }}</strong
            >
            <p class="alert-time">Detectada {{ alert.detectedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            @if (alert.closedAt) {
              <p>Cierre {{ alert.closedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            }
            <details class="alert-evidence">
              <summary>Evidencia de la desconexión</summary>
              <p>
                Sin mensajes durante más de {{ alert.expectedIntervalSeconds * 5 }} s (5 intervalos
                de envío).
              </p>
              <p>
                Último contacto de ese episodio:
                {{ alert.lastSeenAt | date: 'dd/MM/yyyy HH:mm:ss' }}
              </p>
            </details>
            @if (alert.acknowledgedAt) {
              <p class="acknowledged">
                Reconocida {{ alert.acknowledgedAt | date: 'dd/MM/yyyy HH:mm:ss' }}
              </p>
            } @else {
              <p>Pendiente de reconocimiento</p>
              <button
                type="button"
                class="secondary"
                [disabled]="
                  alerts.writing() || alerts.busy() || alerts.uncertain() || !!alerts.error()
                "
                (click)="alerts.acknowledge(alert.id)"
              >
                Reconocer alerta
              </button>
            }
          </li>
        }
      </ul>
      @if (alerts.page().total > alerts.page().limit) {
        <div class="pages">
          <button
            type="button"
            class="secondary"
            [disabled]="alerts.busy() || !alerts.page().offset"
            (click)="alerts.changePage(alerts.page().offset - alerts.page().limit)"
          >
            Alertas recientes
          </button>
          <span
            >{{ alerts.page().total }} alertas · página
            {{ alerts.page().offset / alerts.page().limit + 1 }}</span
          >
          <button
            type="button"
            class="secondary"
            [disabled]="
              alerts.busy() || alerts.page().offset + alerts.page().limit >= alerts.page().total
            "
            (click)="alerts.changePage(alerts.page().offset + alerts.page().limit)"
          >
            Alertas anteriores
          </button>
        </div>
      }
      @if (alerts.checkedAt()) {
        <p class="checked-at">
          Consultado {{ alerts.checkedAt() | date: 'HH:mm:ss' }} · hora local
        </p>
      }
    }
    @if (alerts.message()) {
      <p role="status">{{ alerts.message() }}</p>
    }
    <p class="note">Reconocer no significa recuperar el contacto.</p>
    <details class="alert-help">
      <summary>Alcance de estas alertas</summary>
      <p>Solo desconexión del dispositivo. No evalúa humedad ni controla el riego.</p>
      <p>La ausencia de alertas no confirma conexión ni condiciones normales del cultivo.</p>
    </details>
  </div>`,
  styleUrl: '../../shared/ui/alert-panel.css',
})
export class OfflineAlertsPanelComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  readonly alerts = inject(OfflineAlertsFacade);
  constructor() {
    effect(() => this.alerts.select(this.selection()));
  }
  conditionLabel(alert: DeviceOfflineAlert): string {
    if (!alert.closedAt) return 'Desconexión detectada · condición activa';
    return {
      CONTACT_RESTORED: 'Contacto restablecido',
      MONITORING_STOPPED: 'Cerrada al deshabilitar monitoreo',
      INTERVAL_CHANGED: 'Cerrada por cambio de intervalo',
    }[alert.closeReason!];
  }
}
