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
  });
});
