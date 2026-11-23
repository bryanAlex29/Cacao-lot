import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { SnapshotQueryDto } from '../telemetry/telemetry.dto';

export class ReportQueryDto extends SnapshotQueryDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Inicio inclusivo con zona horaria; máximo 31 días',
  })
  @IsISO8601({ strict: true, strictSeparator: true })
  from!: string;

  @ApiProperty({ format: 'date-time', description: 'Fin inclusivo con zona horaria' })
  @IsISO8601({ strict: true, strictSeparator: true })
  to!: string;
}
