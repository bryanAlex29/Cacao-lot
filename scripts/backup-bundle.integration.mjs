import assert from 'node:assert/strict';
import { loadEnvFile } from 'node:process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import sharp from 'sharp';
import { tmpdir } from 'node:os';
import { fileHash } from './backup-bundle.mjs';
import {
  localRestoreSource,
  requireBackupDirectory,
  requireTemporaryDatabase,
} from './backup-restore-core.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
loadEnvFile(join(root, '.env'));

test(
  'conjunto DB+JPEG: snapshot, restauración, corrupción rechazada y limpieza, sin fixtures en principal',
  { timeout: 240000 },
  async () => {
    const source = localRestoreSource(process.env);
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
    const fixture = new PrismaClient({
      adapter: new PrismaPg({ connectionString: target.toString() }),
      log: [],
    });
    const base = join(root, '.local/backups');
    await mkdir(base, { recursive: true, mode: 0o700 });
    const imageRoot = await mkdtemp(join(base, 'test-images-'));
    const bundles = [];
    const externalParent = join(tmpdir(), 'opencode');
    await mkdir(externalParent, { recursive: true });
    const external = await mkdtemp(join(externalParent, 'cacaosmart-backup-copy-'));
    let created = false;
    const key = '01234567-89ab-cdef-0123-456789abcdef.jpg';
    const run = (script, args = []) =>
      spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
        cwd: root,
        timeout: 180000,
        encoding: 'utf8',
        env: {
          ...process.env,
          DATABASE_URL: target.toString(),
          POSTGRES_DB: name,
          IMAGE_STORAGE_PATH: imageRoot,
        },
      });
    try {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
      created = true;
      // Minimal synthetic schema only in our disposable database, not a business fixture.
      await fixture.$executeRawUnsafe(
        'CREATE TABLE ai_diagnoses (id text PRIMARY KEY, image_key text, status text NOT NULL)',
      );
      await fixture.$executeRawUnsafe('CREATE TABLE _prisma_migrations (id text PRIMARY KEY)');
      await fixture.$executeRaw`INSERT INTO ai_diagnoses (id, image_key, status) VALUES ('synthetic', ${key}, 'completed')`;
      await writeFile(
        join(imageRoot, key),
        await sharp({ create: { width: 4, height: 4, channels: 3, background: '#008000' } })
          .jpeg()
          .toBuffer(),
      );
      const result = run('create-backup.mjs');
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      const path = result.stdout.match(/Respaldo conjunto creado: (.+) \(/)?.[1];
      assert.ok(path, 'El comando informa el destino privado creado');
      const directory = resolve(root, path);
      requireBackupDirectory(base, directory);
      bundles.push(directory);
      const verify = () => run('verify-backup.mjs', ['--directory', directory]);
      const good = verify();
      assert.ifError(good.error);
      assert.equal(good.status, 0, good.stderr);
      assert.match(good.stdout, /2 tablas.*1 fotografías/);
      // Exercise the actual periodic entrypoint once, including structured
      // create output and isolated verification, never an endless test loop.
      const scheduled = run('periodic-backup.mjs', ['--once']);
      assert.ifError(scheduled.error);
      assert.equal(scheduled.status, 0, scheduled.stderr);
      const scheduledPath = scheduled.stdout.match(/Respaldo periódico verificado: (.+) \(/)?.[1];
      assert.ok(scheduledPath);
      const scheduledDirectory = resolve(root, scheduledPath);
      requireBackupDirectory(base, scheduledDirectory);
      bundles.push(scheduledDirectory);
      assert.ok(
        (await readdir(scheduledDirectory)).some((entry) => entry.startsWith('restore-check-')),
      );
      assert.equal((await readdir(base)).includes('periodic.lock'), false);
      const copied = run('copy-backup.mjs', [
        '--directory',
        scheduledDirectory,
        '--destination',
        external,
      ]);
      assert.ifError(copied.error);
      assert.equal(copied.status, 0, copied.stderr);
      const copyPath = copied.stdout.match(/Segunda copia verificada: (.+) \(/)?.[1];
      assert.ok(copyPath);
      const copyCheck = JSON.parse(await readFile(join(copyPath, 'copy-check.json'), 'utf8'));
      assert.equal(copyCheck.allHashesMatched, true);
      assert.equal(copyCheck.databaseRestored, false);
      assert.equal(copyCheck.files.length, 4);
      for (const file of copyCheck.files)
        assert.equal(
          await fileHash(join(copyPath, file.name)),
          await fileHash(join(scheduledDirectory, file.name)),
        );
      const duplicate = run('copy-backup.mjs', [
        '--directory',
        scheduledDirectory,
        '--destination',
        external,
      ]);
      assert.notEqual(duplicate.status, 0);
      await writeFile(join(directory, 'images', key), 'corrupted fixture');
      const bad = verify();
      assert.ifError(bad.error);
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /integridad/);
      assert.equal(
        (await readdir(directory)).some((entry) => entry.startsWith('.restore-images-')),
        false,
      );
      // Both verifier runs must remove their own database, including the failing one.
      const remaining =
        await admin.$queryRaw`SELECT datname FROM pg_database WHERE datname LIKE 'cacaosmart_restore_%'`;
      assert.deepEqual(
        remaining.map((row) => row.datname).filter((value) => value !== name),
        [],
      );
    } finally {
      await fixture.$disconnect();
      try {
        if (created)
          await admin.$executeRawUnsafe(
            `DROP DATABASE "${requireTemporaryDatabase(name, source)}" WITH (FORCE)`,
          );
      } finally {
        await admin.$disconnect();
        // Only synthetic image/backup directories created and recorded by this test.
        for (const directory of [...bundles, imageRoot])
          await rm(directory, { recursive: true, force: true });
        await rm(external, { recursive: true, force: true });
      }
    }
  },
);
