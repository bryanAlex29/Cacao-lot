import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuthService } from '../src/auth/auth.service';
import { coverageWindow } from '../src/prediction/prediction.service';
import { parsePersistenceInput } from '../src/prediction/offline/persistence-input';
import { buildPersistenceDataset } from '../src/prediction/offline/persistence-dataset';
import { buildRegressionDataset } from '../src/prediction/offline/regression-dataset';
import { PredictionRepository } from '../src/prediction/prediction.repository';

describe('Disponibilidad de predicción con PostgreSQL aislado, sin modelos ni red externa', () => {
  let app: INestApplication, db: PrismaService;
  let owner: Awaited<ReturnType<typeof account>>, stranger: Awaited<ReturnType<typeof account>>;
  let deviceId: string;
  const password = 'Prediction-test!';
  async function account(role: 'ADMIN' | 'FARMER') {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        name: 'Predicción sintética',
        role,
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    const plot = await db.plot.create({
      data: { ownerId: user.id, name: 'Predicción de prueba', locationLabel: 'Sin ubicación real' },
    });
    return {
      user,
      plot,
      token: (await app.get(AuthService).login({ email: user.email, password })).body
        .accessToken as string,
    };
  }
  const path = () => `/api/v1/plots/${owner.plot.id}/predictions`;
  const get = (query: Record<string, string | number | undefined> = { source: 'demo', deviceId }) =>
    request(app.getHttpServer()).get(path()).query(query).auth(owner.token, { type: 'bearer' });
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    owner = await account('FARMER');
    stranger = await account('ADMIN');
    const device = await db.device.create({
      data: {
        plotId: owner.plot.id,
        serial: randomUUID(),
        credentialHash: 'a'.repeat(64),
        source: 'demo',
        sensors: {
          create: [
            { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
            { code: 'soil_2', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'B' },
            { code: 'soil_3', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'C' },
          ],
        },
      },
      include: { sensors: true },
    });
    deviceId = device.id;
    const { from, to } = coverageWindow(new Date());
    const moments = [
      from.getTime() - 1,
      from.getTime(),
      from.getTime() + 3600000,
      from.getTime() + 86400000,
      to.getTime() - 1,
      to.getTime(),
      from.getTime() + 2 * 86400000,
    ];
    for (const [index, time] of moments.entries()) {
      await db.reading.create({
        data: {
          deviceId,
          eventId: `fixture-${index}`,
          payloadHash: 'b'.repeat(64),
          recordedAt: new Date(time),
          effectiveAt: new Date(time),
          receivedAt: index === 6 ? new Date(Date.now() + 86400000) : new Date(),
          timestampOrigin: 'device',
          source: 'demo',
          quality: {},
          soilReadings: {
            create: device.sensors.map((sensor) => ({
              sensorId: sensor.id,
              moisturePct:
                sensor.code === 'soil_1'
                  ? index === 1
                    ? 0
                    : 40
                  : sensor.code === 'soil_2'
                    ? index === 2
                      ? 50
                      : index === 3
                        ? 200
                        : null
                    : index === 1
                      ? 22
                      : null,
              quality:
                sensor.code === 'soil_1'
                  ? 'valid'
                  : sensor.code === 'soil_2'
                    ? index === 2
                      ? 'valid'
                      : index === 3
                        ? 'invalid'
                        : 'missing'
                    : index === 1
                      ? 'uncalibrated'
                      : 'missing',
            })),
          },
        },
      });
    }
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('exige JWT y propiedad incluso para ADMIN ajeno', async () => {
    await request(app.getHttpServer()).get(path()).expect(401);
    await request(app.getHttpServer())
      .get(path())
      .auth(stranger.token, { type: 'bearer' })
      .expect(404);
  });
  it('FARMER consulta cobertura propia, conserva cero válido, null/invalid/uncalibrated y días distintos', async () => {
    const response = await get().expect(200);
    expect(response.body).toMatchObject({
      status: 'unavailable',
      reason: 'model_not_implemented',
      source: 'demo',
      predictions: [],
      model: null,
      waterDemand: null,
      device: { id: deviceId },
    });
    expect(response.body.zones).toMatchObject([
      { code: 'soil_1', samples: 4, validSamples: 4, validDaysUtc: 3 },
      { code: 'soil_2', samples: 4, validSamples: 1, validDaysUtc: 1 },
      {
        code: 'soil_3',
        samples: 4,
        validSamples: 0,
        validDaysUtc: 0,
        firstValidAt: null,
        lastValidAt: null,
      },
    ]);
    expect(response.body.target).toEqual({ variable: 'soil_moisture', unit: '%', horizonDays: 1 });
  });
  it('no mezcla DEMO con REAL ni filtra el dispositivo por identificador ajeno', async () => {
    const empty = await get({}).expect(200);
    expect(empty.body.source).toBe('real');
    expect(empty.body.device).toBeNull();
    await get({ source: 'real', deviceId }).expect(404);
    await get({ source: 'demo', deviceId: randomUUID() }).expect(404);
  });
  it.each([
    { horizonDays: 7 },
    { horizonDays: 0 },
    { horizonDays: 'bad' },
    { source: 'mixed' },
    { deviceId: 'bad' },
    { ownerId: 'client' },
  ])('rechaza consulta no soportada %j', async (query) => {
    await get({ source: 'demo', deviceId, ...query }).expect(400);
  });
  it('respeta el modo de origen y no ofrece fallback', async () => {
    const config = app.get(ConfigService);
    const previous = config.get('TELEMETRY_MODE');
    try {
      config.set('TELEMETRY_MODE', 'real');
      await get().expect(403);
    } finally {
      config.set('TELEMETRY_MODE', previous);
    }
  });
  it('no altera lecturas, diagnósticos ni clima al consultar repetidamente', async () => {
    const before = [
      await db.reading.count(),
      await db.aiDiagnosis.count(),
      await db.weatherObservation.count(),
    ];
    await get().expect(200);
    await get().expect(200);
    expect([
      await db.reading.count(),
      await db.aiDiagnosis.count(),
      await db.weatherObservation.count(),
    ]).toEqual(before);
  });
  const exportQuery = () => {
    const { from, to } = coverageWindow(new Date());
    return {
      source: 'demo',
      deviceId,
      from: from.toISOString().slice(0, 10),
      trainUntil: new Date(from.getTime() + 10 * 86400000).toISOString().slice(0, 10),
      validationUntil: new Date(from.getTime() + 20 * 86400000).toISOString().slice(0, 10),
      toExclusive: to.toISOString().slice(0, 10),
    };
  };
  const exportPath = () => `${path()}/offline-input.json`;
  const download = (query = exportQuery()) =>
    request(app.getHttpServer())
      .get(exportPath())
      .query(query)
      .auth(owner.token, { type: 'bearer' });

  it('exportación exige JWT, parcela propia incluso ADMIN, dispositivo y origen explícitos', async () => {
    await request(app.getHttpServer()).get(exportPath()).query(exportQuery()).expect(401);
    await request(app.getHttpServer())
      .get(exportPath())
      .query(exportQuery())
      .auth(stranger.token, { type: 'bearer' })
      .expect(404);
    await download({ ...exportQuery(), source: 'real' }).expect(404);
    await download({ ...exportQuery(), deviceId: randomUUID() }).expect(404);
    for (const field of [
      'source',
      'deviceId',
      'from',
      'trainUntil',
      'validationUntil',
      'toExclusive',
    ]) {
      const query: Record<string, string> = { ...exportQuery() };
      delete query[field];
      await request(app.getHttpServer())
        .get(exportPath())
        .query(query)
        .auth(owner.token, { type: 'bearer' })
        .expect(400);
    }
  });
  it('exporta contrato canónico privado, cero/null/calidad, sin filas futuras ni secretos o escrituras', async () => {
    const count = await db.reading.count();
    const response = await download().expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-disposition']).toContain('attachment;');
    expect(response.headers['content-type']).toContain('application/json');
    const input = parsePersistenceInput(response.body);
    // Two lookback days include fixture-0; future receipt and upper boundary stay out.
    expect(input.observations).toHaveLength(15);
    expect(input.observations.some((row) => row.eventId === 'fixture-0')).toBe(true);
    expect(input.observations.some((row) => ['fixture-5', 'fixture-6'].includes(row.eventId))).toBe(
      false,
    );
    expect(
      input.observations.find((row) => row.eventId === 'fixture-1' && row.code === 'soil_1'),
    ).toMatchObject({ moisturePct: 0, quality: 'valid' });
    expect(
      input.observations.find((row) => row.eventId === 'fixture-3' && row.code === 'soil_2'),
    ).toMatchObject({ moisturePct: null, quality: 'invalid' });
    expect(
      input.observations.find((row) => row.eventId === 'fixture-1' && row.code === 'soil_3'),
    ).toMatchObject({ moisturePct: 22, quality: 'uncalibrated' });
    expect(JSON.stringify(input)).not.toMatch(
      /credentialHash|passwordHash|payloadHash|calibrationMetadata|ownerId|refreshHash|accessToken/,
    );
    expect(buildPersistenceDataset(input).dataset.samples).toEqual([]);
    expect(buildRegressionDataset(input).dataset.samples).toEqual([]);
    expect(await db.reading.count()).toBe(count);
  });
  it.each([
    { from: '2026-02-30' },
    { toExclusive: '2999-01-01' },
    { trainUntil: '2000-01-01' },
    { ownerId: 'client' },
    { asOf: '2999-01-01' },
  ])('exportación rechaza cortes o campos no admitidos %j', async (extra) => {
    await request(app.getHttpServer())
      .get(exportPath())
      .query({ ...exportQuery(), ...extra })
      .auth(owner.token, { type: 'bearer' })
      .expect(400);
  });
  it('exportación respeta SourcePolicy sin fallback', async () => {
    const config = app.get(ConfigService),
      previous = config.get('TELEMETRY_MODE');
    try {
      config.set('TELEMETRY_MODE', 'real');
      await download().expect(403);
    } finally {
      config.set('TELEMETRY_MODE', previous);
    }
  });
  it('exportación alimenta ambos evaluadores con cortes cronológicos y dos retardos sin red ni entrenamiento', async () => {
    const device = await db.device.create({
      data: {
        plotId: owner.plot.id,
        serial: randomUUID(),
        credentialHash: 'e'.repeat(64),
        source: 'demo',
        sensors: {
          create: [
            { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
            { code: 'soil_2', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'B' },
            { code: 'soil_3', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'C' },
          ],
        },
      },
      include: { sensors: true },
    });
    const start = Date.parse('2026-01-03T00:00:00.000Z');
    for (let day = -3; day <= 6; day++) {
      const at = new Date(start + day * 86400000 + 12 * 3600000);
      await db.reading.create({
        data: {
          deviceId: device.id,
          eventId: `chronological-${day}`,
          payloadHash: 'f'.repeat(64),
          recordedAt: at,
          receivedAt: at,
          effectiveAt: at,
          timestampOrigin: 'device',
          source: 'demo',
          quality: {},
          soilReadings: {
            create: device.sensors.map((sensor, index) => ({
              sensorId: sensor.id,
              moisturePct: 30 + index + day,
              quality: 'valid',
            })),
          },
        },
      });
    }
    const response = await download({
      source: 'demo',
      deviceId: device.id,
      from: '2026-01-03',
      trainUntil: '2026-01-05',
      validationUntil: '2026-01-07',
      toExclusive: '2026-01-09',
    }).expect(200);
    const input = parsePersistenceInput(response.body);
    expect(input.observations).toHaveLength(24);
    const baseline = buildPersistenceDataset(input).dataset;
    const regression = buildRegressionDataset(input).dataset;
    expect(baseline.samples).toHaveLength(18);
    expect(regression.samples).toHaveLength(18);
    for (const partition of ['train', 'validation', 'test'])
      expect(regression.samples.filter((sample) => sample.partition === partition)).toHaveLength(6);
    expect(regression.samples[0].lag2Evidence.eventId).toBe('chronological--2');
    expect(
      regression.samples.every(
        (sample) =>
          sample.featureEvidence.availableAt < sample.issuedAt &&
          sample.lag2Evidence.availableAt < sample.issuedAt,
      ),
    ).toBe(true);
    // The device cannot be silently re-labelled REAL in an export.
    await download({ ...exportQuery(), deviceId: device.id, source: 'real' }).expect(404);
  });
  it('exporta vacío sin inventar observaciones y bloquea al propietario inactivo', async () => {
    const empty = await db.device.create({
      data: {
        plotId: owner.plot.id,
        serial: randomUUID(),
        source: 'real',
        credentialHash: '1'.repeat(64),
      },
    });
    const response = await download({
      ...exportQuery(),
      source: 'real',
      deviceId: empty.id,
    }).expect(200);
    expect(parsePersistenceInput(response.body).observations).toEqual([]);
    await db.user.update({ where: { id: owner.user.id }, data: { isActive: false } });
    try {
      await download().expect(401);
    } finally {
      await db.user.update({ where: { id: owner.user.id }, data: { isActive: true } });
    }
  });
  it('ADMIN exporta solo su propia parcela, sin acceso global', async () => {
    const device = await db.device.create({
      data: {
        plotId: stranger.plot.id,
        serial: randomUUID(),
        source: 'demo',
        credentialHash: '2'.repeat(64),
      },
    });
    const response = await request(app.getHttpServer())
      .get(`/api/v1/plots/${stranger.plot.id}/predictions/offline-input.json`)
      .query({ ...exportQuery(), deviceId: device.id })
      .auth(stranger.token, { type: 'bearer' })
      .expect(200);
    expect(parsePersistenceInput(response.body)).toMatchObject({
      plotId: stranger.plot.id,
      deviceId: device.id,
      source: 'demo',
      observations: [],
    });
  });
  it('HTTP 413 no entrega un adjunto parcial al exceder el límite', async () => {
    const spy = jest.spyOn(app.get(PredictionRepository), 'exportOffline').mockResolvedValueOnce({
      sensors: [],
      observations: new Array(100001),
    });
    try {
      const response = await download().expect(413);
      expect(response.headers['content-disposition']).toBeUndefined();
      expect(response.body.observations).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it('exportación conserva históricos de equipo/sonda deshabilitados y recordedAt null', async () => {
    const { from } = coverageWindow(new Date());
    const sensor = await db.sensor.findFirstOrThrow({ where: { deviceId, code: 'soil_1' } });
    const moment = new Date(from.getTime() + 3 * 86400000);
    await db.reading.create({
      data: {
        deviceId,
        eventId: 'server-time',
        payloadHash: 'd'.repeat(64),
        recordedAt: null,
        effectiveAt: moment,
        receivedAt: moment,
        timestampOrigin: 'server',
        source: 'demo',
        quality: {},
        soilReadings: { create: { sensorId: sensor.id, moisturePct: null, quality: 'missing' } },
      },
    });
    await db.device.update({ where: { id: deviceId }, data: { isActive: false } });
    await db.sensor.update({ where: { id: sensor.id }, data: { enabled: false } });
    try {
      const response = await download().expect(200);
      expect(
        response.body.observations.find(
          (row: { eventId: string }) => row.eventId === 'server-time',
        ),
      ).toMatchObject({
        recordedAt: null,
        receivedAt: moment.toISOString(),
        quality: 'missing',
        moisturePct: null,
      });
    } finally {
      await db.device.update({ where: { id: deviceId }, data: { isActive: true } });
      await db.sensor.update({ where: { id: sensor.id }, data: { enabled: true } });
      await db.reading.deleteMany({ where: { deviceId, eventId: 'server-time' } });
    }
  });
  it('varios equipos exigen selección; sensor/equipo deshabilitado conserva histórico sin declarar disponibilidad', async () => {
    await db.device.create({
      data: {
        plotId: owner.plot.id,
        serial: randomUUID(),
        credentialHash: 'c'.repeat(64),
        source: 'demo',
      },
    });
    await get({ source: 'demo' }).expect(409);
    await db.device.update({ where: { id: deviceId }, data: { isActive: false } });
    await db.sensor.updateMany({ where: { deviceId, code: 'soil_1' }, data: { enabled: false } });
    const response = await get().expect(200);
    expect(response.body.device.isActive).toBe(false);
    expect(response.body.zones[0]).toMatchObject({ enabled: false, validSamples: 4 });
    expect(response.body.status).toBe('unavailable');
  });
  it('archivar parcela bloquea consulta propia y no expone credenciales o metadata privada', async () => {
    const response = await get().expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /credentialHash|passwordHash|calibrationMetadata|ownerId/,
    );
    await db.plot.update({ where: { id: owner.plot.id }, data: { archivedAt: new Date() } });
    await get().expect(404);
    await download().expect(404);
  });
});
