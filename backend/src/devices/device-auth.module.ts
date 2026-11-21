import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DeviceAuthService } from './device-auth.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  providers: [DeviceAuthService],
  exports: [DeviceAuthService],
})
export class DeviceAuthModule {}
