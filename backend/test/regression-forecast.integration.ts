import 'reflect-metadata';
import { randomUUID, createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { TOKEN_ISSUER, TOKEN_AUDIENCE } from '../src/auth/auth.service';
import { publicationsFromRun } from '../src/prediction/regression-artifact';
import { registerRegressionPublication } from '../src/prediction/regression-registration';
import { syntheticRegressionRun } from './fixtures/regression-run';
import { ConfigService } from '@nestjs/config';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, join, relative, isAbsolute, sep } from 'node:path';

describe('Registro e inferencia de regresión con PostgreSQL aislado', () => {
  let app: INestApplication, db: PrismaService;
  let ownerId: string,
    plotId: string,
    deviceId: string,
    token: string,
    other: string,
    otherId: string;
  let run: ReturnType<typeof syntheticRegressionRun>;
  let hash: string;
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  const route = () => `/api/v1/plots/${plotId}/predictions/regression`;
  const query = () => ({ deviceId, source: 'demo', horizonDays: 1 });
  const get = () =>
    request(app.getHttpServer()).get(route()).query(query()).auth(token, { type: 'bearer' });
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo la base temporal del runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const account = async (role: 'FARMER' | 'ADMIN') => {
      const user = await db.user.create({
        data: {
          name: 'Fixture de regresión',
          email: `${randomUUID()}@example.test`,
          passwordHash: 'unused-test-only',
          role,
        },
      });
      return {
        id: user.id,
        token: app.get(JwtService).sign(
          {},
          {
            secret: process.env['JWT_SECRET'],
            subject: user.id,
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE,
            expiresIn: 900,
          },
        ),
      };
    };
    const owner = await account('FARMER');
    ownerId = owner.id;
    token = owner.token;
    const stranger = await account('ADMIN');
    other = stranger.token;
    otherId = stranger.id;
    plotId = (
      await db.plot.create({
        data: { ownerId, name: 'Regresión sintética', locationLabel: 'No es campo real' },
      })
    ).id;
    const device = await db.device.create({
      data: {
        plotId,
        serial: randomUUID(),
        source: 'demo',
        credentialHash: 'a'.repeat(64),
        sensors: {
          create: (['soil_1', 'soil_2', 'soil_3'] as const).map((code, i) => ({
            code,
            variable: 'SOIL_MOISTURE',
            unit: 'PERCENT',
            zone: ['A', 'B', 'C'][i],
          })),
        },
      },
      include: { sensors: true },
    });
    deviceId = device.id;
    run = syntheticRegressionRun(
      { plotId, deviceId, sensors: device.sensors },
      new Date(cutoff.getTime() - 2 * 86400000),
    );
    hash = createHash('sha256').update(JSON.stringify(run.report)).digest('hex');
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('OpenAPI documenta versión, evaluación comparable y ausencia de validación de campo', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    const schema =
      result.body.paths['/api/v1/plots/{id}/predictions/regression'].get.responses['200'].content[
        'application/json'
      ].schema;
    expect(schema.properties.fieldValidated.enum).toEqual([false]);
    expect(schema.properties.zones).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(
      schema.properties.zones.items.properties.model.properties.evaluation.properties.test
        .properties,
    ).toHaveProperty('persistence');
    expect(schema.properties.zones.items.properties).not.toHaveProperty('artifact');
  });
  it('exige sesión, dueño incluso ADMIN y selección estricta sin mezclar origen', async () => {
    await request(app.getHttpServer()).get(route()).query(query()).expect(401);
    await request(app.getHttpServer())
      .get(route())
      .query(query())
      .auth(other, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(route())
      .query({ source: 'demo' })
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get(route())
      .query({ ...query(), source: 'real' })
      .auth(token, { type: 'bearer' })
      .expect(404);
    const result = await get().expect(200);
    expect(result.body.zones.map((z: { reason: string }) => z.reason)).toEqual(
      Array(3).fill('model_not_registered'),
    );
    expect(result.body.waterDemand).toBeNull();
    expect(result.headers['cache-control']).toBe('no-store');
  });
  it('registra las tres versiones privadas atómicamente y reimporta sin sobrescribir', async () => {
    const publication = publicationsFromRun(run.input, run.report, new Date());
    await expect(registerRegressionPublication(db, otherId, publication, hash)).rejects.toThrow();
    expect(await db.predictionModelVersion.count()).toBe(0);
    const first = await registerRegressionPublication(db, ownerId, publication, hash);
    const second = await registerRegressionPublication(db, ownerId, publication, hash);
    expect(second).toEqual(first);
    expect(await db.predictionModelVersion.count()).toBe(3);
    expect((await get().expect(200)).body.zones[0].reason).toBe('missing_features');
  });
  it('dos retardos conocidos al mismo corte: cero y recepción tardía de lag2 sin entrenamiento', async () => {
    const sensors = await db.sensor.findMany({ where: { deviceId }, orderBy: { code: 'asc' } });
    for (const lag of [1, 2]) {
      const time = new Date(cutoff.getTime() - lag * 86400000 + 3600000);
      // lag2 arrived yesterday: usable today, unlike a feature for yesterday's emission.
      await db.reading.create({
        data: {
          deviceId,
          eventId: randomUUID(),
          source: 'demo',
          payloadHash: 'b'.repeat(64),
          recordedAt: time,
          effectiveAt: time,
          receivedAt: new Date(cutoff.getTime() - 3600000),
          timestampOrigin: 'device',
          quality: {},
          soilReadings: {
            create: sensors.map((sensor) => ({
              sensorId: sensor.id,
              quality: 'valid',
              moisturePct: sensor.code === 'soil_1' ? (lag === 1 ? 0 : 40) : 60,
            })),
          },
        },
      });
    }
    const count = await db.reading.count();
    const result = await get().expect(200);
    expect(result.body.zones[0]).toMatchObject({
      reason: 'available',
      predictedPct: 20,
      persistencePct: 0,
    });
    expect(result.body.zones[0].model.evaluation.test.regression.samples).toBe(15);
    expect(result.body.fieldValidated).toBe(false);
    expect(JSON.stringify(result.body)).not.toMatch(
      /coefficientsScaled|reportHash|artifactHash|credentialHash/,
    );
    expect(await db.reading.count()).toBe(count);
    expect(await db.predictionModelVersion.count()).toBe(3);
  });
  it('versión deshabilitada no se reactiva al reimportar y calidad inválida no retrocede', async () => {
    const sensor = await db.sensor.findFirstOrThrow({ where: { deviceId, code: 'soil_1' } });
    await db.predictionModelVersion.updateMany({
      where: { sensorId: sensor.id },
      data: { enabled: false },
    });
    await registerRegressionPublication(
      db,
      ownerId,
      publicationsFromRun(run.input, run.report, new Date()),
      hash,
    );
    expect((await get().expect(200)).body.zones[0].reason).toBe('model_not_registered');
    await db.predictionModelVersion.updateMany({
      where: { sensorId: sensor.id },
      data: { enabled: true },
    });
    const time = new Date(cutoff.getTime() - 1000);
    await db.reading.create({
      data: {
        deviceId,
        eventId: randomUUID(),
        source: 'demo',
        payloadHash: 'c'.repeat(64),
        recordedAt: time,
        effectiveAt: time,
        receivedAt: time,
        timestampOrigin: 'device',
        quality: {},
        soilReadings: { create: { sensorId: sensor.id, quality: 'invalid', moisturePct: null } },
      },
    });
    expect((await get().expect(200)).body.zones[0].reason).toBe('unusable_features');
  });
  it('Python offline → conjunto con hashes → CLI privada → versiones; corrupción y producción rechazadas', async () => {
    const root = resolve(__dirname, '../..');
    const inputFile = join(root, '.local', `test-publish-input-${randomUUID()}.json`);
    let generated: string | undefined;
    const launch = (script: string, args: string[], env = process.env) =>
      spawnSync(process.execPath, [join(root, 'scripts', script), ...args], {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 90000,
      });
    try {
      await writeFile(inputFile, JSON.stringify(run.input), { flag: 'wx', mode: 0o600 });
      const trained = launch('prediction-regression.mjs', ['--input', inputFile]);
      expect(trained.status).toBe(0);
      const output = trained.stdout.match(/Artefactos privados: (.+)/)?.[1].trim();
      expect(output).toBeTruthy();
      const directory = resolve(root, output!);
      const part = relative(join(root, '.local/prediction-regression-runs'), directory);
      if (!part || part === '..' || part.startsWith(`..${sep}`) || isAbsolute(part))
        throw new Error('Salida de prueba no privada');
      generated = directory;
      const before = await db.reading.count();
      const published = launch('publish-regression.mjs', ['--run', directory, '--owner', ownerId]);
      expect(published.status).toBe(0);
      expect(published.stdout).toContain('3 versiones');
      expect(await db.predictionModelVersion.count()).toBe(6);
      expect(await db.reading.count()).toBe(before);
      const repeated = launch('publish-regression.mjs', ['--run', directory, '--owner', ownerId]);
      expect(repeated.status).toBe(0);
      expect(await db.predictionModelVersion.count()).toBe(6);
      expect(
        launch('publish-regression.mjs', ['--run', directory, '--owner', ownerId], {
          ...process.env,
          NODE_ENV: 'production',
        }).status,
      ).not.toBe(0);
      const report = await readFile(join(directory, 'report.json'));
      await writeFile(join(directory, 'report.json'), Buffer.concat([report, Buffer.from(' ')]));
      const corrupt = launch('publish-regression.mjs', ['--run', directory, '--owner', ownerId]);
      expect(corrupt.status).not.toBe(0);
      expect(corrupt.stderr).toContain('integridad');
      expect(await db.predictionModelVersion.count()).toBe(6);
    } finally {
      await rm(inputFile, { force: true });
      if (generated) await rm(generated, { recursive: true, force: true });
    }
  }, 180000);
  it('origen, sensor y parcela conservan guardas después de registrar', async () => {
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await get().expect(403);
    } finally {
      config.set('TELEMETRY_MODE', 'demo');
    }
    await db.sensor.updateMany({ where: { deviceId, code: 'soil_1' }, data: { enabled: false } });
    expect((await get().expect(200)).body.zones[0].reason).toBe('sensor_disabled');
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
    await get().expect(404);
  });
});
