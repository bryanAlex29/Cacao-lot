import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { RealtimeService } from './realtime.service';

@Module({
  imports: [AuthModule, DatabaseModule, IntegrationsModule],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
