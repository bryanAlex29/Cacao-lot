import { Module } from '@nestjs/common';
import { SourcePolicy } from './source-policy.service';

/** Sin integración externa hasta recibir el contrato auténtico del receptor. */
@Module({ providers: [SourcePolicy], exports: [SourcePolicy] })
export class IntegrationsModule {}
