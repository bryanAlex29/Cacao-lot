import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  neonSource,
  nativeEnvironment,
  postgresTools,
  runPostgres,
  temporaryNeonDatabase,
} from './neon-postgres.mjs';
import {
  readBackupManifest,
  requireBackupDirectory,
  verifyRestoredTables,
} from './backup-restore-core.mjs';
import {
  captureTables,
  copyPrivateImage,
  diagnosisImageKeys,
  fileHash,
  validateBundle,
  verifyImageBundle,
} from './backup-bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
let admin;
let restored;
let target;
let source;
let created = false;
let report;
let directory;
let caFile;
let caCreated = false;
try {
  if (process.argv.length !== 2) throw new Error('Uso: npm run backup:neon');
  loadEnvFile(join(root, '.env'));
  source = neonSource(process.env);
  const tools = await postgresTools(process.env);
  admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: source.href, connectionTimeoutMillis: 20000 }),
    log: [],
  });
  const [{ allowed }] = await admin.$queryRaw`
    SELECT rolcreatedb AS allowed FROM pg_roles WHERE rolname = current_user
  `;
  if (!allowed)
    throw new Error('El rol necesita crear una base temporal para verificar el respaldo');
  await mkdir(join(root, '.local/backups'), { recursive: true, mode: 0o700 });
  const base = await realpath(join(root, '.local/backups'));
  requireBackupDirectory(await realpath(root), base);
  directory = join(
    base,
    `bundle-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(8).toString('hex')}`,
  );
  if (spawnSync('git', ['check-ignore', '--quiet', directory], { cwd: root }).status !== 0)
    throw new Error('El respaldo debe estar excluido de Git');
  await mkdir(directory, { mode: 0o700 });
  await mkdir(join(directory, 'images'), { mode: 0o700 });
  caFile = join(directory, 'tls-ca.pem');
  const env = await nativeEnvironment(source, caFile);
  caCreated = true;
  const imageRoot = process.env.IMAGE_STORAGE_PATH
    ? resolve(root, 'backend', process.env.IMAGE_STORAGE_PATH)
    : join(root, '.local/ai-images');
  console.log('Creando respaldo Neon consistente, sin Docker y sin mostrar credenciales.');
  const manifest = await admin.$transaction(
    async (tx) => {
      const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
      if (!/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-\d+$/.test(snapshot))
        throw new Error('Instantánea PostgreSQL inválida');
      const [{ pending }] = await tx.$queryRaw`
      SELECT count(*)::text AS pending FROM ai_diagnoses WHERE status = 'pending'
    `;
      if (pending !== '0') throw new Error('Hay análisis pendientes; reintentar al finalizar');
      const data = await captureTables(tx, true);
      const keys = await diagnosisImageKeys(tx);
      const images = [];
      for (const key of [...new Set(keys)])
        images.push(await copyPrivateImage(imageRoot, join(directory, 'images'), key));
      await runPostgres(
        tools.dump,
        [
          '--format=custom',
          '--no-owner',
          '--no-acl',
          `--snapshot=${snapshot}`,
          '--file',
          join(directory, 'database.dump'),
        ],
        env,
      );
      const value = {
        backupVersion: 2,
        createdAt: new Date().toISOString(),
        dumpHash: await fileHash(join(directory, 'database.dump')),
        data,
        images,
      };
      readBackupManifest(value);
      validateBundle(value, keys);
      return value;
    },
    { isolationLevel: 'RepeatableRead', timeout: 240000, maxWait: 20000 },
  );
  await writeFile(join(directory, 'before.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  const name = `cacaosmart_restore_${randomBytes(8).toString('hex')}`;
  target = temporaryNeonDatabase(name, source);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log('Respaldo creado. Ensayando restauración en una base temporal aislada.');
  await runPostgres(
    tools.restore,
    [
      '--no-owner',
      '--no-acl',
      '--exit-on-error',
      '--single-transaction',
      '--dbname',
      name,
      join(directory, 'database.dump'),
    ],
    { ...env, PGDATABASE: name },
  );
  restored = new PrismaClient({
    adapter: new PrismaPg({ connectionString: target.href, connectionTimeoutMillis: 20000 }),
    log: [],
  });
  const matched = verifyRestoredTables(manifest.data, await captureTables(restored, true));
  const images = await verifyImageBundle(directory, manifest, await diagnosisImageKeys(restored));
  if ((await fileHash(join(directory, 'database.dump'))) !== manifest.dumpHash)
    throw new Error('El archivo cambió durante la verificación');
  report = {
    verifiedAt: new Date().toISOString(),
    restoredTablesMatched: matched,
    restoredImagesMatched: images,
    archiveHashMatched: true,
    temporaryDatabaseRemoved: true,
    applicationDataRestoredToMain: false,
    applicationImagesRestoredToLive: false,
    provider: 'neon',
    tlsVerified: true,
  };
} catch (error) {
  if (typeof error?.code === 'string') console.error(`Código de diagnóstico: ${error.code}`);
  // Known tool/validation messages are safe; Prisma/libpq exceptions are not.
  console.error(
    error instanceof Error && !('code' in error) && !error.name.startsWith('Prisma')
      ? error.message
      : 'Falló el respaldo Neon; detalles privados omitidos',
  );
  process.exitCode = 1;
} finally {
  try {
    if (restored) await restored.$disconnect();
    if (created) {
      const safe = temporaryNeonDatabase(target.pathname.slice(1), source);
      await admin.$executeRawUnsafe(`DROP DATABASE "${safe.pathname.slice(1)}" WITH (FORCE)`);
      created = false;
    }
  } catch {
    console.error(
      'No se pudo limpiar la base temporal; revisar cacaosmart_restore_* antes de reintentar.',
    );
    process.exitCode = 1;
  } finally {
    try {
      if (admin) await admin.$disconnect();
    } finally {
      if (caCreated) await unlink(caFile);
    }
  }
}
if (report && !process.exitCode && !created) {
  await writeFile(
    join(directory, `restore-check-${randomBytes(8).toString('hex')}.json`),
    JSON.stringify(report, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Respaldo Neon verificado: ${relative(root, directory)} (${report.restoredTablesMatched} tablas, ${report.restoredImagesMatched} fotografías). Base temporal eliminada; principal intacta.`,
  );
}
