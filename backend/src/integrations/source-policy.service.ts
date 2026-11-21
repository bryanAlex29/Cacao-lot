import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DataSource } from '@cacaosmart/contracts';
import type { Environment } from '../config/environment';

@Injectable()
export class SourcePolicy {
  constructor(private readonly config: ConfigService<Environment, true>) {}

  allows(source: DataSource): boolean {
    return (
      source === 'real' ||
      (source === 'demo' &&
        this.config.get('NODE_ENV', { infer: true }) !== 'production' &&
        this.config.get('TELEMETRY_MODE', { infer: true }) === 'demo')
    );
  }

  require(source: DataSource): void {
    if (!this.allows(source))
      throw new ForbiddenException('El canal de demostración no está habilitado');
  }
}
