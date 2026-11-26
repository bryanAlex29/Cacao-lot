import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WeatherController } from './weather.controller';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';
import { OpenMeteoProvider } from './open-meteo.provider';
import { WeatherJob } from './weather.job';
import { CurrentWeatherProvider } from './current-weather.provider';
import { CurrentWeatherService } from './current-weather.service';
import { WeatherCitiesProvider } from './weather-cities.provider';
import { WeatherCitiesService } from './weather-cities.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WeatherController],
  providers: [
    WeatherRepository,
    WeatherService,
    OpenMeteoProvider,
    WeatherJob,
    CurrentWeatherProvider,
    CurrentWeatherService,
    WeatherCitiesProvider,
    WeatherCitiesService,
  ],
})
export class WeatherModule {}
