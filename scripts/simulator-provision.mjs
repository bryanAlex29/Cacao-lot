import { loadEnvFile } from 'node:process';
import { mkdir, open, unlink } from 'node:fs/promises';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

loadEnvFile(new URL('../.env', import.meta.url));
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== '--owner' ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(args[1])
)
  throw new Error('Uso: npm run simulator:provision -- --owner UUID_EXISTENTE');
const target = new URL(process.env.DATABASE_URL);
if (
  process.env.NODE_ENV !== 'development' ||
  process.env.TELEMETRY_MODE !== 'demo' ||
  !['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
)
  throw new Error('Requiere desarrollo local y TELEMETRY_MODE=demo explícito.');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.toString() }),
  log: [],
});
const file = new URL('../.local/simulator.json', import.meta.url);
let handle;
let reserved = false;
try {
  const owner = await db.user.findFirst({
    where: { id: args[1], isActive: true },
    select: { id: true },
  });
  if (!owner) throw new Error('Propietario activo no encontrado');
  await mkdir(new URL('../.local/', import.meta.url), { recursive: true });
  handle = await open(file, 'wx', 0o600); // No sobrescribe credenciales anteriores.
  reserved = true;
  const id = randomUUID();
  const key = randomBytes(32).toString('hex');
  const plot = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${owner.id}::uuid FOR SHARE`;
    if (
      !(await tx.user.findFirst({ where: { id: owner.id, isActive: true }, select: { id: true } }))
    )
      throw new Error('Propietario inactivo');
    const plot = await tx.plot.create({
      data: {
        ownerId: owner.id,
        name: 'DEMO · Simulador local',
        locationLabel: 'Datos simulados; no campo real',
        devices: {
          create: {
            id,
            serial: `demo-${id}`,
            source: 'demo',
            expectedIntervalSeconds: 5,
            credentialHash: createHash('sha256').update(key).digest('hex'),
            sensors: {
              create: [
                { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
                { code: 'soil_2', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'B' },
                { code: 'soil_3', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'C' },
                { code: 'temperatureC', variable: 'TEMPERATURE', unit: 'CELSIUS' },
                { code: 'airHumidityPct', variable: 'AIR_HUMIDITY', unit: 'PERCENT' },
                { code: 'rainDetected', variable: 'RAIN_DETECTED', unit: 'BOOLEAN' },
              ],
            },
          },
        },
      },
    });
    await handle.writeFile(
      JSON.stringify(
        {
          source: 'demo',
          plotId: plot.id,
          deviceId: id,
          deviceKey: key,
          endpoint: `http://127.0.0.1:${Number(process.env.PORT ?? 3100)}/api/v1/iot/telemetry`,
        },
        null,
        2,
      ),
    );
    return plot;
  });
  console.log(
    `DEMO creada: parcela ${plot.id}. Credenciales privadas en .local/simulator.json; no compartir.`,
  );
} catch {
  if (handle) await handle.close();
  handle = undefined;
  if (reserved) await unlink(file);
  console.error(
    'No se provisionó DEMO. Verificar propietario, entorno local y que .local/simulator.json no exista. No se sobrescribieron credenciales.',
  );
  process.exitCode = 1;
} finally {
  if (handle) await handle.close();
  await db.$disconnect();
}
