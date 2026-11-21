import { Component, computed, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import type { SoilSensorId, TelemetryReading } from '@cacaosmart/contracts';

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
        aria-label="Histórico de humedad por zona. Valores exactos disponibles en la tabla inferior."
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
        interpolan. Sin umbrales configurados.
      </p>
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
