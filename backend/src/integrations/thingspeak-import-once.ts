import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ThingSpeakImportService } from './thingspeak-import.service';
import { Prisma } from '@prisma/client';

/** Sin listen/init: no abre puertos, no inicia polling ni tareas de bootstrap. */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  try {
    const result = await app.get(ThingSpeakImportService).runOnce();
    console.log(`Importación ThingSpeak: ${result.status}.`);
    console.log('Solo el destino asociado; sin cambios de firmware ni válvula.');
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  const category = error instanceof Error ? error.constructor.name : 'Error';
  const code = error instanceof Prisma.PrismaClientKnownRequestError ? ` ${error.code}` : '';
  console.error(
    `No se pudo completar la importación (${category}${code}). Revisa asociación, canal y red.`,
  );
  process.exitCode = 1;
});
