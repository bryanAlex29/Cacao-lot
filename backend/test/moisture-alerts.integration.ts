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
import { DevicesService } from '../src/devices/devices.service';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/auth.service';
import { SourcePolicy } from '../src/integrations/source-policy.service';
import { MoistureRepository } from '../src/alerts/moisture/moisture.repository';
import { MoistureDetector } from '../src/alerts/moisture/moisture.detector';
import { ThresholdService } from '../src/sensor-thresholds/threshold.service';

describe('Humedad: secuencias durables, política por sonda y aislamiento PostgreSQL', () => {
  let app: INestApplication, db: PrismaService, repository: MoistureRepository;
  let owner: string,
    farmer: string,
    plot: string,
    farmerPlot: string,
    token: string,
    farmerToken: string,
    otherToken: string;
  const sign = (id: string) =>
    app.get(JwtService).sign(
      {},
      {
        secret: process.env['JWT_SECRET'],
        subject: id,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn: 900,
      },
    );
  const device = (source: 'real' | 'demo' = 'demo', plotId = plot, ownerId = owner) =>
    app.get(DevicesService).create(plotId, ownerId, {
      serial: `moisture-${randomUUID()}`,
      source,
      expectedIntervalSeconds: 5,
    });
  const get = (sensor: string, auth = token) =>
    request(app.getHttpServer())
      .get(`/api/v1/sensors/${sensor}/moisture-alert-policy`)
      .auth(auth, { type: 'bearer' });
  const put = (
    sensor: string,
    body = { recoveryMarginPct: 5, expectedVersion: 0, expectedThresholdVersion: 1 },
    auth = token,
  ) =>
    request(app.getHttpServer())
      .put(`/api/v1/sensors/${sensor}/moisture-alert-policy`)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const list = (id: string, source = 'demo', auth = token, plotId = plot) =>
    request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/moisture-alerts`)
      .query({ deviceId: id, source })
      .auth(auth, { type: 'bearer' });
  const ack = (id: string, auth = token, plotId = plot) =>
    request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/moisture-alerts/${id}/acknowledge`)
      .auth(auth, { type: 'bearer' })
      .send({});
  // Synthetic readings must not expire merely because a remote SQL round trip is slower.
  // Explicit clocks in the stale/pause tests still exercise the real freshness rules.
  const fixtureClocks = new Map<string, Date>();
  const sync = (sensor: string, now = fixtureClocks.get(sensor)) =>
    repository.synchronize(sensor, (source) => app.get(SourcePolicy).allows(source), now);
  const fixture = async (source: 'real' | 'demo' = 'demo') => {
    const d = await device(source);
    const soil = d.sensors.filter((s) => s.variable === 'SOIL_MOISTURE');
    const sensor = soil.find((s) => s.code === 'soil_1')!;
    // Explicit synthetic timeline in the disposable DB, not default agronomic configuration.
    const epoch = new Date(Date.now() - 120000);
    await db.sensorThreshold.create({
      data: {
        sensorId: sensor.id,
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        minValue: 30,
        maxValue: 70,
        version: 1,
        effectiveAt: epoch,
        updatedBy: owner,
      },
    });
    await db.moistureAlertPolicy.create({
      data: {
        sensorId: sensor.id,
        recoveryMarginPct: 5,
        version: 1,
        updatedAt: epoch,
        updatedBy: owner,
      },
    });
    let tick = 0;
    const base = Date.now() - 5000;
    for (const item of soil) fixtureClocks.set(item.id, new Date(base + 5000));
    const sample = async (
      value: number | null,
      quality: 'valid' | 'uncalibrated' | 'invalid' | 'missing' = value === null
        ? 'missing'
        : 'uncalibrated',
      time = new Date(base + ++tick * 100),
    ) => {
      const recordedAt = time;
      return db.reading.create({
        data: {
          deviceId: d.id,
          source,
          eventId: randomUUID(),
          payloadHash: '0'.repeat(64),
          recordedAt,
          receivedAt: new Date(),
          effectiveAt: recordedAt,
          timestampOrigin: 'device',
          quality: { soil_1: quality, soil_2: 'uncalibrated', soil_3: 'missing' },
          soilReadings: {
            create: soil.map((s) => ({
              sensorId: s.id,
              moisturePct: s.id === sensor.id ? value : null,
              quality: s.id === sensor.id ? quality : 'missing',
            })),
          },
        },
      });
    };
    return { d, sensor, sample, soil };
  };
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    await app.get(MoistureDetector).onModuleDestroy();
    db = app.get(PrismaService);
    repository = app.get(MoistureRepository);
    const user = (role: 'ADMIN' | 'FARMER') =>
      db.user.create({
        data: {
          name: 'Moisture fixture',
          email: `${randomUUID()}@example.test`,
          passwordHash: 'unused-test-only',
          role,
        },
      });
    owner = (await user('ADMIN')).id;
    farmer = (await user('FARMER')).id;
    token = sign(owner);
    farmerToken = sign(farmer);
    otherToken = sign((await user('ADMIN')).id);
    plot = (
      await db.plot.create({
        data: { ownerId: owner, name: 'Humedad temporal', locationLabel: 'Pruebas' },
      })
    ).id;
    farmerPlot = (
      await db.plot.create({
        data: { ownerId: farmer, name: 'Farmer temporal', locationLabel: 'Pruebas' },
      })
    ).id;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('sin rango o margen no inventa configuración ni crea alertas al consultar', async () => {
    const d = await device(),
      sensor = d.sensors.find((s) => s.code === 'soil_1')!;
    const initial = (await get(sensor.id).expect(200)).body;
    expect(initial.policy).toBeNull();
    expect(initial.status).toBe('no_range');
    await put(sensor.id).expect(400);
    await app.get(ThresholdService).put(sensor.id, owner, {
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
      minValue: 30,
      maxValue: 70,
      expectedVersion: 0,
    });
    expect((await get(sensor.id).expect(200)).body.status).toBe('unconfigured');
    expect((await list(d.id).expect(200)).body.total).toBe(0);
    expect(await db.moistureAlertPolicy.count({ where: { sensorId: sensor.id } })).toBe(0);
  });
  it('dos lecturas, reinicio y tercera lectura abren un solo episodio sin navegador', async () => {
    const f = await fixture();
    await f.sample(10);
    await f.sample(20);
    await sync(f.sensor.id);
    expect(
      (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: f.sensor.id } }))
        .lowCount,
    ).toBe(2);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(0);
    await f.sample(15);
    const detector = new MoistureDetector(repository, app.get(SourcePolicy));
    try {
      detector.onApplicationBootstrap();
      await detector.scan();
    } finally {
      await detector.onModuleDestroy();
    }
    await Promise.all([sync(f.sensor.id), sync(f.sensor.id), sync(f.sensor.id)]);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(1);
    const alert = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    expect(alert.triggerValue).toBe(15);
    expect(alert.recoveryMarginPct).toBe(5);
    expect(alert.closedAt).toBeNull();
  });
  it('reconocer no recupera; banda de histéresis y tres lecturas de recuperación conservan evidencia', async () => {
    const f = await fixture();
    for (const value of [20, 21, 22]) await f.sample(value);
    await sync(f.sensor.id);
    const alert = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    const recognized = (await ack(alert.id).expect(200)).body;
    expect(recognized.closedAt).toBeNull();
    await f.sample(35);
    await f.sample(34.9);
    await f.sample(35);
    await f.sample(35);
    await sync(f.sensor.id);
    expect(
      (await db.moistureAlert.findUniqueOrThrow({ where: { id: alert.id } })).closedAt,
    ).toBeNull();
    await f.sample(35);
    await sync(f.sensor.id);
    const recovered = await db.moistureAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(recovered.closeReason).toBe('RECOVERED');
    expect(recovered.acknowledgedAt?.toISOString()).toBe(recognized.acknowledgedAt);
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(2);
  });
  it.each(['missing', 'invalid'] as const)(
    '%s rompe la secuencia sin resolver una condición',
    async (quality) => {
      const f = await fixture();
      await f.sample(10);
      await f.sample(10);
      await f.sample(null, quality);
      await f.sample(10);
      await sync(f.sensor.id);
      expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(0);
      expect(
        (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: f.sensor.id } }))
          .lowCount,
      ).toBe(1);
    },
  );
  it('mensajes fuera de orden, fechas iguales y duplicados no suman confirmaciones', async () => {
    const f = await fixture();
    const first = await f.sample(10);
    await sync(f.sensor.id);
    await f.sample(10, 'uncalibrated', first.effectiveAt);
    await f.sample(10, 'uncalibrated', new Date(first.effectiveAt.getTime() - 1));
    await sync(f.sensor.id);
    await sync(f.sensor.id);
    expect(
      (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: f.sensor.id } }))
        .lowCount,
    ).toBe(1);
  });
  it('no cuentan lecturas antiguas ni conserva secuencia durante una pausa', async () => {
    const f = await fixture();
    await f.sample(10);
    await f.sample(10);
    await sync(f.sensor.id);
    await sync(f.sensor.id, new Date(Date.now() + 11000));
    expect(
      (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: f.sensor.id } }))
        .lowCount,
    ).toBe(0);
    await f.sample(10);
    await sync(f.sensor.id);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(0);
  });
  it('real sin calibrar no activa ni recupera; no cambia calidad de telemetría', async () => {
    const f = await fixture('real');
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(0);
    expect((await get(f.sensor.id).expect(200)).body.status).toBe('real_uncalibrated');
    expect(
      (await db.soilReading.findFirstOrThrow({ where: { sensorId: f.sensor.id } })).quality,
    ).toBe('uncalibrated');
  });
  it('A/B/C tienen políticas y conteos independientes; no se agregan porcentajes', async () => {
    const f = await fixture();
    const b = f.soil.find((s) => s.code === 'soil_2')!;
    await db.sensorThreshold.create({
      data: {
        sensorId: b.id,
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        minValue: 50,
        maxValue: 90,
        version: 1,
        effectiveAt: new Date(Date.now() - 120000),
        updatedBy: owner,
      },
    });
    await db.moistureAlertPolicy.create({
      data: {
        sensorId: b.id,
        recoveryMarginPct: 10,
        version: 1,
        updatedAt: new Date(Date.now() - 120000),
        updatedBy: owner,
      },
    });
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    await sync(b.id);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(1);
    expect(await db.moistureAlert.count({ where: { sensorId: b.id } })).toBe(0);
    expect(
      (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: b.id } })).lowCount,
    ).toBe(0);
  });
  it('cambiar margen cierra por configuración, audita y arranca sin reinterpretar lecturas previas', async () => {
    const f = await fixture();
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    const alert = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    await put(f.sensor.id, {
      recoveryMarginPct: 6,
      expectedVersion: 1,
      expectedThresholdVersion: 1,
    }).expect(200);
    expect(
      (await db.moistureAlert.findUniqueOrThrow({ where: { id: alert.id } })).closeReason,
    ).toBe('CONFIGURATION_CHANGED');
    expect(
      (await db.moistureAlertState.findUniqueOrThrow({ where: { sensorId: f.sensor.id } }))
        .lowCount,
    ).toBe(0);
    expect(await db.moisturePolicyAudit.count({ where: { sensorId: f.sensor.id } })).toBe(1);
    await sync(f.sensor.id);
    expect(await db.moistureAlert.count({ where: { sensorId: f.sensor.id } })).toBe(1);
  });
  it('cambiar rango no altera alertas previas y un margen incompatible queda inhabilitado', async () => {
    const f = await fixture();
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    const alert = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    await app.get(ThresholdService).put(f.sensor.id, owner, {
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
      minValue: 68,
      maxValue: 70,
      expectedVersion: 1,
    });
    await sync(f.sensor.id);
    const old = await db.moistureAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(old.closeReason).toBe('CONFIGURATION_CHANGED');
    expect(old.minValue).toBe(30);
    expect(old.recoveryMarginPct).toBe(5);
    expect((await get(f.sensor.id).expect(200)).body.status).toBe('incompatible_margin');
    await put(f.sensor.id, {
      recoveryMarginPct: 5,
      expectedVersion: 1,
      expectedThresholdVersion: 2,
    }).expect(400);
  });
  it('sin permiso, lluvia/ambiente, versión o margen inválidos no permiten configurar', async () => {
    const f = await fixture();
    await get(f.sensor.id, '').expect(401);
    await get(f.sensor.id, otherToken).expect(404);
    await put(f.sensor.id, undefined, farmerToken).expect(403);
    await put(f.sensor.id, {
      recoveryMarginPct: 0,
      expectedVersion: 1,
      expectedThresholdVersion: 1,
    }).expect(400);
    await put(f.sensor.id, {
      recoveryMarginPct: 41,
      expectedVersion: 1,
      expectedThresholdVersion: 1,
    }).expect(400);
    await put(f.sensor.id, {
      recoveryMarginPct: 6,
      expectedVersion: 0,
      expectedThresholdVersion: 1,
    }).expect(409);
    await put(f.sensor.id, {
      recoveryMarginPct: 6,
      expectedVersion: 1,
      expectedThresholdVersion: 2,
    }).expect(409);
    await get(f.d.sensors.find((s) => s.code === 'rainDetected')!.id).expect(400);
    await get(f.d.sensors.find((s) => s.code === 'temperatureC')!.id).expect(400);
    expect((await get(f.sensor.id).expect(200)).body.policy.version).toBe(1);
  });
  it('creaciones y reconocimientos concurrentes conservan versiones y un solo sello de reconocimiento', async () => {
    const d = await device(),
      sensor = d.sensors.find((s) => s.code === 'soil_1')!;
    await app.get(ThresholdService).put(sensor.id, owner, {
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
      minValue: 30,
      maxValue: 70,
      expectedVersion: 0,
    });
    const results = await Promise.all([put(sensor.id), put(sensor.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.moisturePolicyAudit.count({ where: { sensorId: sensor.id } })).toBe(1);
    const f = await fixture();
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    const alert = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    const acknowledgments = await Promise.all([ack(alert.id), ack(alert.id)]);
    expect(acknowledgments.map((a) => a.status)).toEqual([200, 200]);
    expect(acknowledgments[0].body.acknowledgedAt).toBe(acknowledgments[1].body.acknowledgedAt);
    await ack(alert.id, otherToken).expect(404);
  });
  it('FARMER consulta sus políticas pero no puede escribirlas; origen DEMO respeta SourcePolicy', async () => {
    const d = await device('real', farmerPlot, farmer),
      sensor = d.sensors.find((s) => s.code === 'soil_1')!;
    await get(sensor.id, farmerToken).expect(200);
    await put(sensor.id, undefined, farmerToken).expect(403);
    const f = await fixture();
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await get(f.sensor.id).expect(403);
      await list(f.d.id).expect(403);
      await sync(f.sensor.id);
      expect(await db.moistureAlertState.count({ where: { sensorId: f.sensor.id } })).toBe(0);
    } finally {
      config.set('TELEMETRY_MODE', 'demo');
    }
  });
  it('deshabilitar una sonda cierra sin declarar recuperación y no afecta desconexión', async () => {
    const f = await fixture();
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    await db.sensor.update({ where: { id: f.sensor.id }, data: { enabled: false } });
    await sync(f.sensor.id);
    expect(
      (await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } })).closeReason,
    ).toBe('MONITORING_STOPPED');
    expect((await get(f.sensor.id).expect(200)).body.status).toBe('disabled');
    expect(await db.offlineAlert.count({ where: { deviceId: f.d.id } })).toBe(0);
  });
  it('la base rechaza dos episodios activos y secuencias fuera de límites', async () => {
    const f = await fixture();
    for (const value of [10, 10, 10]) await f.sample(value);
    await sync(f.sensor.id);
    const active = await db.moistureAlert.findFirstOrThrow({ where: { sensorId: f.sensor.id } });
    const copy = { ...active, id: randomUUID() };
    await expect(db.moistureAlert.create({ data: copy })).rejects.toThrow();
    await expect(
      db.moistureAlertState.update({ where: { sensorId: f.sensor.id }, data: { lowCount: 3 } }),
    ).rejects.toThrow();
    await expect(
      db.moistureAlertPolicy.update({
        where: { sensorId: f.sensor.id },
        data: { recoveryMarginPct: 0 },
      }),
    ).rejects.toThrow();
  });
  it('OpenAPI documenta configuración, conflicto y lectura/reconocimiento', async () => {
    const result = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    expect(
      result.body.paths['/api/v1/sensors/{sensorId}/moisture-alert-policy'].put.responses['409'],
    ).toBeDefined();
    expect(result.body.paths['/api/v1/plots/{plotId}/moisture-alerts'].get).toBeDefined();
    expect(
      result.body.paths['/api/v1/plots/{plotId}/moisture-alerts/{alertId}/acknowledge'].post,
    ).toBeDefined();
  });
});
