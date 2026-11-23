import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { DataSource, MonitoredSensorCode, Page } from '@cacaosmart/contracts';

export interface RegisteredSensor {
  id: string;
  code: MonitoredSensorCode;
  variable: 'SOIL_MOISTURE' | 'TEMPERATURE' | 'AIR_HUMIDITY' | 'RAIN_DETECTED';
  unit: 'PERCENT' | 'CELSIUS' | 'BOOLEAN';
  zone: string | null;
  enabled: boolean;
}
export interface RegisteredDevice {
  id: string;
  plotId: string;
  serial: string;
  source: DataSource;
  status: 'ONLINE' | 'STALE' | 'OFFLINE' | 'UNKNOWN';
  isActive: boolean;
  expectedIntervalSeconds: number;
  lastSeenAt: string | null;
  createdAt: string;
  sensors: RegisteredSensor[];
}

const sensorTypes: Record<MonitoredSensorCode, readonly [string, string]> = {
  soil_1: ['SOIL_MOISTURE', 'PERCENT'],
  soil_2: ['SOIL_MOISTURE', 'PERCENT'],
  soil_3: ['SOIL_MOISTURE', 'PERCENT'],
  temperatureC: ['TEMPERATURE', 'CELSIUS'],
  airHumidityPct: ['AIR_HUMIDITY', 'PERCENT'],
  rainDetected: ['RAIN_DETECTED', 'BOOLEAN'],
};
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));

@Injectable({ providedIn: 'root' })
export class DevicesApi {
  private readonly http = inject(HttpClient);

  list(plotId: string, offset: number) {
    return this.http
      .get<Page<RegisteredDevice>>(`/api/v1/plots/${encodeURIComponent(plotId)}/devices`, {
        params: { limit: 10, offset },
      })
      .pipe(
        timeout(8000),
        map((page) => {
          if (
            !page ||
            !Array.isArray(page.items) ||
            !Number.isInteger(page.total) ||
            page.total < 0 ||
            page.limit !== 10 ||
            page.offset !== offset ||
            page.items.length > 10 ||
            page.items.length > page.total ||
            new Set(page.items.map((item) => item?.id)).size !== page.items.length ||
            page.items.some(
              (item) =>
                !item ||
                !text(item.id) ||
                item.plotId !== plotId ||
                !text(item.serial) ||
                !['real', 'demo'].includes(item.source) ||
                !['ONLINE', 'STALE', 'OFFLINE', 'UNKNOWN'].includes(item.status) ||
                typeof item.isActive !== 'boolean' ||
                !Number.isInteger(item.expectedIntervalSeconds) ||
                item.expectedIntervalSeconds < 1 ||
                item.expectedIntervalSeconds > 86400 ||
                !date(item.createdAt) ||
                (item.lastSeenAt !== null && !date(item.lastSeenAt)) ||
                !Array.isArray(item.sensors) ||
                new Set(item.sensors.map((sensor) => sensor?.id)).size !== item.sensors.length ||
                new Set(item.sensors.map((sensor) => sensor?.code)).size !== item.sensors.length ||
                item.sensors.some(
                  (sensor) =>
                    !sensor ||
                    !text(sensor.id) ||
                    !Object.hasOwn(sensorTypes, sensor.code) ||
                    sensorTypes[sensor.code][0] !== sensor.variable ||
                    sensorTypes[sensor.code][1] !== sensor.unit ||
                    (sensor.zone !== null && !text(sensor.zone)) ||
                    typeof sensor.enabled !== 'boolean',
                ),
            )
          ) {
            throw new Error('Inventario incompatible con la parcela');
          }
          // Keep only the public read model, never credential fields or unrelated response metadata.
          return {
            total: page.total,
            limit: page.limit,
            offset: page.offset,
            items: page.items.map((item) => ({
              id: item.id,
              plotId: item.plotId,
              serial: item.serial,
              source: item.source,
              status: item.status,
              isActive: item.isActive,
              expectedIntervalSeconds: item.expectedIntervalSeconds,
              lastSeenAt: item.lastSeenAt,
              createdAt: item.createdAt,
              sensors: item.sensors.map(({ id, code, variable, unit, zone, enabled }) => ({
                id,
                code,
                variable,
                unit,
                zone,
                enabled,
              })),
            })),
          };
        }),
      );
  }
}
