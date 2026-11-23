import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import {
  DevicesApi,
  RegisteredDevice,
  RegisteredSensor,
} from '../../core/devices/devices-api.service';

@Component({
  selector: 'app-device-inventory',
  standalone: true,
  imports: [DatePipe],
  template: `<section
    [attr.aria-labelledby]="'inventory-title-' + plotId()"
    [attr.aria-busy]="busy()"
  >
    <div class="heading">
      <h4 [id]="'inventory-title-' + plotId()">Dispositivos y sensores</h4>
      <button type="button" (click)="load(offset())" [disabled]="busy()">
        Actualizar dispositivos
      </button>
    </div>
    <p>
      Inventario de esta parcela, solo lectura. No permite asignar equipos ni controlar la válvula.
    </p>
    @if (busy()) {
      <p role="status">Consultando dispositivos…</p>
    } @else if (error()) {
      <p role="alert">{{ error() }}</p>
      <button type="button" (click)="load(offset())">Reintentar dispositivos</button>
    } @else if (checkedAt()) {
      <p role="status">
        {{ total() }} dispositivos registrados. Consultado
        {{ checkedAt() | date: 'dd/MM/yyyy HH:mm:ss' }} · hora local del navegador. Estado al
        consultar, no actualización en vivo.
      </p>
      @if (!devices().length) {
        <p>
          {{
            total() === 0
              ? 'Esta parcela no tiene dispositivos registrados.'
              : 'No hay dispositivos en esta página. Vuelve a la página anterior.'
          }}
          No se crean equipos ni lecturas de ejemplo.
        </p>
      }
      @for (device of devices(); track device.id) {
        <div class="device" [attr.data-device-id]="device.id">
          <h5>{{ device.serial }}</h5>
          <p class="source" [class.demo]="device.source === 'demo'">
            {{
              device.source === 'demo'
                ? 'DEMO · Equipo de demostración'
                : 'REAL · Equipo registrado para datos reales'
            }}
          </p>
          <dl>
            <dt>Habilitación</dt>
            <dd>{{ device.isActive ? 'Habilitado' : 'Deshabilitado' }}</dd>
            <dt>Conexión al consultar</dt>
            <dd>{{ connection(device) }}</dd>
            <dt>Último contacto</dt>
            <dd>
              {{
                device.lastSeenAt
                  ? (device.lastSeenAt | date: 'dd/MM/yyyy HH:mm:ss')
                  : 'Sin contacto registrado'
              }}
            </dd>
            <dt>Intervalo esperado</dt>
            <dd>{{ device.expectedIntervalSeconds }} segundos</dd>
          </dl>
          <details>
            <summary>Sensores registrados · {{ device.sensors.length }}</summary>
            @for (sensor of device.sensors; track sensor.id) {
              <p class="sensor">
                <strong>{{ sensorName(sensor) }}</strong> · {{ unit(sensor) }} ·
                {{ sensor.enabled ? 'Habilitado' : 'Deshabilitado' }}<br />Zona:
                {{ sensor.zone ?? 'Sin zona registrada' }} · Código: {{ sensor.code }}
              </p>
            } @empty {
              <p>Sin sensores registrados. No se completa el inventario con datos de ejemplo.</p>
            }
          </details>
        </div>
      }
      <div class="pagination">
        <button type="button" (click)="load(offset() - 10)" [disabled]="busy() || offset() === 0">
          Dispositivos anteriores
        </button>
        <span>Página {{ offset() / 10 + 1 }}</span>
        <button
          type="button"
          (click)="load(offset() + 10)"
          [disabled]="busy() || offset() + 10 >= total()"
        >
          Dispositivos siguientes
        </button>
      </div>
    }
    <p>
      Habilitado no significa conectado. El inventario no acredita instalación física, calibración
      ni calidad de las lecturas. No muestra claves IoT.
    </p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        margin-top: 16px;
      }
      section {
        border-top: 1px solid #e2e7e2;
        padding-top: 16px;
      }
      .heading,
      .pagination {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
      h4,
      h5 {
        font-size: 16px;
        margin: 0;
        color: #174b2d;
        overflow-wrap: anywhere;
      }
      p,
      dl,
      summary,
      .pagination {
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      p {
        color: #526158;
      }
      .device {
        border: 1px solid #e2e7e2;
        border-radius: 10px;
        padding: 12px;
        margin: 12px 0;
      }
      dl {
        margin: 12px 0;
      }
      dt {
        font-weight: bold;
      }
      dd {
        margin: 0 0 8px;
      }
      .source {
        background: #e8f7e6;
        color: #174b2d;
        padding: 8px;
      }
      .demo {
        background: #dceff7;
        color: #114f70;
      }
      .sensor {
        border-top: 1px solid #e2e7e2;
        padding-top: 8px;
      }
      button {
        min-height: 44px;
        max-width: 100%;
        padding: 8px 10px;
        color: #17632e;
        background: white;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      summary {
        cursor: pointer;
        padding: 10px 0;
      }
      button:focus-visible,
      summary:focus-visible {
        outline: 3px solid #1263bd;
        outline-offset: 2px;
      }
      [role='alert'] {
        color: #8b2020;
      }
    `,
  ],
})
export class DeviceInventoryComponent {
  readonly plotId = input.required<string>();
  private readonly api = inject(DevicesApi);
  private request = new Subscription();
  readonly devices = signal<RegisteredDevice[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly checkedAt = signal<string | null>(null);

  constructor() {
    effect(() => {
      const plotId = this.plotId();
      untracked(() => {
        this.offset.set(0);
        this.total.set(0);
        this.load(0, plotId);
      });
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }
  load(offset: number, plotId = this.plotId()): void {
    if (!plotId || !Number.isInteger(offset) || offset < 0) return;
    this.request.unsubscribe();
    this.devices.set([]);
    this.checkedAt.set(null);
    this.error.set('');
    this.busy.set(true);
    this.offset.set(offset);
    this.request = this.api.list(plotId, offset).subscribe({
      next: (page) => {
        this.devices.set(page.items);
        this.total.set(page.total);
        this.offset.set(page.offset);
        this.busy.set(false);
        this.checkedAt.set(new Date().toISOString());
      },
      error: (error: unknown) => {
        this.total.set(0);
        this.busy.set(false);
        this.error.set(
          error instanceof HttpErrorResponse && [403, 404].includes(error.status)
            ? 'Inventario no disponible para esta parcela o cuenta.'
            : 'No se pudieron consultar los dispositivos. No se muestran datos de ejemplo.',
        );
      },
    });
  }
  connection(device: RegisteredDevice): string {
    if (!device.isActive) return 'Deshabilitado para recepción';
    return {
      ONLINE: 'Contacto reciente',
      STALE: 'Contacto desactualizado',
      OFFLINE: 'Sin contacto reciente',
      UNKNOWN: 'Sin contacto registrado',
    }[device.status];
  }
  sensorName(sensor: RegisteredSensor): string {
    return {
      soil_1: 'Humedad del suelo · Sensor 1',
      soil_2: 'Humedad del suelo · Sensor 2',
      soil_3: 'Humedad del suelo · Sensor 3',
      temperatureC: 'Temperatura ambiental',
      airHumidityPct: 'Humedad ambiental',
      rainDetected: 'Detección de lluvia',
    }[sensor.code];
  }
  unit(sensor: RegisteredSensor): string {
    return { PERCENT: '%', CELSIUS: '°C', BOOLEAN: 'Sí/no (no precipitación en mm)' }[sensor.unit];
  }
}
