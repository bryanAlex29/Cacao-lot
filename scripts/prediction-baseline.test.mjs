import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = join(root, 'scripts/prediction-baseline.mjs');
const run = (args, env = {}) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    timeout: 60000,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', ...env },
  });

test(
  'CLI DEMO y reproducción desde input privado producen los mismos artefactos, sin DB ni red',
  { timeout: 120000 },
  async () => {
    const directories = [];
    const accept = (result) => {
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /DEMO/);
      const name = result.stdout.match(/Artefactos privados: (.+)/)?.[1].trim();
      assert.ok(name);
      const directory = resolve(root, name);
      const child = relative(join(root, '.local/prediction-runs'), directory);
      assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
      directories.push(directory);
      return directory;
    };
    try {
      // Invalid URLs must not matter: this CLI never instantiates DB or HTTP clients.
      const first = accept(
        run(['--demo'], {
          DATABASE_URL: 'not-a-database',
          OPENAI_API_KEY: '',
          WEATHER_PROVIDER: 'disabled',
        }),
      );
      const second = accept(run(['--input', join(first, 'input.json')]));
      for (const name of ['input.json', 'dataset.json', 'report.json'])
        assert.deepEqual(
          JSON.parse(await readFile(join(first, name), 'utf8')),
          JSON.parse(await readFile(join(second, name), 'utf8')),
        );
      const report = JSON.parse(await readFile(join(first, 'report.json'), 'utf8'));
      assert.equal(report.fieldValidated, false);
      assert.equal(report.identity.source, 'demo');
      assert.equal(report.zones.length, 3);
      assert.ok(report.zones.every((zone) => zone.validation.samples > 0 && zone.test.samples > 0));
      assert.equal(
        spawnSync('git', ['check-ignore', '--quiet', join(first, 'input.json')], { cwd: root })
          .status,
        0,
      );
    } finally {
      // Only internally generated run directories captured from this test's child processes.
      for (const directory of directories) await rm(directory, { recursive: true, force: true });
    }
  },
);
test(
  'CLI rechaza producción, argumentos extra y entradas fuera de .local',
  { timeout: 120000 },
  () => {
    for (const [args, env] of [
      [['--demo'], { NODE_ENV: 'production' }],
      [['--demo', '--force'], {}],
      [['--input', 'package.json'], {}],
    ]) {
      const result = run(args, env);
      assert.ifError(result.error);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.includes('Artefactos privados:'), false);
    }
  },
);
