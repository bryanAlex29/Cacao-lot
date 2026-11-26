import { Module } from '@nestjs/common';
import { SourcePolicy } from './source-policy.service';
import { ThingSpeakClient } from './thingspeak.client';

/** Transporte externo disponible; normalización pendiente del mapa confirmado. */
@Module({
  providers: [
    SourcePolicy,
    {
      provide: ThingSpeakClient,
      useFactory: () =>
        new ThingSpeakClient({
          channelId: process.env.THINGSPEAK_CHANNEL_ID,
          readApiKey: process.env.THINGSPEAK_READ_API_KEY,
        }),
    },
  ],
  exports: [SourcePolicy, ThingSpeakClient],
})
export class IntegrationsModule {}
