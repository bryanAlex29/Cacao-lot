import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  SensorThresholdResponse,
  SensorThresholdHistoryResponse,
} from '@cacaosmart/contracts';
import { SourcePolicy } from '../integrations/source-policy.service';
import { ThresholdRepository, OwnedSensor } from './threshold.repository';
import { PutSensorThresholdDto } from './threshold.dto';
import { quantitativeIdentity, validateThreshold } from './threshold.rules';
import { toThresholdRange } from './threshold.mapping';
import { thresholdIntervals } from './threshold-history';
import { ThresholdHistoryQueryDto } from './threshold-history.dto';

@Injectable()
export class ThresholdService {
  constructor(
    private readonly repository: ThresholdRepository,
    private readonly sources: SourcePolicy,
  ) {}
  private response(sensor: OwnedSensor): SensorThresholdResponse {
    return {
      sensorId: sensor.id,
      deviceId: sensor.deviceId,
      plotId: sensor.device.plotId,
      source: sensor.device.source,
      ...quantitativeIdentity(sensor),
      threshold: sensor.thresholds[0] ? toThresholdRange(sensor.thresholds[0]) : null,
    };
  }
  async get(id: string, ownerId: string): Promise<SensorThresholdResponse> {
    const sensor = await this.repository.get(id, ownerId);
    this.sources.require(sensor.device.source);
    return this.response(sensor);
  }
  async history(
    id: string,
    ownerId: string,
    query: ThresholdHistoryQueryDto,
  ): Promise<SensorThresholdHistoryResponse> {
    const from = new Date(query.from),
      to = new Date(query.to);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 31 * 86400000
    )
      throw new BadRequestException('Periodo inválido: inicio anterior al fin y máximo 31 días');
    const { sensor, before, changes, after } = await this.repository.history(
      id,
      ownerId,
      from,
      to,
      (owned) => {
        this.sources.require(owned.device.source);
        quantitativeIdentity(owned);
      },
    );
    const identity = {
      sensorId: sensor.id,
      deviceId: sensor.deviceId,
      plotId: sensor.device.plotId,
      source: sensor.device.source,
      ...quantitativeIdentity(sensor),
    };
    return {
      ...identity,
      from: from.toISOString(),
      to: to.toISOString(),
      intervals: thresholdIntervals(sensor, from, to, before, changes, after),
    };
  }
  async put(
    id: string,
    ownerId: string,
    input: PutSensorThresholdDto,
  ): Promise<SensorThresholdResponse> {
    const sensor = await this.repository.put(id, ownerId, input, (locked) => {
      this.sources.require(locked.device.source);
      validateThreshold(locked, input);
    });
    return this.response(sensor);
  }
}
