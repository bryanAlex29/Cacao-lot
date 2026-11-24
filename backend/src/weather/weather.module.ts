import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WeatherController } from './weather.controller';
import { WeatherRepository } from './weather.repository';
import { WeatherService } from './weather.service';
import { OpenMeteoProvider } from './open-meteo.provider';
import { WeatherJob } from './weather.job';

@Module({
  imports: [DatabaseModule],
  controllers: [WeatherController],
  providers: [WeatherRepository, WeatherService, OpenMeteoProvider, WeatherJob],
})
export class WeatherModule {}
