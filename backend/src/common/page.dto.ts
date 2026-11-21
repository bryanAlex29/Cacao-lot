import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class PageDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 100000 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  offset = 0;
}
