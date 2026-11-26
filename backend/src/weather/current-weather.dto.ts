import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WeatherCityDto } from './weather-cities.dto';
import type { CurrentWeather } from '@cacaosmart/contracts';

class CurrentConditionsDto implements NonNullable<CurrentWeather['current']> {
  @ApiProperty({ format: 'date-time' }) observedAt!: string;
  @ApiProperty({ format: 'date-time' }) fetchedAt!: string;
  @ApiProperty({ type: Number, nullable: true }) temperatureC!: number | null;
  @ApiProperty({ type: Number, nullable: true }) apparentTemperatureC!: number | null;
  @ApiProperty({ type: Number, nullable: true }) humidityPct!: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Acumulado modelado del intervalo anterior, no probabilidad.',
  })
  precipitationMm!: number | null;
  @ApiProperty({ minimum: 1, maximum: 3600 }) intervalSeconds!: number;
  @ApiProperty({ type: Number, nullable: true, description: 'Código WMO' }) weatherCode!:
    number | null;
  @ApiProperty({ type: Boolean, nullable: true }) isDay!: boolean | null;
  @ApiProperty({ enum: ['Open-Meteo'] }) provider!: 'Open-Meteo';
  @ApiProperty({ enum: ['modeled'] }) quality!: 'modeled';
}

export class CurrentWeatherDto implements CurrentWeather {
  @ApiPropertyOptional({ type: WeatherCityDto }) city?: WeatherCityDto;
  @ApiProperty({ format: 'uuid' }) plotId!: string;
  @ApiProperty({ enum: ['available', 'disabled', 'location_required'] })
  status!: CurrentWeather['status'];
  @ApiProperty({ type: CurrentConditionsDto, nullable: true })
  current!: CurrentConditionsDto | null;
}
