import type {
  SensorThresholdRange,
  SoilSensorId,
  ThresholdUnit,
  ThresholdVariable,
  TelemetrySubscription,
} from '@cacaosmart/contracts';

export type QuantitativeSensorCode = SoilSensorId | 'temperatureC' | 'airHumidityPct';
export const quantitativeSensors: Record<
  QuantitativeSensorCode,
  { variable: ThresholdVariable; unit: ThresholdUnit }
> = {
  soil_1: { variable: 'SOIL_MOISTURE', unit: 'PERCENT' },
  soil_2: { variable: 'SOIL_MOISTURE', unit: 'PERCENT' },
  soil_3: { variable: 'SOIL_MOISTURE', unit: 'PERCENT' },
  temperatureC: { variable: 'TEMPERATURE', unit: 'CELSIUS' },
  airHumidityPct: { variable: 'AIR_HUMIDITY', unit: 'PERCENT' },
};

/** Authorized inventory returned by the existing device endpoints, not inferred from readings. */
export interface ThresholdSensor {
  id: string;
  code: string;
  variable: string;
  unit: string;
  enabled: boolean;
}

export interface SensorRangeState {
  status: 'unselected' | 'loading' | 'configured' | 'unconfigured' | 'disabled' | 'error';
  range: SensorThresholdRange | null;
  unit: ThresholdUnit | null;
  checkedAt: string | null;
}

export type SensorRangeMap = Record<QuantitativeSensorCode, SensorRangeState>;

export interface SensorRangeEditTarget {
  code: QuantitativeSensorCode;
  label: string;
  selection: TelemetrySubscription;
  sensor: ThresholdSensor;
  range: SensorThresholdRange | null;
}

export function rangeStates(status: SensorRangeState['status']): SensorRangeMap {
  return Object.fromEntries(
    Object.keys(quantitativeSensors).map((code) => [
      code,
      {
        status,
        range: null,
        unit: null,
        checkedAt: null,
      },
    ]),
  ) as SensorRangeMap;
}
