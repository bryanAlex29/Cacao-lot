import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { WeatherCity, WeatherCitySearch } from '@cacaosmart/contracts';

export class WeatherCitySearchQuery {
  @ApiProperty({
    minLength: 2,
    maxLength: 80,
    description: 'Ciudad, opcionalmente seguida de región o país.',
  })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @Length(2, 80)
  @Matches(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u)
  name!: string;
}
export class CurrentWeatherQuery {
  @ApiPropertyOptional({
    type: Number,
    minimum: 1,
    maximum: 2147483647,
    description: 'ID GeoNames de la ciudad seleccionada; no modifica la parcela.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  cityId?: number;
}
export class WeatherCityDto implements WeatherCity {
  @ApiProperty() id!: number;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) region!: string | null;
  @ApiProperty() country!: string;
  @ApiProperty() countryCode!: string;
}
export class WeatherCitySearchDto implements WeatherCitySearch {
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ enum: ['available', 'disabled'] }) status!: WeatherCitySearch['status'];
  @ApiProperty({ type: [WeatherCityDto] }) items!: WeatherCityDto[];
}
