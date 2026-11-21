import { Component, computed, input, output } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { DataSource, SoilSensorId, TelemetryReading } from '@cacaosmart/contracts';
import {
  historyStates,
  ThresholdHistoryMap,
} from '../../core/sensor-thresholds/threshold-history.facade';

/** Use exactly the measurement domain and draw disconnected horizontal segments, never diagonals. */
export function thresholdLines(readings: TelemetryReading[], states: ThresholdHistoryMap) {
  if (!readings.length) return [];
  const times = readings.map((row) => Date.parse(row.recordedAt ?? row.receivedAt));
  const start = Math.min(...times),
    end = Math.max(...times);
  const span = end - start || 1;
  return (['soil_1', 'soil_2', 'soil_3'] as const).flatMap((code, index) => {
    const state = states[code];
    if (state.status !== 'ready') return [];
    return state.intervals.flatMap((interval) => {
      const range = interval.threshold;
      const from = Math.max(start, Date.parse(interval.from));
      const to = Math.min(start + span, Date.parse(interval.to));
      if (!range || from >= to) return [];
      return (['minValue', 'maxValue'] as const).map((bound) => ({
        code,
        zone: ['A', 'B', 'C'][index],
        version: range.version,
        bound: bound === 'minValue' ? 'min' : 'max',
        value: range[bound],
        label: bound === 'minValue' ? 'Mín.' : 'Máx.',
        x1: 45 + ((from - start) / span) * 620,
        x2: 45 + ((to - start) / span) * 620,
        y: 210 - range[bound] * 1.8,
        dash: bound === 'minValue' ? '10 5' : '2 4',
        color: ['#087d16', '#a45000', '#1263bd'][index],
      }));
    });
  });
}

export function chartSegments(
  readings: TelemetryReading[],
  code: SoilSensorId,
  maxGapMs: number,
): { path: string; points: { x: number; y: number }[] } {
  const rows = [...readings].reverse(); // REST descendente, incluye desempate estable.
  const times = rows.map((r) => Date.parse(r.recordedAt ?? r.receivedAt));
  const min = Math.min(...times),
    span = Math.max(...times) - min || 1;
  let path = '',
    continuous = false,
    previousTime = 0;
  const points: { x: number; y: number }[] = [];
  rows.forEach((row, i) => {
    const value = row.soilMoisture[code];
    if (value === null || row.quality[code] === 'invalid' || row.quality[code] === 'missing') {
      continuous = false;
      return;
    }
    const x = 45 + ((times[i] - min) / span) * 620,
      y = 210 - value * 1.8;
    if (times[i] - previousTime > maxGapMs) continuous = false;
    path += `${continuous ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
    continuous = true;
    previousTime = times[i];
    points.push({ x, y });
  });
  return { path, points };
}

@Component({
  selector: 'app-soil-history-chart',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `@if (!readings().length) {
      <p class="empty">Sin lecturas en este intervalo.</p>
    } @else {
      <svg
        viewBox="0 0 700 250"
        role="img"
        aria-label="Histórico de humedad por zona con mínimos y máximos según su vigencia. Valores y rangos exactos disponibles en las tablas inferiores."
      >
        @for (tick of [0, 25, 50, 75, 100]; track tick) {
          <line
            x1="45"
            x2="665"
            [attr.y1]="210 - tick * 1.8"
            [attr.y2]="210 - tick * 1.8"
            stroke="#e2e7e2"
          />
          <text x="8" [attr.y]="214 - tick * 1.8">{{ tick }} %</text>
        }
        @for (line of thresholdLines(); track $index) {
          <line
            data-threshold
            [attr.data-sensor]="line.code"
            [attr.data-version]="line.version"
            [attr.data-bound]="line.bound"
            [attr.x1]="line.x1"
            [attr.x2]="line.x2"
            [attr.y1]="line.y"
            [attr.y2]="line.y"
            [attr.stroke]="line.color"
            [attr.stroke-dasharray]="line.dash"
            stroke-width="1.5"
          >
            <title>
              Zona {{ line.zone }} · {{ line.label }} {{ line.value }} % · v{{ line.version }}
            </title>
          </line>
        }
        @for (series of series(); track series.code) {
          <path
            [attr.d]="series.path"
            fill="none"
            [attr.stroke]="series.color"
            [attr.stroke-dasharray]="series.dash"
            stroke-width="2.5"
          />
          @for (point of series.points; track $index) {
            <circle [attr.cx]="point.x" [attr.cy]="point.y" r="2.5" [attr.fill]="series.color" />
          }
        }
        <text x="45" y="240">{{ oldest() | date: 'dd/MM HH:mm' }}</text>
        <text x="665" y="240" text-anchor="end">{{ newest() | date: 'dd/MM HH:mm' }}</text>
      </svg>
      <div class="legend">
        <span>━ A · Sensor 1</span><span>┄ B · Sensor 2</span><span>┈ C · Sensor 3</span>
      </div>
      <p class="note">
        Hora local del navegador · {{ readings().length }} lecturas en esta página. Los huecos no se
        interpolan. Límites: trazos largos = mínimo; puntos = máximo, con el color de cada zona.
        Cada segmento respeta su vigencia; el rango actual no se aplica al pasado. Son referencias
        de monitoreo, no órdenes de riego ni prueba de calibración.
      </p>
      @if (source() === 'demo') {
        <p class="note">DEMO · Mediciones y rangos de demostración.</p>
      }
      <ul class="range-status" aria-label="Estado de rangos históricos" aria-live="polite">
        @for (sensor of rangeSensors; track sensor.code) {
          <li>Zona {{ sensor.zone }} · {{ historyLabel(sensor.code) }}</li>
        }
      </ul>
      @if (hasThresholdErrors()) {
        <button type="button" class="secondary" (click)="retryThresholds.emit()">
          Reintentar rangos históricos
        </button>
      }
      <details class="threshold-table">
        <summary>Ver vigencia y límites históricos</summary>
        <p class="note">
          Inicio incluido · fin excluido · hora local del navegador. Los límites no certifican
          calibración.
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Desde</th>
                <th>Hasta (excluido)</th>
                <th>Mín. (%)</th>
                <th>Máx. (%)</th>
                <th>Versión</th>
              </tr>
            </thead>
            <tbody>
              @for (sensor of rangeSensors; track sensor.code) {
                @if (thresholds()[sensor.code].status === 'ready') {
                  @for (interval of thresholds()[sensor.code].intervals; track $index) {
                    <tr>
                      <td>{{ sensor.zone }}</td>
                      <td>{{ interval.from | date: 'dd/MM/yyyy HH:mm:ss.SSS' }}</td>
                      <td>{{ interval.to | date: 'dd/MM/yyyy HH:mm:ss.SSS' }}</td>
                      @if (interval.threshold; as range) {
                        <td>{{ range.minValue | number: '1.0-2' }}</td>
                        <td>{{ range.maxValue | number: '1.0-2' }}</td>
                        <td>{{ range.version }}</td>
                      } @else {
                        <td colspan="3">Sin rango configurado</td>
                      }
                    </tr>
                  }
                } @else {
                  <tr>
                    <td>{{ sensor.zone }}</td>
                    <td colspan="5">{{ historyLabel(sensor.code) }}</td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </details>
      <details>
        <summary>Ver tabla de valores</summary>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>A (%)</th>
                <th>B (%)</th>
                <th>C (%)</th>
              </tr>
            </thead>
            <tbody>
              @for (row of readings(); track row.eventId) {
                <tr>
                  <td>{{ row.recordedAt ?? row.receivedAt | date: 'dd/MM HH:mm:ss' }}</td>
                  <td>
                    {{
                      row.soilMoisture.soil_1 === null
                        ? 'Sin datos'
                        : (row.soilMoisture.soil_1 | number: '1.0-1')
                    }}
                  </td>
                  <td>
                    {{
                      row.soilMoisture.soil_2 === null
                        ? 'Sin datos'
                        : (row.soilMoisture.soil_2 | number: '1.0-1')
                    }}
                  </td>
                  <td>
                    {{
                      row.soilMoisture.soil_3 === null
                        ? 'Sin datos'
                        : (row.soilMoisture.soil_3 | number: '1.0-1')
                    }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </details>
    }`,
  styles: [
    `
      svg {
        width: 100%;
        display: block;
      }
      text {
        font: 11px Arial;
        fill: #526158;
      }
      .legend {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        font-size: 12px;
        font-weight: bold;
      }
      .legend span:nth-child(1) {
        color: #087d16;
      }
      .legend span:nth-child(2) {
        color: #a45000;
      }
      .legend span:nth-child(3) {
        color: #1263bd;
      }
      .note,
      .empty {
        color: #526158;
        font-size: 12px;
        line-height: 1.6;
      }
      .range-status {
        padding-left: 18px;
        color: #526158;
        font-size: 12px;
        line-height: 1.6;
      }
      .empty {
        padding: 70px 15px;
        text-align: center;
      }
      summary {
        cursor: pointer;
        color: #087d16;
        font-size: 13px;
        margin: 16px 0;
      }
      .table-wrap {
        overflow: auto;
        max-height: 260px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        font-size: 12px;
      }
      th,
      td {
        text-align: left;
        border-bottom: 1px solid #e2e7e2;
        padding: 8px;
        white-space: nowrap;
      }
    `,
  ],
})
export class SoilHistoryChartComponent {
  readonly readings = input<TelemetryReading[]>([]);
  readonly intervalSeconds = input(60);
  readonly thresholds = input<ThresholdHistoryMap>(historyStates('idle'));
  readonly source = input<DataSource>('real');
  readonly retryThresholds = output<void>();
  readonly rangeSensors = [
    { code: 'soil_1', zone: 'A' },
    { code: 'soil_2', zone: 'B' },
    { code: 'soil_3', zone: 'C' },
  ] as const;
  readonly thresholdLines = computed(() => thresholdLines(this.readings(), this.thresholds()));
  readonly hasThresholdErrors = computed(() =>
    this.rangeSensors.some(({ code }) => this.thresholds()[code].status === 'error'),
  );
  historyLabel(code: SoilSensorId): string {
    const state = this.thresholds()[code];
    if (state.status !== 'ready')
      return {
        idle: 'Sin intervalo consultado',
        loading: 'Consultando rangos históricos…',
        error: 'Rangos históricos no disponibles',
        disabled: 'Sensor o dispositivo deshabilitado',
      }[state.status];
    const configured = state.intervals.filter((interval) => interval.threshold !== null).length;
    if (!configured) return 'Sin rango configurado en este periodo';
    return state.intervals.some((interval) => interval.threshold === null)
      ? 'Rangos por vigencia · hay periodos sin rango configurado'
      : 'Rangos por vigencia';
  }
  readonly oldest = computed(() => {
    const row = this.readings().at(-1);
    return row?.recordedAt ?? row?.receivedAt;
  });
  readonly newest = computed(() => {
    const row = this.readings()[0];
    return row?.recordedAt ?? row?.receivedAt;
  });
  readonly series = computed(() =>
    (['soil_1', 'soil_2', 'soil_3'] as const).map((code, i) => ({
      code,
      color: ['#087d16', '#b65b00', '#1263bd'][i],
      dash: ['', '8 4', '2 4'][i],
      ...chartSegments(this.readings(), code, this.intervalSeconds() * 2000),
    })),
  );
}
