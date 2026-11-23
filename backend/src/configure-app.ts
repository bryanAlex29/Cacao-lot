import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Environment } from './config/environment';
import { HttpAdapterHost } from '@nestjs/core';
import { SanitizedExceptionFilter } from './common/sanitized-exception.filter';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<Environment, true>);
  app.setGlobalPrefix('api/v1');
  app.use(
    (
      _request: unknown,
      response: { setHeader(name: string, value: string): void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new SanitizedExceptionFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const schema = new DocumentBuilder()
      .setTitle('CacaoSmart IoT API')
      .setDescription(
        'Autenticación, parcelas, dispositivos, telemetría y rangos por sensor con permisos por propietario. Socket.IO /telemetry documentado en docs/phase-4.md; rangos en docs/phase-5.md.',
      )
      .setVersion('0.5.0')
      .addBearerAuth()
      .addCookieAuth('cacaosmart_session', { type: 'apiKey', in: 'cookie' }, 'browser-session')
      .build();
    SwaggerModule.setup('api/v1/docs', app, SwaggerModule.createDocument(app, schema));
  }
}
