import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  rmdir,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileHash } from './backup-bundle.mjs';
import { copyVerifiedBackup, externalCopyOptions } from './backup-copy-core.mjs';

const name = 'bundle-2026-11-25T03-00-00.000Z-0123456789abcdef';
const key = '01234567-89ab-cdef-0123-456789abcdef.jpg';
async function fixture(t) {
  const base = resolve('.local/backups');
  await mkdir(base, { recursive: true });
  const temporary = await mkdtemp(join(base, 'unit-external-copy-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, 'project'),
    destination = join(temporary, 'second-disk');
  const directory = join(root, '.local/backups', name);
  await mkdir(join(directory, 'images'), { recursive: true });
  await writeFile(join(directory, 'database.dump'), 'synthetic dump bytes, not a real database');
  await writeFile(join(directory, 'images', key), 'synthetic jpeg bytes');
  const manifest = {
    backupVersion: 2,
    createdAt: '2026-11-25T03:00:00.000Z',
    dumpHash: await fileHash(join(directory, 'database.dump')),
    data: { users: { count: '1', fingerprint: 'a'.repeat(32) } },
    images: [
      {
        key,
        bytes: Buffer.byteLength('synthetic jpeg bytes'),
        sha256: await fileHash(join(directory, 'images', key)),
      },
    ],
  };
  const report = {
    verifiedAt: '2026-11-25T03:01:00.000Z',
    restoredTablesMatched: 1,
    restoredImagesMatched: 1,
    archiveHashMatched: true,
    temporaryDatabaseRemoved: true,
    applicationDataRestoredToMain: false,
    applicationImagesRestoredToLive: false,
  };
  const reportPath = join(directory, 'restore-check-0123456789abcdef.json');
  const saveManifest = () => writeFile(join(directory, 'before.json'), JSON.stringify(manifest));
  await saveManifest();
  await writeFile(reportPath, JSON.stringify(report));
  return { root, directory, destination, temporary, manifest, report, reportPath, saveManifest };
}
test('destino absoluto explícito, sin URLs/UNC/argumentos ambiguos', () => {
  const destination = resolve('external-test');
  assert.deepEqual(externalCopyOptions(['--directory', 'source', '--destination', destination]), {
    directory: 'source',
    destination,
  });
  for (const args of [
    [],
    ['--directory', 'source'],
    ['--directory', 'source', '--destination', 'relative'],
    ['--directory', 'source', '--destination', 'https://example.test'],
    ['--directory', 'source', '--destination', '\\\\host\\share'],
    ['--directory', 'source', '--destination', '//host/share'],
    ['--directory', 'source', '--destination', destination, '--force'],
    ['--destination', destination, '--directory', 'source'],
  ])
    assert.throws(() => externalCopyOptions(args));
});
test('copia completa idéntica, marcador final y segundo intento sin sobrescritura', async (t) => {
  const f = await fixture(t);
  const result = await copyVerifiedBackup(f);
  assert.equal(result.directory, join(f.destination, name));
  assert.equal(result.files, 4);
  const check = JSON.parse(await readFile(join(result.directory, 'copy-check.json'), 'utf8'));
  assert.equal(check.allHashesMatched, true);
  assert.equal(check.databaseRestored, false);
  assert.equal(check.files.length, 4);
  for (const file of check.files)
    assert.equal(
      await fileHash(join(result.directory, file.name)),
      await fileHash(join(f.directory, file.name)),
    );
  const original = await readFile(join(result.directory, 'database.dump'), 'utf8');
  await assert.rejects(copyVerifiedBackup(f), { code: 'EEXIST' });
  assert.equal(await readFile(join(result.directory, 'database.dump'), 'utf8'), original);
  assert.equal((await readdir(f.directory)).includes('copy-check.json'), false);
});
for (const [label, mutate] of [
  ['dump corrupto', async (f) => writeFile(join(f.directory, 'database.dump'), 'corrupted')],
  ['sin verificación previa', async (f) => rm(f.reportPath)],
  [
    'informe no aprobado',
    async (f) =>
      writeFile(f.reportPath, JSON.stringify({ ...f.report, archiveHashMatched: false })),
  ],
  [
    'restauración principal no permitida',
    async (f) =>
      writeFile(f.reportPath, JSON.stringify({ ...f.report, applicationDataRestoredToMain: true })),
  ],
  [
    'conteo no coincide',
    async (f) => writeFile(f.reportPath, JSON.stringify({ ...f.report, restoredTablesMatched: 2 })),
  ],
  [
    'archivo adicional privado',
    async (f) => writeFile(join(f.directory, 'extra.env'), 'synthetic secret, never copied'),
  ],
  [
    'imagen adicional',
    async (f) => writeFile(join(f.directory, 'images', 'extra.jpg'), 'synthetic'),
  ],
  [
    'clave de imagen con escape',
    async (f) => {
      f.manifest.images[0].key = '../bad.jpg';
      await f.saveManifest();
    },
  ],
  [
    'formato antiguo',
    async (f) => {
      f.manifest.backupVersion = 1;
      await f.saveManifest();
    },
  ],
])
  test(`rechaza origen inseguro antes de copiar: ${label}`, async (t) => {
    const f = await fixture(t);
    await mutate(f);
    await assert.rejects(copyVerifiedBackup(f));
    await assert.rejects(access(f.destination), { code: 'ENOENT' });
  });
test('fotografía corrupta no genera marcador de copia completa ni modifica el original', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.directory, 'images', key), 'corrupted image');
  await assert.rejects(copyVerifiedBackup(f), /fotografía/);
  await assert.rejects(access(join(f.destination, name, 'copy-check.json')), { code: 'ENOENT' });
  assert.equal(await readFile(join(f.directory, 'images', key), 'utf8'), 'corrupted image');
});
test('no permite copiar dentro del proyecto, sus antecesores o desde un área pública', async (t) => {
  const f = await fixture(t);
  for (const destination of [f.root, join(f.root, 'copies'), f.temporary])
    await assert.rejects(copyVerifiedBackup({ ...f, destination }), /fuera/);
  await assert.rejects(copyVerifiedBackup({ ...f, directory: f.destination }));
});
test('rechaza directorios enlazados en imágenes y destino, sin seguirlos', async (t) => {
  const f = await fixture(t);
  const other = join(f.temporary, 'other-images');
  await mkdir(other);
  await rm(join(f.directory, 'images', key));
  await rmdir(join(f.directory, 'images'));
  await symlink(
    other,
    join(f.directory, 'images'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await assert.rejects(copyVerifiedBackup(f), /enlaces/);
  const g = await fixture(t);
  const actual = join(g.temporary, 'actual-destination');
  await mkdir(actual);
  await symlink(actual, g.destination, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyVerifiedBackup(g), /enlaces/);
  assert.deepEqual(await readdir(actual), []);
});
