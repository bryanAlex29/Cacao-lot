import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { trimText } from '../users/user.dto';

export class CreatePlotDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  name!: string;

  @ApiProperty({ maxLength: 200 })
  @Transform(trimText)
  @IsString()
  @Length(1, 200)
  locationLabel!: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0.000001 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.000001)
  areaM2?: number | null;
}

export class UpdatePlotDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(trimText)
  @IsString()
  @Length(1, 200)
  locationLabel?: string;

  @ApiPropertyOptional({ nullable: true, minimum: 0.000001 })
  @IsOptional()
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(0.000001)
  areaM2?: number | null;
}

export class PlotResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  ownerId!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  locationLabel!: string;
  @ApiProperty({ type: Number, nullable: true })
  areaM2!: number | null;
  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;
}

export class PlotPageDto {
  @ApiProperty({ type: [PlotResponseDto] })
  items!: PlotResponseDto[];
  @ApiProperty()
  total!: number;
  @ApiProperty()
  limit!: number;
  @ApiProperty()
  offset!: number;
}
