import { ApiProperty } from '@nestjs/swagger';
import type { ObservedIrrigationEvent } from '@cacaosmart/contracts';
import { ValveDto } from '../telemetry/telemetry.dto';

class ObservedIrrigationEventDto implements ObservedIrrigationEvent {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() eventId!: string;
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ format: 'uuid' }) deviceId!: string;
  @ApiProperty({ enum: ['real', 'demo'] }) source!: 'real' | 'demo';
  @ApiProperty({ format: 'date-time' }) observedAt!: string;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty({ enum: ['device', 'server'] }) timestampOrigin!: 'device' | 'server';
  @ApiProperty({ enum: ['initial', 'change'] }) kind!: 'initial' | 'change';
  @ApiProperty({ type: ValveDto }) valve!: ValveDto;
  @ApiProperty({ type: ValveDto, nullable: true }) previousValve!: ValveDto | null;
}

export class ObservedIrrigationPageDto {
  @ApiProperty({ type: [ObservedIrrigationEventDto] }) items!: ObservedIrrigationEventDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
