import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsString, Matches, IsIn, IsInt, Min, Max } from 'class-validator';
import { DeviceStatus, SensorCode, SensorUnit, SensorVariable } from '@prisma/client';
import { trimText } from '../users/user.dto';

export class CreateDeviceDto {
  @ApiPropertyOptional({ enum: ['real', 'demo'], default: 'real' })
  @IsIn(['real', 'demo'])
  source: 'real' | 'demo' = 'real';

  @ApiPropertyOptional({ minimum: 1, maximum: 86400, default: 60 })
  @IsInt()
  @Min(1)
  @Max(86400)
  expectedIntervalSeconds = 60;

  @ApiProperty({ minLength: 3, maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @Matches(/^[a-zA-Z0-9._:-]{3,100}$/)
  serial!: string;
}

export class UpdateDeviceDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class SensorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: SensorCode })
  code!: SensorCode;
  @ApiProperty({ enum: SensorVariable })
  variable!: SensorVariable;
  @ApiProperty({ enum: SensorUnit })
  unit!: SensorUnit;
  @ApiProperty({ type: String, nullable: true })
  zone!: string | null;
  @ApiProperty()
  enabled!: boolean;
}

export class DeviceResponseDto {
  @ApiProperty({ enum: ['real', 'demo'] })
  source!: 'real' | 'demo';
  @ApiProperty()
  expectedIntervalSeconds!: number;
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  plotId!: string;
  @ApiProperty()
  serial!: string;
  @ApiProperty({ enum: DeviceStatus })
  status!: DeviceStatus;
  @ApiProperty()
  isActive!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true, format: 'date-time' })
  lastSeenAt!: Date | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: [SensorResponseDto] })
  sensors!: SensorResponseDto[];
}

export class DeviceCreatedDto extends DeviceResponseDto {
  @ApiProperty({
    description: 'Secreto mostrado solo en esta respuesta. No se vuelve a recuperar.',
  })
  deviceKey!: string;
}

export class DevicePageDto {
  @ApiProperty({ type: [DeviceResponseDto] })
  items!: DeviceResponseDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  offset!: number;
}
