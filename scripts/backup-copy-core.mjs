import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileHash, validateBundle } from './backup-bundle.mjs';
import { readBackupManifest, requireBackupDirectory } from './backup-restore-core.mjs';

function inside(base, path) {
  const part = relative(base, path);
  return !part || (!isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`));
}
export function externalCopyOptions(args) {
  if (
    args.length !== 4 ||
    args[0] !== '--directory' ||
    args[2] !== '--destination' ||
    !args[1] ||
    !isAbsolute(args[3]) ||
    /^[\\/]{2}/.test(args[3]) ||
    /^[a-z]+:\/\//i.test(args[3])
  )
    throw new Error('Usa --directory RESPALDO --destination CARPETA_LOCAL_ABSOLUTA');
  return { directory: args[1], destination: args[3] };
}
async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Solo archivos regulares');
  return info;
}
async function checkedDirectory(path) {
  const info = await lstat(path);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error('No se siguen enlaces de directorios');
}
async function rejectLinkedAncestors(path) {
  let current = resolve(path);
  for (;;) {
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new Error('No se siguen enlaces de destino');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
}
function verifiedReport(value, manifest) {
  return (
    value &&
    typeof value.verifiedAt === 'string' &&
    Number.isFinite(Date.parse(value.verifiedAt)) &&
    value.restoredTablesMatched === Object.keys(manifest.data).length &&
    value.restoredImagesMatched === manifest.images.length &&
    value.archiveHashMatched === true &&
    value.temporaryDatabaseRemoved === true &&
    value.applicationDataRestoredToMain === false &&
    value.applicationImagesRestoredToLive === false
  );
}

/** Copy a completed, previously verified bundle; never restore or overwrite data. */
export async function copyVerifiedBackup({ root, directory, destination }) {
  root = await realpath(root);
  const sourceBase = await realpath(join(root, '.local/backups'));
  const requested = resolve(root, directory);
  requireBackupDirectory(sourceBase, requested);
  if (
    !/^bundle-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z-[a-f0-9]{16}$/.test(
      basename(requested),
    ) ||
    relative(sourceBase, requested) !== basename(requested)
  )
    throw new Error('Solo conjuntos fechados del área privada');
  await checkedDirectory(requested);
  const source = await realpath(requested);
  if (source !== requested) throw new Error('No se siguen enlaces del origen');
  const sourceImages = join(source, 'images');
  await checkedDirectory(sourceImages);
  if ((await regular(join(source, 'before.json'))).size > 16 * 1024 * 1024)
    throw new Error('Manifiesto demasiado grande');
  const manifestBytes = await readFile(join(source, 'before.json'));
  const manifestHash = createHash('sha256').update(manifestBytes).digest('hex');
  const manifest = readBackupManifest(JSON.parse(manifestBytes.toString('utf8')));
  validateBundle(manifest, manifest.images?.map((image) => image.key) ?? []);
  const entries = (await readdir(source)).sort();
  const reports = entries.filter((entry) => /^restore-check-[a-f0-9]{16}\.json$/.test(entry));
  if (
    !reports.length ||
    entries.some((entry) => !['before.json', 'database.dump', 'images', ...reports].includes(entry))
  )
    throw new Error('El conjunto debe estar verificado y no contener archivos adicionales');
  const reportHashes = new Map();
  for (const report of reports) {
    const path = join(source, report);
    const info = await regular(path);
    if (info.size > 65536) throw new Error('Informe demasiado grande');
    const bytes = await readFile(path);
    if (!verifiedReport(JSON.parse(bytes.toString('utf8')), manifest))
      throw new Error('Informe de recuperación no compatible');
    reportHashes.set(report, createHash('sha256').update(bytes).digest('hex'));
  }
  const imageKeys = manifest.images.map((image) => image.key).sort();
  if (JSON.stringify((await readdir(sourceImages)).sort()) !== JSON.stringify(imageKeys))
    throw new Error('Inventario de fotografías no coincide');
  await regular(join(source, 'database.dump'));
  if ((await fileHash(join(source, 'database.dump'))) !== manifest.dumpHash)
    throw new Error('La integridad del respaldo original no coincide');

  if (!isAbsolute(destination) || /^[\\/]{2}/.test(destination))
    throw new Error('Destino local absoluto requerido');
  const targetBase = resolve(destination);
  if (inside(root, targetBase) || inside(targetBase, root))
    throw new Error('La segunda copia debe estar fuera del proyecto y de sus antecesores');
  await rejectLinkedAncestors(targetBase);
  await mkdir(targetBase, { recursive: true, mode: 0o700 });
  const canonicalTarget = await realpath(targetBase);
  if (canonicalTarget !== targetBase) throw new Error('No se siguen destinos enlazados');
  const target = join(targetBase, basename(source));
  await mkdir(target, { mode: 0o700 }); // EEXIST fails; never reuse a directory.
  await mkdir(join(target, 'images'), { mode: 0o700 });
  const files = [];
  const imageByName = new Map(manifest.images.map((image) => [join('images', image.key), image]));
  for (const name of [
    'before.json',
    'database.dump',
    ...reports,
    ...imageKeys.map((key) => join('images', key)),
  ]) {
    const from = join(source, name),
      to = join(target, name);
    const before = await regular(from);
    const expected = await fileHash(from);
    if (
      (name === 'database.dump' && expected !== manifest.dumpHash) ||
      (name === 'before.json' && expected !== manifestHash) ||
      (reportHashes.has(name) && expected !== reportHashes.get(name))
    )
      throw new Error('El respaldo o los metadatos cambiaron durante la copia');
    const image = imageByName.get(name);
    if (image && (image.bytes !== before.size || image.sha256 !== expected))
      throw new Error('La integridad de una fotografía original no coincide');
    await copyFile(from, to, constants.COPYFILE_EXCL);
    await chmod(to, 0o600);
    if (
      (await regular(to)).size !== before.size ||
      (await fileHash(to)) !== expected ||
      (await fileHash(from)) !== expected
    )
      throw new Error('La copia no coincide o el origen cambió');
    files.push({ name: name.split(sep).join('/'), bytes: before.size, sha256: expected });
  }
  if (
    JSON.stringify((await readdir(source)).sort()) !== JSON.stringify(entries) ||
    JSON.stringify((await readdir(sourceImages)).sort()) !== JSON.stringify(imageKeys)
  )
    throw new Error('El inventario del origen cambió durante la copia');
  // Last marker: a failed copy intentionally has no completion report.
  await writeFile(
    join(target, 'copy-check.json'),
    JSON.stringify(
      {
        copyVersion: 1,
        checkedAt: new Date().toISOString(),
        bundle: basename(source),
        files,
        allHashesMatched: true,
        databaseRestored: false,
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  return { directory: target, files: files.length };
}
