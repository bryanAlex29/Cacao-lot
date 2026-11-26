import { loadEnvFile } from 'node:process';
import { mkdir, open, readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { isUUID } from 'class-validator';
import { parseThingSpeakBinding } from './thingspeak-binding';

/** Operación administrativa local explícita, no un endpoint ni un cambio de rol. */
async function main() {
  const root = resolve(__dirname, '../../..');
  loadEnvFile(resolve(root, '.env'));
  const ownerId = process.argv[2];
  if (
    process.argv.length !== 3 ||
    !isUUID(ownerId ?? '', '4') ||
    process.env.NODE_ENV !== 'development' ||
    process.env.THINGSPEAK_CHANNEL_ID !== '3554501'
  )
    throw new Error('Requiere desarrollo, canal 3554501 y UUID de propietario activo explícito.');
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      options: '-c timezone=UTC',
      connectionTimeoutMillis: 5000,
    }),
    log: [],
  });
  const file = resolve(root, '.local/thingspeak.json');
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let reserved = false;
  try {
    await mkdir(resolve(root, '.local'), { recursive: true });
    try {
      const existing = parseThingSpeakBinding(JSON.parse(await readFile(file, 'utf8')));
      const device = await db.device.findFirst({
        where: {
          id: existing.deviceId,
          plotId: existing.plotId,
          serial: 'thingspeak-3554501',
          source: 'real',
          isActive: true,
          plot: { ownerId, archivedAt: null, owner: { isActive: true } },
        },
        select: { id: true },
      });
      if (existing.ownerId !== ownerId || !device)
        throw new Error('Asociación anterior incompatible.');
      console.log('La asociación ya existe y pertenece al propietario solicitado. No se duplicó.');
      return;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
    handle = await open(file, 'wx', 0o600);
    reserved = true;
    const binding = parseThingSpeakBinding({
      channelId: 3554501,
      ownerId,
      plotId: randomUUID(),
      deviceId: randomUUID(),
      pollIntervalSeconds: 20,
    });
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${ownerId}::uuid FOR SHARE`;
        if (
          !(await tx.user.findFirst({
            where: { id: ownerId, isActive: true },
            select: { id: true },
          }))
        )
          throw new Error('Propietario activo no encontrado.');
        // Serial único: nunca reutilizar o reasignar recursos de otra cuenta.
        if (await tx.device.findUnique({ where: { serial: 'thingspeak-3554501' } })) {
          throw new Error('El canal ya tiene un dispositivo registrado.');
        }
        await tx.plot.create({
          data: {
            id: binding.plotId,
            ownerId,
            name: 'Cacao · ThingSpeak',
            locationLabel: 'Canal ThingSpeak 3554501 · ubicación pendiente de confirmar',
            devices: {
              create: {
                id: binding.deviceId,
                serial: 'thingspeak-3554501',
                source: 'real',
                expectedIntervalSeconds: binding.pollIntervalSeconds,
                // No entrega una credencial de ingesta directa; el importador usa vínculo interno.
                credentialHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
                sensors: {
                  create: [
                    {
                      code: 'soil_1',
                      variable: 'SOIL_MOISTURE',
                      unit: 'PERCENT',
                      zone: 'A',
                      calibrationMetadata: {
                        status: 'user-confirmed',
                        provider: 'thingspeak',
                        field: 'field3',
                      },
                    },
                    {
                      code: 'soil_2',
                      variable: 'SOIL_MOISTURE',
                      unit: 'PERCENT',
                      zone: 'B',
                      enabled: false,
                    },
                    {
                      code: 'soil_3',
                      variable: 'SOIL_MOISTURE',
                      unit: 'PERCENT',
                      zone: 'C',
                      enabled: false,
                    },
                    { code: 'temperatureC', variable: 'TEMPERATURE', unit: 'CELSIUS' },
                    { code: 'airHumidityPct', variable: 'AIR_HUMIDITY', unit: 'PERCENT' },
                    {
                      code: 'rainDetected',
                      variable: 'RAIN_DETECTED',
                      unit: 'BOOLEAN',
                      enabled: false,
                    },
                  ],
                },
              },
            },
          },
        });
        await handle!.writeFile(JSON.stringify(binding, null, 2), 'utf8');
      },
      { timeout: 15000 },
    );
    reserved = false;
    console.log(`Parcela creada: Cacao · ThingSpeak (${binding.plotId}).`);
    console.log(`Dispositivo REAL asociado al canal 3554501: ${binding.deviceId}.`);
  } finally {
    await handle?.close();
    if (reserved) await unlink(file);
    await db.$disconnect();
  }
}

void main().catch(() => {
  console.error(
    'No se completó la provisión. Revisa propietario, canal y asociación previa. No se reasignaron recursos.',
  );
  process.exitCode = 1;
});
