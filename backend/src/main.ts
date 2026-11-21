import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import type { Environment } from './config/environment';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const config = app.get(ConfigService<Environment, true>);
  await app.listen(config.get('PORT', { infer: true }), config.get('HOST', { infer: true }));
}

void bootstrap().catch(() => {
  console.error(
    'No se pudo iniciar la API. Revisar configuración local y disponibilidad del puerto.',
  );
  process.exitCode = 1;
});
