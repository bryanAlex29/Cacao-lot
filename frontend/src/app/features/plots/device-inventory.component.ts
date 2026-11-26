import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { DeviceManagementComponent } from './device-management.component';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  DevicesApi,
  RegisteredDevice,
  RegisteredSensor,
} from '../../core/devices/devices-api.service';

@Component({
  selector: 'app-device-inventory',
  standalone: true,
  imports: [DatePipe, DeviceManagementComponent, IconComponent],
  template: `<section
    [attr.aria-labelledby]="'inventory-title-' + plotId()"
    [attr.aria-busy]="busy()"
  >
    <div class="heading">
      <h4 [id]="'inventory-title-' + plotId()">
        <app-icon name="monitor" /> Dispositivos y sensores
      </h4>
      <button type="button" (click)="load(offset())" [disabled]="busy() || management()?.busy()">
        Actualizar dispositivos
      </button>
    </div>
    <p>
      Inventario de esta parcela. No permite asignar equipos a otras cuentas ni controlar la
      válvula.
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
          <h5><app-icon name="monitor" /> {{ device.serial }}</h5>
          <p class="source" [class.demo]="device.source === 'demo'">
            {{
              device.source === 'demo'
                ? 'DEMO · Equipo de demostración'
                : 'REAL · Equipo registrado para datos reales'
            }}
          </p>
          <dl class="device-meta">
            <div>
              <dt>Habilitación</dt>
              <dd>
                <span class="state-chip">{{
                  device.isActive ? 'Habilitado' : 'Deshabilitado'
                }}</span>
              </dd>
            </div>
            <div>
              <dt>Conexión al consultar</dt>
              <dd>
                <span
                  class="state-chip"
                  [class.recent]="
                    device.isActive && device.status === 'ONLINE' && !!device.lastSeenAt
                  "
                  >{{ connection(device) }}</span
                >
              </dd>
            </div>
            <div>
              <dt>Último contacto</dt>
              <dd>
                {{
                  device.lastSeenAt
                    ? (device.lastSeenAt | date: 'dd/MM/yyyy HH:mm:ss')
                    : 'Sin contacto registrado'
                }}
              </dd>
            </div>
            <div>
              <dt>Intervalo esperado</dt>
              <dd>{{ device.expectedIntervalSeconds }} segundos</dd>
            </div>
          </dl>
          <details class="sensors">
            <summary>Sensores registrados · {{ device.sensors.length }}</summary>
            <div class="sensor-grid">
              @for (sensor of device.sensors; track sensor.id) {
                <p class="sensor">
                  <strong>{{ sensorName(sensor) }}</strong> · {{ unit(sensor) }} ·
                  {{ sensor.enabled ? 'Habilitado' : 'Deshabilitado' }}<br />Zona:
                  {{ sensor.zone ?? 'Sin zona registrada' }} · Código: {{ sensor.code }}
                </p>
              } @empty {
                <p>Sin sensores registrados. No se completa el inventario con datos de ejemplo.</p>
              }
            </div>
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
    @if (canManage()) {
      <app-device-management
        [plotId]="plotId()"
        [devices]="devices()"
        [inventoryRevision]="revision()"
        [inventoryBusy]="busy()"
        (changed)="load(offset())"
      />
    }
    <p>
      Habilitado no significa conectado. El inventario no acredita instalación física, calibración
      ni calidad de las lecturas. La lista no permite recuperar claves IoT existentes.
    </p>
  </section>`,
  styleUrl: './device-inventory.component.css',
})
export class DeviceInventoryComponent {
  readonly plotId = input.required<string>();
  readonly canManage = input(false);
  private readonly api = inject(DevicesApi);
  private request = new Subscription();
  readonly devices = signal<RegisteredDevice[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly checkedAt = signal<string | null>(null);
  readonly revision = signal(0);
  readonly management = viewChild(DeviceManagementComponent);

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
    if (this.management()?.plotId() === plotId && this.management()?.busy()) return;
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
        this.revision.update((value) => value + 1);
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
