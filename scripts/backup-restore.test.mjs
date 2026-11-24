import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyPrivateImage, fileHash, validateBundle, verifyImageBundle } from './backup-bundle.mjs';
import {
  localRestoreSource,
  requireBackupDirectory,
  requireTemporaryDatabase,
  readBackupManifest,
  verifyRestoredTables,
} from './backup-restore-core.mjs';

const env = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://local:test-only@127.0.0.1:5433/cacaosmart',
  POSTGRES_DB: 'cacaosmart',
  POSTGRES_USER: 'local',
};
const data = { users: { count: '2', fingerprint: 'a'.repeat(32) } };
test('solo acepta base local coincidente con Compose', () => {
  assert.equal(localRestoreSource(env).pathname, '/cacaosmart');
  assert.equal(
    localRestoreSource({
      ...env,
      DATABASE_URL: `${env.DATABASE_URL}?schema=public&connect_timeout=3`,
    }).pathname,
    '/cacaosmart',
  );
  for (const extra of [
    { NODE_ENV: 'production' },
    { DATABASE_URL: 'postgresql://local:x@remote.example:5433/cacaosmart' },
    { DATABASE_URL: `${env.DATABASE_URL}?host=remote.example` },
    { POSTGRES_DB: 'other' },
    { POSTGRES_USER: 'other' },
    { POSTGRES_PORT: '5432' },
    { DATABASE_URL: 'https://example.test' },
  ]) {
    assert.throws(() => localRestoreSource({ ...env, ...extra }));
  }
});
test('el respaldo debe permanecer bajo el directorio privado, sin escape ni hermanos de prefijo similar', () => {
  const base = resolve('.local/backups');
  requireBackupDirectory(base, resolve(base, 'dated-backup'));
  for (const path of [base, resolve(base, '..'), `${base}-other`, resolve('public')])
    assert.throws(() => requireBackupDirectory(base, path));
});
test('nunca acepta un destino suministrado como base principal o SQL', () => {
  const source = localRestoreSource(env);
  assert.equal(
    requireTemporaryDatabase('cacaosmart_restore_0123456789abcdef', source),
    'cacaosmart_restore_0123456789abcdef',
  );
  for (const name of [
    'cacaosmart',
    'postgres',
    'cacaosmart_test_0123456789abcdef',
    'cacaosmart_restore_bad',
    'x"; DROP DATABASE cacaosmart;--',
  ])
    assert.throws(() => requireTemporaryDatabase(name, source));
});
test('el manifiesto requiere huellas, conteos y tablas de formato conocido', () => {
  assert.deepEqual(readBackupManifest({ dumpHash: 'b'.repeat(64), data }).data, data);
  for (const value of [
    null,
    {},
    { dumpHash: 'bad', data },
    { dumpHash: 'b'.repeat(64), data: {} },
    { dumpHash: 'b'.repeat(64), data: { users: { count: '-1', fingerprint: 'a'.repeat(32) } } },
    { dumpHash: 'b'.repeat(64), data: { 'bad"name': data.users } },
  ])
    assert.throws(() => readBackupManifest(value));
});
test('la comparación detecta pérdida, contenido cambiado y tablas adicionales', () => {
  assert.equal(verifyRestoredTables(data, structuredClone(data)), 1);
  for (const actual of [
    {},
    { users: { ...data.users, count: '1' } },
    { users: { ...data.users, fingerprint: 'b'.repeat(32) } },
    { ...data, extra: data.users },
  ])
    assert.throws(() => verifyRestoredTables(data, actual));
});

const imageKey = '01234567-89ab-cdef-0123-456789abcdef.jpg';
test('el inventario de fotos rechaza escape de rutas, duplicados, hashes y referencias incompletas', () => {
  const image = { key: imageKey, bytes: 10, sha256: 'a'.repeat(64) };
  validateBundle({ backupVersion: 2, images: [image] }, [imageKey]);
  validateBundle({ backupVersion: 2, images: [] }, []);
  for (const images of [
    [{ ...image, key: '../secret.jpg' }],
    [image, image],
    [{ ...image, bytes: 0 }],
    [{ ...image, sha256: 'bad' }],
    [],
  ])
    assert.throws(() => validateBundle({ backupVersion: 2, images }, [imageKey]));
  assert.throws(() => validateBundle({ backupVersion: 2, images: [image] }, []));
  assert.throws(() => validateBundle({ backupVersion: 3, images: [] }, []));
});

test('la recuperación de fotos copia de forma aislada, detecta corrupción y siempre limpia', async (t) => {
  const base = resolve('.local/backups');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'unit-images-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const images = join(directory, 'images');
  await mkdir(images);
  const bytes = Buffer.from('synthetic image bytes for hashing');
  await writeFile(join(images, imageKey), bytes);
  const manifest = {
    backupVersion: 2,
    images: [
      { key: imageKey, bytes: bytes.length, sha256: await fileHash(join(images, imageKey)) },
    ],
  };
  assert.equal(await verifyImageBundle(directory, manifest, [imageKey]), 1);
  assert.deepEqual(await readdir(directory), ['images']);
  assert.deepEqual(await readFile(join(images, imageKey)), bytes);
  await writeFile(join(images, imageKey), Buffer.from('corrupted'));
  await assert.rejects(verifyImageBundle(directory, manifest, [imageKey]), /integridad/);
  assert.deepEqual(await readdir(directory), ['images']);
  await rm(join(images, imageKey));
  await assert.rejects(verifyImageBundle(directory, manifest, [imageKey]), { code: 'ENOENT' });
  assert.deepEqual(await readdir(directory), ['images']);
});

test('la copia no sobrescribe archivos ni sigue enlaces a imágenes externas', async (t) => {
  const base = resolve('.local/backups');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'unit-copy-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const from = join(directory, 'from'),
    to = join(directory, 'to');
  await mkdir(from);
  await mkdir(to);
  await writeFile(join(from, imageKey), 'original');
  await writeFile(join(to, imageKey), 'preserved');
  await assert.rejects(copyPrivateImage(from, to, imageKey), { code: 'EEXIST' });
  assert.equal(await readFile(join(to, imageKey), 'utf8'), 'preserved');
  // Windows junctions do not require the privilege needed by file symlinks.
  const linked = join(directory, 'bundle');
  await mkdir(linked);
  await symlink(to, join(linked, 'images'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyImageBundle(linked, { backupVersion: 2, images: [] }, []), /dentro/);
  // A directory in place of an image is never accepted as a regular file.
  await rm(join(from, imageKey));
  await mkdir(join(from, imageKey));
  await assert.rejects(copyPrivateImage(from, to, imageKey), /archivo regular/);
});
