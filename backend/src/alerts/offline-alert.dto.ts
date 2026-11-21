import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';
import type { DeviceOfflineAlert, OfflineAlertCloseReason, Page } from '@cacaosmart/contracts';
import { PageDto } from '../common/page.dto';

export class OfflineAlertQueryDto extends PageDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  deviceId!: string;
  @ApiPropertyOptional({ enum: ['real', 'demo'], default: 'real' })
  @IsIn(['real', 'demo'])
  source: 'real' | 'demo' = 'real';
}

export class OfflineAlertDto implements DeviceOfflineAlert {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) deviceId!: string;
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ enum: ['real', 'demo'] }) source!: 'real' | 'demo';
  @ApiProperty({ enum: ['DEVICE_OFFLINE'] }) type!: 'DEVICE_OFFLINE';
  @ApiProperty({ enum: ['warning'] }) severity!: 'warning';
  @ApiProperty({ format: 'date-time' }) lastSeenAt!: string;
  @ApiProperty({ minimum: 1 }) expectedIntervalSeconds!: number;
  @ApiProperty({
    format: 'date-time',
    description: 'Fecha de detección, no instante físico de desconexión.',
  })
  detectedAt!: string;
  @ApiProperty({ format: 'date-time', nullable: true }) closedAt!: string | null;
  @ApiProperty({
    nullable: true,
    enum: ['CONTACT_RESTORED', 'MONITORING_STOPPED', 'INTERVAL_CHANGED'],
  })
  closeReason!: OfflineAlertCloseReason | null;
  @ApiProperty({
    format: 'date-time',
    nullable: true,
    description: 'Reconocer no recupera el contacto ni cierra la condición.',
  })
  acknowledgedAt!: string | null;
}

export class OfflineAlertPageDto implements Page<DeviceOfflineAlert> {
  @ApiProperty({ type: [OfflineAlertDto] }) items!: OfflineAlertDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
