import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  localRestoreSource,
  requireBackupDirectory,
  requireTemporaryDatabase,
  readBackupManifest,
  verifyRestoredTables,
} from './backup-restore-core.mjs';
import {
  captureTables,
  diagnosisImageKeys,
  fileHash,
  verifyImageBundle,
} from './backup-bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--directory' || !args[1])
  throw new Error('Uso: npm run backup:verify -- --directory .local/backups/DIRECTORIO');
loadEnvFile(join(root, '.env'));
const source = localRestoreSource(process.env);
const base = await realpath(join(root, '.local/backups'));
const directory = await realpath(resolve(root, args[1]));
requireBackupDirectory(base, directory);
const dump = await realpath(join(directory, 'database.dump'));
requireBackupDirectory(directory, dump);
const ignored = spawnSync('git', ['check-ignore', '--quiet', dump], { cwd: root });
if (ignored.status !== 0) throw new Error('El respaldo no está excluido de Git');
const manifest = readBackupManifest(
  JSON.parse(await readFile(join(directory, 'before.json'), 'utf8')),
);
if (manifest.backupVersion !== undefined && manifest.backupVersion !== 2)
  throw new Error('Versión de respaldo no compatible');
if ((await fileHash(dump)) !== manifest.dumpHash)
  throw new Error('La integridad del respaldo no coincide; no se restauró');

const name = requireTemporaryDatabase(
  `cacaosmart_restore_${randomBytes(8).toString('hex')}`,
  source,
);
const target = new URL(source);
target.pathname = `/${name}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: source.toString() }),
  log: [],
});
const restored = new PrismaClient({
  adapter: new PrismaPg({ connectionString: target.toString() }),
  log: [],
});
let created = false;
let matched = 0;
let imagesMatched = null;
try {
  // Never pass --create or a user-supplied destination to pg_restore.
  await admin.$executeRawUnsafe(`CREATE DATABASE "${requireTemporaryDatabase(name, source)}"`);
  created = true;
  const input = openSync(dump, 'r');
  try {
    const result = spawnSync(
      'docker',
      [
        'compose',
        'exec',
        '-T',
        'postgres',
        'sh',
        '-c',
        'exec pg_restore -U "$POSTGRES_USER" --no-owner --no-acl --exit-on-error -d "$1"',
        'restore-check',
        name,
      ],
      { cwd: root, timeout: 120000, stdio: [input, 'pipe', 'pipe'] },
    );
    if (result.error || result.status !== 0)
      throw new Error('Falló pg_restore en la base temporal; no se tocó el destino principal');
  } finally {
    closeSync(input);
  }
  const actual = await captureTables(restored, manifest.backupVersion === 2);
  matched = verifyRestoredTables(manifest.data, actual);
  if (manifest.backupVersion === 2)
    imagesMatched = await verifyImageBundle(
      directory,
      manifest,
      await diagnosisImageKeys(restored),
    );
  if ((await fileHash(dump)) !== manifest.dumpHash)
    throw new Error('Cambió el archivo de respaldo durante la verificación');
} finally {
  try {
    await restored.$disconnect();
  } finally {
    try {
      if (created)
        await admin.$executeRawUnsafe(
          `DROP DATABASE "${requireTemporaryDatabase(name, source)}" WITH (FORCE)`,
        );
    } finally {
      await admin.$disconnect();
    }
  }
}
const report = {
  verifiedAt: new Date().toISOString(),
  restoredTablesMatched: matched,
  restoredImagesMatched: imagesMatched,
  archiveHashMatched: true,
  temporaryDatabaseRemoved: true,
  applicationDataRestoredToMain: false,
  applicationImagesRestoredToLive: false,
};
await writeFile(
  join(directory, `restore-check-${name.slice(-16)}.json`),
  JSON.stringify(report, null, 2),
  { flag: 'wx', mode: 0o600 },
);
console.log(
  `Respaldo restaurado y verificado: ${matched} tablas idénticas al manifiesto${imagesMatched === null ? '' : ` y ${imagesMatched} fotografías verificadas en copia aislada`}. Base temporal eliminada; no se restauraron datos sobre la principal.`,
);
