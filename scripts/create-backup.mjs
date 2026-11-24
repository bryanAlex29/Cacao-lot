import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { openSync, closeSync } from 'node:fs';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  localRestoreSource,
  requireBackupDirectory,
  readBackupManifest,
} from './backup-restore-core.mjs';
import {
  captureTables,
  copyPrivateImage,
  diagnosisImageKeys,
  fileHash,
  validateBundle,
} from './backup-bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length !== 2) throw new Error('Uso: npm run backup:create (sin argumentos)');
loadEnvFile(join(root, '.env'));
const source = localRestoreSource(process.env);
await mkdir(join(root, '.local/backups'), { recursive: true, mode: 0o700 });
const base = await realpath(join(root, '.local/backups'));
requireBackupDirectory(await realpath(root), base);
const directory = join(
  base,
  `bundle-${new Date().toISOString().replaceAll(':', '-')}-${randomBytes(8).toString('hex')}`,
);
const ignored = spawnSync('git', ['check-ignore', '--quiet', directory], { cwd: root });
if (ignored.status !== 0) throw new Error('El destino del respaldo debe estar excluido de Git');
await mkdir(directory, { mode: 0o700 });
await mkdir(join(directory, 'images'), { mode: 0o700 });
const imageRoot = process.env.IMAGE_STORAGE_PATH
  ? resolve(root, 'backend', process.env.IMAGE_STORAGE_PATH)
  : join(root, '.local/ai-images');
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: source.toString() }),
  log: [],
});
try {
  const manifest = await db.$transaction(
    async (tx) => {
      const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
      if (!/^[A-Fa-f0-9]+-[A-Fa-f0-9]+-\d+$/.test(snapshot))
        throw new Error('Instantánea PostgreSQL inválida');
      const [{ pending }] =
        await tx.$queryRaw`SELECT count(*)::text AS pending FROM ai_diagnoses WHERE status = 'pending'`;
      if (pending !== '0')
        throw new Error('Hay análisis pendientes; espera a que terminen antes de respaldar');
      const data = await captureTables(tx, true);
      const keys = await diagnosisImageKeys(tx);
      const images = [];
      for (const key of [...new Set(keys)])
        images.push(await copyPrivateImage(imageRoot, join(directory, 'images'), key));
      const output = openSync(join(directory, 'database.dump'), 'wx', 0o600);
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
            'exec pg_dump -U "$POSTGRES_USER" -d "$1" --format=custom --no-owner --no-acl --snapshot="$2"',
            'backup',
            decodeURIComponent(source.pathname.slice(1)),
            snapshot,
          ],
          { cwd: root, timeout: 120000, stdio: ['ignore', output, 'pipe'] },
        );
        if (result.error || result.status !== 0)
          throw new Error('Falló pg_dump; el respaldo no se marcó como completo');
      } finally {
        closeSync(output);
      }
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
    { isolationLevel: 'RepeatableRead', timeout: 180000 },
  );
  // Completion marker is last. A failed bundle intentionally has no before.json.
  await writeFile(join(directory, 'before.json'), JSON.stringify(manifest, null, 2), {
    flag: 'wx',
    mode: 0o600,
  });
  console.log(
    `Respaldo conjunto creado: ${relative(root, directory)} (${Object.keys(manifest.data).length} tablas, ${manifest.images.length} fotografías). Ejecuta backup:verify para ensayar su recuperación.`,
  );
} finally {
  await db.$disconnect();
}
