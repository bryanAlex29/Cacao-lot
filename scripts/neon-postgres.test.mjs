import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  nativeEnvironment,
  neonSource,
  postgresTools,
  runPostgres,
  temporaryNeonDatabase,
} from './neon-postgres.mjs';

const env = {
  NODE_ENV: 'development',
  DATABASE_URL:
    'postgresql://synthetic:example@ep-synthetic-pooler.c-1.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require',
};
test('Neon exige TLS verificado, entorno no productivo y un único destino', () => {
  assert.equal(neonSource(env).pathname, '/neondb');
  assert.equal(neonSource(env).hostname, 'ep-synthetic.c-1.us-east-2.aws.neon.tech');
  assert.equal(env.DATABASE_URL.includes('-pooler.'), true, 'No modifica el entorno de la API');
  for (const value of [
    { NODE_ENV: 'production' },
    { DATABASE_URL: env.DATABASE_URL.replace('verify-full', 'require') },
    { DATABASE_URL: env.DATABASE_URL.replace('.neon.tech', '.neon.tech.evil.test') },
    { DATABASE_URL: env.DATABASE_URL.replace('postgresql:', 'https:') },
    { DATABASE_URL: env.DATABASE_URL.replace('/neondb?', ':5433/neondb?') },
    { DATABASE_URL: `${env.DATABASE_URL}&host=other.test` },
    { DATABASE_URL: `${env.DATABASE_URL}&sslrootcert=/other` },
    { DATABASE_URL: `${env.DATABASE_URL}&schema=private` },
    { DATABASE_URL: `${env.DATABASE_URL}&connect_timeout=0` },
    { DATABASE_URL: `${env.DATABASE_URL}&sslmode=disable` },
    { DATABASE_URL: `${env.DATABASE_URL}#fragment` },
    { DATABASE_URL: 'invalid' },
  ])
    assert.throws(() => neonSource({ ...env, ...value }));
});
test('acepta endpoint directo y timeout limitado sin relajar las guardas locales', () => {
  const direct = env.DATABASE_URL.replace('-pooler.', '.');
  assert.equal(
    neonSource({ ...env, DATABASE_URL: `${direct}&connect_timeout=120` }).hostname,
    'ep-synthetic.c-1.us-east-2.aws.neon.tech',
  );
  assert.throws(() => neonSource({ ...env, DATABASE_URL: `${direct}&connect_timeout=121` }));
  assert.throws(() =>
    neonSource({ ...env, DATABASE_URL: direct.replace('synthetic:example', 'synthetic:') }),
  );
});
test('libpq recibe TLS y secretos por entorno, sin redirecciones heredadas ni sobrescritura', async (t) => {
  const base = resolve('.local/backups');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, 'unit-neon-env-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'ca.pem');
  const source = neonSource(env);
  const result = await nativeEnvironment(source, file, {
    PATH: 'preserved',
    PGHOST: 'evil.test',
    PGPASSWORD: 'old',
    PGSERVICE: 'evil',
    PGOPTIONS: '-c search_path=other',
    PGPASSFILE: 'old',
    PGSSLMODE: 'disable',
  });
  assert.equal(result.PATH, 'preserved');
  assert.equal(result.PGHOST, source.hostname);
  assert.equal(result.PGPASSWORD, 'example');
  assert.equal(result.PGSSLMODE, 'verify-full');
  assert.equal(result.PGCHANNELBINDING, 'require');
  assert.equal(result.PGOPTIONS, undefined);
  assert.equal(result.PGSERVICE, undefined);
  assert.equal(result.PGPASSFILE, undefined);
  assert.match(await readFile(file, 'utf8'), /BEGIN CERTIFICATE/);
  await assert.rejects(nativeEnvironment(source, file), { code: 'EEXIST' });
  await assert.rejects(postgresTools({ PG_BIN: 'relative/path' }), /absoluta/);
});
test('los errores de herramientas nunca incluyen stderr privado', async () => {
  await assert.rejects(
    runPostgres(
      process.execPath,
      ['-e', 'console.error("synthetic-private-secret");process.exit(1)', '--'],
      process.env,
    ),
    (error) =>
      error.message.includes('falló') && !error.message.includes('synthetic-private-secret'),
  );
});
test('solo se generan bases temporales y nunca se permite borrar la fuente', () => {
  const source = neonSource(env);
  const name = 'cacaosmart_restore_0123456789abcdef';
  assert.equal(temporaryNeonDatabase(name, source).pathname, `/${name}`);
  for (const name of [
    'neondb',
    'postgres',
    'cacaosmart_restore_bad',
    'a"; DROP DATABASE neondb;--',
  ])
    assert.throws(() => temporaryNeonDatabase(name, source));
  const collision = new URL(source);
  collision.pathname = `/${name}`;
  assert.throws(() => temporaryNeonDatabase(name, collision));
  assert.throws(() => temporaryNeonDatabase(name, source, 'arbitrary_'));
});
