import { Component, effect, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { DeviceOfflineAlert, TelemetrySubscription } from '@cacaosmart/contracts';
import { OfflineAlertsFacade } from '../../core/alerts/offline-alerts.facade';

@Component({
  selector: 'app-offline-alerts-panel',
  standalone: true,
  imports: [DatePipe],
  providers: [OfflineAlertsFacade],
  template: `<div [attr.aria-busy]="alerts.busy()">
    <p class="note">Solo desconexión del dispositivo. No evalúa humedad ni controla el riego.</p>
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
            <p>
              Sin mensajes durante más de {{ alert.expectedIntervalSeconds * 5 }} s (5 intervalos de
              envío).
            </p>
            <p>Detectada {{ alert.detectedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            <p>
              Último contacto de ese episodio: {{ alert.lastSeenAt | date: 'dd/MM/yyyy HH:mm:ss' }}
            </p>
            @if (alert.closedAt) {
              <p>Cierre {{ alert.closedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</p>
            }
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
        <p class="note">Consultado {{ alerts.checkedAt() | date: 'HH:mm:ss' }} · hora local</p>
      }
    }
    @if (alerts.message()) {
      <p role="status">{{ alerts.message() }}</p>
    }
    <p class="note">
      Reconocer no significa recuperar el contacto. La ausencia de alertas no confirma conexión ni
      condiciones normales del cultivo.
    </p>
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      p {
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      .note {
        color: #526158;
        font-size: 11px;
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
        background: #fff3d6;
        border-color: #c49131;
      }
      li strong {
        display: block;
        color: #704900;
        font-size: 13px;
      }
      li p {
        margin: 6px 0;
      }
      .acknowledged {
        font-weight: 600;
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
      button:focus-visible {
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
