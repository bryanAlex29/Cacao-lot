import { BadRequestException } from '@nestjs/common';
import type { SensorUnit, SensorVariable } from '@prisma/client';
import type {
  PutSensorThresholdInput,
  ThresholdUnit,
  ThresholdVariable,
} from '@cacaosmart/contracts';

export function quantitativeIdentity(sensor: { variable: SensorVariable; unit: SensorUnit }): {
  variable: ThresholdVariable;
  unit: ThresholdUnit;
} {
  if (sensor.variable === 'TEMPERATURE' && sensor.unit === 'CELSIUS')
    return { variable: sensor.variable, unit: sensor.unit };
  if (
    (sensor.variable === 'SOIL_MOISTURE' || sensor.variable === 'AIR_HUMIDITY') &&
    sensor.unit === 'PERCENT'
  )
    return { variable: sensor.variable, unit: sensor.unit };
  throw new BadRequestException('Este sensor no admite rangos numéricos');
}

export function validateThreshold(
  sensor: { variable: SensorVariable; unit: SensorUnit },
  input: PutSensorThresholdInput,
): void {
  const identity = quantitativeIdentity(sensor);
  if (input.variable !== identity.variable || input.unit !== identity.unit)
    throw new BadRequestException('La variable y unidad deben coincidir con el sensor');
  const lower = identity.unit === 'PERCENT' ? 0 : -50;
  if (
    !Number.isFinite(input.minValue) ||
    !Number.isFinite(input.maxValue) ||
    input.minValue < lower ||
    input.maxValue > 100 ||
    input.minValue >= input.maxValue
  )
    throw new BadRequestException(`Rango inválido: ${lower} ≤ mínimo < máximo ≤ 100`);
}
