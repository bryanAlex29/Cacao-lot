import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { TOKEN_ISSUER, TOKEN_AUDIENCE } from '../src/auth/auth.service';

describe('Pronóstico de referencia autorizado con PostgreSQL real aislado', () => {
  let app: INestApplication, db: PrismaService;
  let plotId: string, deviceId: string, sensorId: string, token: string, other: string;
  const day = 86400000;
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  const path = () => `/api/v1/plots/${plotId}/predictions/experimental`;
  const query = () => ({ deviceId, source: 'demo', horizonDays: 1 });
  const get = () =>
    request(app.getHttpServer()).get(path()).query(query()).auth(token, { type: 'bearer' });
  async function sample(
    daysBefore: number,
    hour: number,
    value: number | null,
    quality: 'valid' | 'invalid' | 'missing' | 'uncalibrated' = 'valid',
    receivedAt?: Date,
  ) {
    const at = new Date(cutoff.getTime() - daysBefore * day + hour * 3600000);
    return db.reading.create({
      data: {
        deviceId,
        eventId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        recordedAt: at,
        effectiveAt: at,
        receivedAt: receivedAt ?? at,
        timestampOrigin: 'device',
        source: 'demo',
        quality: {},
        soilReadings: { create: { sensorId, moisturePct: value, quality } },
      },
    });
  }
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
          name: 'Fixture experimental',
          email: `${randomUUID()}@example.test`,
          passwordHash: 'unused-test-only',
          role,
        },
      });
      const jwt = app.get(JwtService).sign(
        {},
        {
          secret: process.env['JWT_SECRET'],
          subject: user.id,
          issuer: TOKEN_ISSUER,
          audience: TOKEN_AUDIENCE,
          expiresIn: 900,
        },
      );
      return { user, jwt };
    };
    const owner = await account('FARMER');
    token = owner.jwt;
    other = (await account('ADMIN')).jwt;
    const plot = await db.plot.create({
      data: { ownerId: owner.user.id, name: 'Fixture de humedad', locationLabel: 'Sin campo real' },
    });
    plotId = plot.id;
    const device = await db.device.create({
      data: {
        plotId,
        serial: randomUUID(),
        credentialHash: 'b'.repeat(64),
        source: 'demo',
        sensors: {
          create: { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
        },
      },
      include: { sensors: true },
    });
    deviceId = device.id;
    sensorId = device.sensors[0].id;
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('OpenAPI documenta el contrato, tres zonas, nulls y ausencia de validación de campo', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    const route = response.body.paths['/api/v1/plots/{id}/predictions/experimental'].get;
    const schema = route.responses['200'].content['application/json'].schema;
    expect(schema.required).toContain('informationCutoff');
    expect(schema.properties.model.properties.fieldValidated.enum).toEqual([false]);
    expect(schema.properties.zones).toMatchObject({ minItems: 3, maxItems: 3 });
    expect(schema.properties.zones.items.properties.predictedPct).toMatchObject({
      minimum: 0,
      maximum: 100,
      nullable: true,
    });
    expect(schema.properties.waterDemand.enum).toEqual([null]);
  });
  it('exige JWT, propietario incluso ADMIN ajeno, equipo explícito y origen correcto', async () => {
    await request(app.getHttpServer()).get(path()).query(query()).expect(401);
    await request(app.getHttpServer())
      .get(path())
      .query(query())
      .auth(other, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(path())
      .query({ source: 'demo' })
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get(path())
      .query({ ...query(), source: 'real' })
      .auth(token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(path())
      .query({ ...query(), horizonDays: 7 })
      .auth(token, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get(path())
      .query({ ...query(), ownerId: 'spoof' })
      .auth(token, { type: 'bearer' })
      .expect(400);
  });
  it('sin registros devuelve motivos, cero pares y métricas null', async () => {
    const response = await get().expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.status).toBe('unavailable');
    expect(response.body.zones[0]).toMatchObject({
      reason: 'missing_previous_day',
      predictedPct: null,
      evaluation: { samples: 0, maePp: null },
    });
    expect(response.body.zones[1].reason).toBe('sensor_missing');
  });
  it('cero utilizable, recepción tardía y desempate: no fuga información futura ni escribe', async () => {
    await sample(3, 12, 20);
    await sample(2, 12, 30);
    await sample(1, 12, 0);
    await sample(1, 23, 99, 'valid', new Date(cutoff.getTime() + 1));
    const before = await db.reading.count();
    const response = await get().expect(200);
    expect(response.body.zones[0]).toMatchObject({ predictedPct: 0, reason: 'available' });
    // Late target is known for retrospective evaluation, but never used in the midnight feature.
    expect(response.body.zones[0].history.at(-1)).toMatchObject({
      observedPct: 99,
      predictedPct: 30,
    });
    expect(response.body.zones[0].evaluation.samples).toBe(2);
    expect(response.body.zones[0].evaluation.maePp).toBe(39.5);
    expect(response.body.model).toMatchObject({ fitted: false, fieldValidated: false });
    expect(response.body.waterDemand).toBeNull();
    expect(JSON.stringify(response.body)).not.toMatch(
      /passwordHash|credentialHash|payloadHash|deviceKey/,
    );
    expect(await db.reading.count()).toBe(before);
    const tie = await sample(1, 12, 5);
    await sample(1, 12, 6, 'valid', tie.receivedAt);
    expect((await get().expect(200)).body.zones[0].predictedPct).toBe(6);
  });
  it('última lectura inválida no cae a un cero anterior válido; no cambia umbrales', async () => {
    await sample(1, 22, null, 'invalid');
    const response = await get().expect(200);
    expect(response.body.zones[0]).toMatchObject({
      reason: 'unusable_previous_day',
      predictedPct: null,
      evidence: null,
    });
    expect(await db.sensorThreshold.count()).toBe(0);
  });
  it('deshabilitación impide pronóstico, preserva histórico y SourcePolicy sigue vigente', async () => {
    await db.device.update({ where: { id: deviceId }, data: { isActive: false } });
    expect((await get().expect(200)).body.zones[0].reason).toBe('device_disabled');
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await get().expect(403);
    } finally {
      config.set('TELEMETRY_MODE', 'demo');
    }
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
    await get().expect(404);
  });
});
