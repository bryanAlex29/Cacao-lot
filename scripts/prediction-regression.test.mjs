import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = (args, env = {}) =>
  spawnSync(process.execPath, [join(root, 'scripts/prediction-regression.mjs'), ...args], {
    cwd: root,
    timeout: 60000,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test', ...env },
  });
test(
  'TS → Python/sklearn: entrenamiento DEMO reproducible, mismos heldout y artefactos privados',
  { timeout: 120000 },
  async () => {
    const directories = [];
    const accept = (result) => {
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /DEMO/);
      const path = result.stdout.match(/Artefactos privados: (.+)/)?.[1].trim();
      assert.ok(path);
      const directory = resolve(root, path),
        child = relative(join(root, '.local/prediction-regression-runs'), directory);
      assert.ok(child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
      directories.push(directory);
      return directory;
    };
    try {
      const first = accept(
        run(['--demo'], {
          DATABASE_URL: 'not-a-database',
          WEATHER_PROVIDER: 'disabled',
          OPENAI_API_KEY: '',
        }),
      );
      const second = accept(run(['--input', join(first, 'input.json')]));
      for (const name of ['input.json', 'dataset.json', 'report.json', 'complete.json'])
        assert.deepEqual(
          JSON.parse(await readFile(join(first, name), 'utf8')),
          JSON.parse(await readFile(join(second, name), 'utf8')),
        );
      const report = JSON.parse(await readFile(join(first, 'report.json'), 'utf8'));
      assert.equal(report.fieldValidated, false);
      assert.equal(report.preferredModel, null);
      assert.equal(report.identity.source, 'demo');
      assert.equal(report.runtime.scikitLearn, '1.9.1');
      assert.equal(report.zones.length, 3);
      for (const zone of report.zones) {
        assert.equal(zone.status, 'fitted_experimental');
        assert.equal(zone.artifact.trainSamples, 30);
        for (const partition of ['validation', 'test']) {
          assert.equal(zone[partition].comparisonBasis, 'identical_rows');
          assert.equal(zone[partition].persistence.samples, zone[partition].regression.samples);
          assert.ok(Number.isFinite(zone[partition].regression.maePp));
        }
      }
      assert.equal(
        spawnSync('git', ['check-ignore', '--quiet', join(first, 'report.json')], { cwd: root })
          .status,
        0,
      );
    } finally {
      for (const directory of directories) await rm(directory, { recursive: true, force: true });
    }
  },
);
test(
  'regresión CLI rechaza producción, argumentos arbitrarios y entrada pública',
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
