import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
const require = createRequire(new URL('package.json', root));
const configRequire = createRequire(require.resolve('@prisma/config'));

test('GHSA-7589-6fvf-x4pw: Prisma config resuelve Effect parcheado sin cambiar Prisma', () => {
  assert.equal(manifest.overrides['@prisma/config@7.10.1'].effect, '3.22.1');
  assert.equal(lock.packages['node_modules/prisma'].version, '7.10.1');
  assert.equal(lock.packages['node_modules/@prisma/client'].version, '7.10.1');
  assert.equal(lock.packages['node_modules/@prisma/config'].version, '7.10.1');
  assert.equal(configRequire('effect/package.json').version, '3.22.1');
});

test('TemplateLiteral rechaza entrada ambigua sin bloqueo del proceso', () => {
  // Run in a child: the vulnerable regex must not hang the test runner itself.
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(${JSON.stringify(new URL('package.json', root).href)});
    const configRequire = createRequire(require.resolve('@prisma/config'));
    const Schema = configRequire('effect/Schema');
    const schema = Schema.TemplateLiteral(Schema.String, ':', Schema.String, ':', Schema.String, 'X');
    const accepts = Schema.is(schema);
    assert.equal(accepts('leaf:fruit:stemX'), true);
    assert.equal(accepts(':'.repeat(5000)), false);
  `,
    ],
    { timeout: 5000, encoding: 'utf8' },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
