import { ApiProperty } from '@nestjs/swagger';

export class LiveHealthDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status!: 'ok';

  @ApiProperty({ example: 'cacaosmart-api' })
  service!: string;
}

export class ReadyHealthDto extends LiveHealthDto {
  @ApiProperty({ enum: ['up'], example: 'up' })
  database!: 'up';
}

export class UnavailableHealthDto {
  @ApiProperty({ enum: ['unavailable'] })
  status!: 'unavailable';

  @ApiProperty({ enum: ['down'] })
  database!: 'down';
}
