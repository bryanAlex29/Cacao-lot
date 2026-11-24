import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, realpath, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { requireBackupDirectory } from './backup-restore-core.mjs';

export async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export function requireImageKey(key) {
  if (typeof key !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.jpg$/.test(key))
    throw new Error('Identificador de imagen del respaldo inválido');
  return key;
}

export function validateBundle(manifest, keys) {
  if (manifest.backupVersion !== 2 || !Array.isArray(manifest.images))
    throw new Error('Formato de respaldo conjunto inválido');
  const seen = new Set();
  for (const image of manifest.images) {
    requireImageKey(image?.key);
    if (
      seen.has(image.key) ||
      !/^[a-f0-9]{64}$/.test(image.sha256 ?? '') ||
      !Number.isSafeInteger(image.bytes) ||
      image.bytes <= 0
    )
      throw new Error('Inventario de imágenes inválido');
    seen.add(image.key);
  }
  if (
    JSON.stringify([...seen].sort()) !==
    JSON.stringify([...new Set(keys.map(requireImageKey))].sort())
  )
    throw new Error('Las fotografías no coinciden con las referencias de la base');
}

export async function copyPrivateImage(sourceRoot, targetRoot, key) {
  requireImageKey(key);
  const path = join(sourceRoot, key);
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('La imagen debe ser un archivo regular');
  requireBackupDirectory(await realpath(sourceRoot), await realpath(path));
  const target = join(targetRoot, key);
  await copyFile(path, target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
  const copied = await lstat(target);
  return { key, bytes: copied.size, sha256: await fileHash(target) };
}

export async function captureTables(client, includeMigrations = false) {
  const tables =
    await client.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const data = {};
  for (const { tablename } of tables) {
    if (!includeMigrations && tablename === '_prisma_migrations') continue;
    if (!/^[a-z_]+$/.test(tablename)) throw new Error('Nombre de tabla inesperado');
    const [row] = await client.$queryRawUnsafe(
      `SELECT count(*)::text AS count, md5(COALESCE(string_agg(to_jsonb(t)::text, '' ORDER BY to_jsonb(t)::text), '')) AS fingerprint FROM public."${tablename}" t`,
    );
    data[tablename] = row;
  }
  return data;
}

export async function diagnosisImageKeys(client) {
  const rows =
    await client.$queryRaw`SELECT image_key FROM ai_diagnoses WHERE image_key IS NOT NULL ORDER BY image_key`;
  return rows.map((row) => requireImageKey(row.image_key));
}

async function removeTemporaryImages(target, images) {
  for (const image of images) {
    try {
      await unlink(join(target, image.key));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await rmdir(target);
}

// Exercise copying to an isolated destination; never touch the live image store.
export async function verifyImageBundle(directory, manifest, keys) {
  validateBundle(manifest, keys);
  const sourceRoot = await realpath(join(directory, 'images'));
  requireBackupDirectory(await realpath(directory), sourceRoot);
  const target = await mkdtemp(join(directory, '.restore-images-'));
  try {
    for (const image of manifest.images) {
      const actual = await copyPrivateImage(sourceRoot, target, image.key);
      if (actual.bytes !== image.bytes || actual.sha256 !== image.sha256)
        throw new Error('La integridad de una fotografía no coincide');
    }
    return manifest.images.length;
  } finally {
    // Only internally generated paths in this invocation's private directory.
    await removeTemporaryImages(target, manifest.images);
  }
}
