import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PlotsRepository } from './plots.repository';
import { PlotsService } from './plots.service';
import { PlotsController } from './plots.controller';
import { DevicesRepository } from '../devices/devices.repository';
import { DevicesService } from '../devices/devices.service';
import { DevicesController } from '../devices/devices.controller';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  providers: [PlotsRepository, PlotsService, DevicesRepository, DevicesService],
  controllers: [PlotsController, DevicesController],
  exports: [PlotsService],
})
export class PlotsModule {}
