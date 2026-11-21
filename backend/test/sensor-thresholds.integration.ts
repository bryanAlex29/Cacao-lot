import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Prisma, SensorCode, TelemetrySource } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/auth.service';
import type { SensorThresholdResponse } from '@cacaosmart/contracts';

describe('Rangos, permisos y auditoría atómica en PostgreSQL', () => {
  let app: INestApplication, db: PrismaService;
  let ownerId: string, farmerId: string, plotId: string, farmerPlotId: string;
  let token: string, otherToken: string, farmerToken: string;
  let real: { id: string; sensors: Record<SensorCode, string> };
  let demo: typeof real, farmerDevice: typeof real;
  const body = (overrides = {}) => ({
    variable: 'SOIL_MOISTURE',
    unit: 'PERCENT',
    minValue: 20,
    maxValue: 70,
    expectedVersion: 0,
    ...overrides,
  });
  const url = (id: string) => `/api/v1/sensors/${id}/thresholds`;
  const get = (id: string, auth = token) =>
    request(app.getHttpServer()).get(url(id)).auth(auth, { type: 'bearer' });
  const put = (id: string, input = body(), auth = token) =>
    request(app.getHttpServer()).put(url(id)).auth(auth, { type: 'bearer' }).send(input);
  const history = (
    id: string,
    from = new Date(Date.now() - 86400000).toISOString(),
    to = new Date(Date.now() + 1000).toISOString(),
    auth = token,
  ) =>
    request(app.getHttpServer())
      .get(`${url(id)}/history`)
      .query({ from, to })
      .auth(auth, { type: 'bearer' });
  const sign = (id: string, seconds = 900) =>
    app.get(JwtService).sign(
      {},
      {
        secret: process.env['JWT_SECRET'],
        subject: id,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn: seconds,
      },
    );
  const createDevice = async (plot: string, source: TelemetrySource = 'real') => {
    const sensors: Prisma.SensorCreateWithoutDeviceInput[] = [
      { code: 'soil_1', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'A' },
      { code: 'soil_2', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'B' },
      { code: 'soil_3', variable: 'SOIL_MOISTURE', unit: 'PERCENT', zone: 'C' },
      { code: 'temperatureC', variable: 'TEMPERATURE', unit: 'CELSIUS' },
      { code: 'airHumidityPct', variable: 'AIR_HUMIDITY', unit: 'PERCENT' },
      { code: 'rainDetected', variable: 'RAIN_DETECTED', unit: 'BOOLEAN' },
    ];
    const device = await db.device.create({
      data: {
        plotId: plot,
        source,
        serial: `threshold-${randomUUID()}`,
        credentialHash: 'test-only',
        sensors: { create: sensors },
      },
      include: { sensors: true },
    });
    return {
      id: device.id,
      sensors: Object.fromEntries(device.sensors.map((s) => [s.code, s.id])) as Record<
        SensorCode,
        string
      >,
    };
  };

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner; nunca la principal');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      // This validation matrix exceeds 60 requests; rate limiting is tested in security.integration.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const createUser = (email: string, role: 'ADMIN' | 'FARMER') =>
      db.user.create({
        data: {
          email,
          name: 'Threshold fixture',
          role,
          passwordHash: 'unused-test-only',
        },
      });
    ownerId = (await createUser('threshold-owner@example.test', 'ADMIN')).id;
    const otherId = (await createUser('threshold-other@example.test', 'ADMIN')).id;
    farmerId = (await createUser('threshold-farmer@example.test', 'FARMER')).id;
    token = sign(ownerId);
    otherToken = sign(otherId);
    farmerToken = sign(farmerId);
    plotId = (
      await db.plot.create({ data: { ownerId, name: 'Rangos', locationLabel: 'Temporal' } })
    ).id;
    farmerPlotId = (
      await db.plot.create({
        data: { ownerId: farmerId, name: 'Farmer', locationLabel: 'Temporal' },
      })
    ).id;
    real = await createDevice(plotId);
    demo = await createDevice(plotId, 'demo');
    farmerDevice = await createDevice(farmerPlotId);
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('requiere sesión válida y UUID persistente en ambas rutas', async () => {
    for (const auth of ['', 'invalid', sign(ownerId, -1)]) {
      await get(real.sensors.soil_1, auth).expect(401);
      await put(real.sensors.soil_1, body(), auth).expect(401);
    }
    await get('soil_1').expect(400);
    await put('soil_1').expect(400);
  });

  it('no inventa rangos ni requiere lecturas para consultar', async () => {
    const response = await get(real.sensors.soil_1).expect(200);
    expect(response.body).toEqual({
      sensorId: real.sensors.soil_1,
      deviceId: real.id,
      plotId,
      source: 'real',
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
      threshold: null,
    });
    expect(await db.reading.count()).toBe(0);
  });

  it('crea un rango y una auditoría con actor, origen y hora del servidor', async () => {
    const before = Date.now();
    const response = await put(real.sensors.soil_1).expect(200);
    const result = response.body as SensorThresholdResponse;
    expect(result.threshold).toMatchObject({
      minValue: 20,
      maxValue: 70,
      version: 1,
      updatedBy: ownerId,
      hysteresis: 0,
    });
    expect(Date.parse(result.threshold!.effectiveAt)).toBeGreaterThanOrEqual(before);
    const audits = await db.sensorThresholdAudit.findMany({
      where: { sensorId: real.sensors.soil_1 },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      oldValue: null,
      newValue: {
        ...result.threshold,
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
      },
      actorId: ownerId,
      plotId,
      source: 'real',
      version: 1,
    });
    expect(audits[0].changedAt.toISOString()).toBe(result.threshold!.effectiveAt);
    expect((await get(real.sensors.soil_1).expect(200)).body).toEqual(result);
  });

  it('actualiza conservando el valor anterior y no audita una operación sin cambios', async () => {
    const before = (await get(real.sensors.soil_1)).body as SensorThresholdResponse;
    const updated = (
      await put(real.sensors.soil_1, body({ minValue: 25, expectedVersion: 1 })).expect(200)
    ).body as SensorThresholdResponse;
    expect(updated.threshold).toMatchObject({ id: before.threshold!.id, minValue: 25, version: 2 });
    const audit = await db.sensorThresholdAudit.findUniqueOrThrow({
      where: {
        sensorId_variable_version: {
          sensorId: real.sensors.soil_1,
          variable: 'SOIL_MOISTURE',
          version: 2,
        },
      },
    });
    expect(audit.oldValue).toEqual({
      ...before.threshold,
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
    });
    expect(audit.newValue).toEqual({
      ...updated.threshold,
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
    });
    const noop = await put(real.sensors.soil_1, body({ minValue: 25, expectedVersion: 2 })).expect(
      200,
    );
    expect(noop.body).toEqual(updated);
    expect(await db.sensorThresholdAudit.count({ where: { sensorId: real.sensors.soil_1 } })).toBe(
      2,
    );
    await put(real.sensors.soil_1, body({ minValue: 25, expectedVersion: 1 })).expect(409);
  });

  it('aísla propietarios incluso para ADMIN; FARMER solo consulta lo propio', async () => {
    await get(real.sensors.soil_1, otherToken).expect(404);
    await put(real.sensors.soil_1, body(), otherToken).expect(404);
    await get(farmerDevice.sensors.soil_1, farmerToken).expect(200);
    await put(farmerDevice.sensors.soil_1, body(), farmerToken).expect(403);
    await get(real.sensors.soil_1, farmerToken).expect(404);
    await get(farmerDevice.sensors.soil_1).expect(404);
    await put(farmerDevice.sensors.soil_1).expect(404);
    await get(randomUUID()).expect(404);
  });

  it.each([
    { minValue: 70, maxValue: 70 },
    { minValue: 80, maxValue: 70 },
    { minValue: -1 },
    { maxValue: 101 },
    { minValue: '20' },
    { maxValue: null },
    { variable: 'AIR_HUMIDITY' },
    { unit: 'CELSIUS' },
    { expectedVersion: -1 },
    { source: 'demo' },
    { ownerId: 'client' },
    { updatedBy: 'client' },
    { effectiveAt: '2026-01-01T00:00:00Z' },
    { hysteresis: 1 },
  ])('rechaza entrada inválida sin escribir ni auditar %j', async (override) => {
    const count = await db.sensorThresholdAudit.count();
    await put(real.sensors.soil_2, body(override)).expect(400);
    expect(await db.sensorThreshold.count({ where: { sensorId: real.sensors.soil_2 } })).toBe(0);
    expect(await db.sensorThresholdAudit.count()).toBe(count);
  });

  it('configura suelo, temperatura y humedad ambiental independientemente', async () => {
    for (const [code, input] of [
      ['soil_2', body({ minValue: 0, maxValue: 100 })],
      ['soil_3', body({ minValue: 35, maxValue: 65 })],
      [
        'temperatureC',
        body({ variable: 'TEMPERATURE', unit: 'CELSIUS', minValue: -50, maxValue: 100 }),
      ],
      ['airHumidityPct', body({ variable: 'AIR_HUMIDITY', minValue: 50, maxValue: 90 })],
    ] as const) {
      const response = await put(real.sensors[code], input).expect(200);
      expect(response.body.threshold.minValue).toBe(input.minValue);
    }
    const soil1 = (await get(real.sensors.soil_1)).body as SensorThresholdResponse;
    expect(soil1.threshold!.minValue).toBe(25);
    const inventory = await db.sensor.findMany({ where: { deviceId: real.id } });
    expect(inventory).toHaveLength(6);
    expect(inventory.every((s) => s.calibrationMetadata === null)).toBe(true);
    await get(real.sensors.rainDetected).expect(400);
    await put(real.sensors.rainDetected).expect(400);
  });

  it('deriva DEMO del dispositivo y no copia sus rangos a los reales', async () => {
    const result = (await put(demo.sensors.soil_1, body({ minValue: 1, maxValue: 99 })).expect(200))
      .body as SensorThresholdResponse;
    expect(result.source).toBe('demo');
    const audit = await db.sensorThresholdAudit.findFirstOrThrow({
      where: { sensorId: demo.sensors.soil_1 },
    });
    expect(audit.source).toBe('demo');
    const realRange = (await get(real.sensors.soil_1)).body as SensorThresholdResponse;
    expect(realRange.threshold!.minValue).toBe(25);
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await get(demo.sensors.soil_1).expect(403);
      await put(demo.sensors.soil_1, body({ expectedVersion: 1 })).expect(403);
      config.set('TELEMETRY_MODE', 'demo');
      config.set('NODE_ENV', 'production');
      await get(demo.sensors.soil_1).expect(403);
    } finally {
      config.set('NODE_ENV', 'test');
      config.set('TELEMETRY_MODE', 'demo');
    }
  });

  it('rechaza recursos archivados, deshabilitados y usuarios inactivos sin escribir', async () => {
    const sensorId = real.sensors.soil_1;
    const count = await db.sensorThresholdAudit.count();
    try {
      await db.sensor.update({ where: { id: sensorId }, data: { enabled: false } });
      await get(sensorId).expect(404);
      await put(sensorId, body({ expectedVersion: 2 })).expect(404);
      await db.sensor.update({ where: { id: sensorId }, data: { enabled: true } });
      await db.device.update({ where: { id: real.id }, data: { isActive: false } });
      await get(sensorId).expect(404);
      await db.device.update({ where: { id: real.id }, data: { isActive: true } });
      await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
      await get(sensorId).expect(404);
      await put(sensorId, body({ expectedVersion: 2 })).expect(404);
      await db.plot.update({ where: { id: plotId }, data: { archivedAt: null } });
      await db.user.update({ where: { id: ownerId }, data: { isActive: false } });
      await put(sensorId, body({ expectedVersion: 2 })).expect(401);
    } finally {
      await db.user.update({ where: { id: ownerId }, data: { isActive: true } });
      await db.plot.update({ where: { id: plotId }, data: { archivedAt: null } });
      await db.device.update({ where: { id: real.id }, data: { isActive: true } });
      await db.sensor.update({ where: { id: sensorId }, data: { enabled: true } });
    }
    expect(await db.sensorThresholdAudit.count()).toBe(count);
  });

  it('serializa creaciones y actualizaciones concurrentes sin perder cambios', async () => {
    // Use a new sensor to also exercise the absent-row creation race.
    const device = await createDevice(plotId);
    const id = device.sensors.soil_1;
    const created = await Promise.all([
      put(id, body({ minValue: 10 })),
      put(id, body({ minValue: 15 })),
    ]);
    expect(created.map((r) => r.status).sort()).toEqual([200, 409]);
    const edited = await Promise.all([
      put(id, body({ minValue: 30, expectedVersion: 1 })),
      put(id, body({ minValue: 40, expectedVersion: 1 })),
    ]);
    expect(edited.map((r) => r.status).sort()).toEqual([200, 409]);
    const audits = await db.sensorThresholdAudit.findMany({
      where: { sensorId: id },
      orderBy: { version: 'asc' },
    });
    expect(audits.map((a) => a.version)).toEqual([1, 2]);
    expect(audits[1].oldValue).toEqual(audits[0].newValue);
  });

  it('revierte creación y edición si falla la escritura de auditoría', async () => {
    const device = await createDevice(plotId);
    const existing = device.sensors.soil_1,
      fresh = device.sensors.soil_2;
    await put(existing).expect(200);
    const before = await db.sensorThreshold.findFirstOrThrow({ where: { sensorId: existing } });
    // Failure injection restricted by beforeAll to the runner's disposable database.
    await db.$executeRawUnsafe(
      `CREATE FUNCTION test_fail_threshold_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic audit failure'; END; $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER test_fail_threshold_audit BEFORE INSERT ON sensor_threshold_audits FOR EACH ROW EXECUTE FUNCTION test_fail_threshold_audit()`,
    );
    const count = await db.sensorThresholdAudit.count();
    try {
      await put(existing, body({ minValue: 30, expectedVersion: 1 })).expect(500);
      await put(fresh).expect(500);
      expect(await db.sensorThreshold.findFirstOrThrow({ where: { sensorId: existing } })).toEqual(
        before,
      );
      expect(await db.sensorThreshold.count({ where: { sensorId: fresh } })).toBe(0);
      expect(await db.sensorThresholdAudit.count()).toBe(count);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_fail_threshold_audit ON sensor_threshold_audits',
      );
      await db.$executeRawUnsafe('DROP FUNCTION test_fail_threshold_audit()');
    }
  });

  it('la base también rechaza rangos imposibles y variable/unidad de otro sensor', async () => {
    const id = real.sensors.soil_1;
    const original = await db.sensorThreshold.findFirstOrThrow({ where: { sensorId: id } });
    for (const data of [
      { minValue: 80, maxValue: 70 },
      { minValue: -1 },
      { maxValue: Infinity },
      { minValue: NaN },
      { variable: 'TEMPERATURE' as const, unit: 'CELSIUS' as const },
      { variable: 'RAIN_DETECTED' as const, unit: 'BOOLEAN' as const },
    ]) {
      await expect(
        db.sensorThreshold.update({ where: { id: original.id }, data }),
      ).rejects.toThrow();
    }
    expect(await db.sensorThreshold.findUnique({ where: { id: original.id } })).toEqual(original);
    expect(await db.reading.count()).toBe(0);
  });

  it('OpenAPI documenta las dos rutas, ausencia de rango y conflicto de versión', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    const path = response.body.paths['/api/v1/sensors/{sensorId}/thresholds'];
    expect(path.get.responses['200']).toBeDefined();
    expect(path.put.responses['409']).toBeDefined();
    expect(
      response.body.components.schemas.SensorThresholdResponseDto.properties.threshold.nullable,
    ).toBe(true);
  });

  it('historial exige JWT y UUID, y no revela sensores ajenos ni lluvia', async () => {
    await history(real.sensors.soil_1, undefined, undefined, '').expect(401);
    await history('soil_1').expect(400);
    await history(randomUUID()).expect(404);
    await history(real.sensors.soil_1, undefined, undefined, otherToken).expect(404);
    await history(real.sensors.rainDetected).expect(400);
    await history(farmerDevice.sensors.soil_1, undefined, undefined, farmerToken).expect(200);
  });

  it.each([
    { from: 'bad', to: 'bad' },
    { from: '2026-02-30T00:00:00Z', to: '2026-03-01T00:00:00Z' },
    { from: '2026-11-01', to: '2026-11-02' },
    { from: '2026-11-02T00:00:00Z', to: '2026-11-01T00:00:00Z' },
    { from: '2026-11-01T00:00:00Z', to: '2026-11-01T00:00:00Z' },
    { from: '2026-09-01T00:00:00Z', to: '2026-11-01T00:00:00Z' },
    { from: '2026-11-01T00:00:00Z', to: '2026-11-02T00:00:00Z', source: 'demo' },
  ])('historial valida periodo acotado y no acepta suplantar origen %j', async (query) => {
    await request(app.getHttpServer())
      .get(`${url(real.sensors.soil_1)}/history`)
      .query(query)
      .auth(token, { type: 'bearer' })
      .expect(400);
  });

  it('devuelve vigencias completas y editar después no modifica un periodo anterior', async () => {
    const device = await createDevice(plotId);
    const id = device.sensors.soil_1;
    const first = (await put(id).expect(200)).body as SensorThresholdResponse;
    const effective = first.threshold!.effectiveAt;
    const from = new Date(Date.parse(effective) - 1000).toISOString();
    const before = (await history(id, from, effective).expect(200)).body;
    expect(before.intervals).toEqual([{ from, to: effective, threshold: null }]);
    const second = (await put(id, body({ minValue: 30, expectedVersion: 1 })).expect(200))
      .body as SensorThresholdResponse;
    expect((await history(id, from, effective).expect(200)).body).toEqual(before);
    const to = new Date(Date.parse(second.threshold!.effectiveAt) + 1).toISOString();
    const result = (await history(id, from, to).expect(200)).body;
    expect(
      result.intervals.map(
        (i: { threshold: { version: number } | null }) => i.threshold?.version ?? null,
      ),
    ).toEqual([null, 1, 2]);
    expect(result.intervals[1].threshold).toMatchObject({ minValue: 20, maxValue: 70, version: 1 });
    expect(result.intervals[2].from).toBe(second.threshold!.effectiveAt);
    expect(result.intervals[2].threshold).not.toHaveProperty('updatedBy');
    const anchor = (
      await history(
        id,
        new Date(Date.parse(effective) + 1).toISOString(),
        second.threshold!.effectiveAt,
      ).expect(200)
    ).body;
    expect(anchor.intervals[0].threshold.version).toBe(1);
  });

  it('historial sin rangos es null explícito y DEMO conserva restricciones', async () => {
    const result = (await history(demo.sensors.soil_3).expect(200)).body;
    expect(result.source).toBe('demo');
    expect(result.intervals[0].threshold).toBeNull();
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await history(demo.sensors.soil_1).expect(403);
    } finally {
      config.set('TELEMETRY_MODE', 'demo');
    }
  });

  it('historial rechaza sensor/dispositivo deshabilitado y parcela archivada', async () => {
    const device = await createDevice(plotId);
    const id = device.sensors.soil_1;
    await db.sensor.update({ where: { id }, data: { enabled: false } });
    await history(id).expect(404);
    await db.sensor.update({ where: { id }, data: { enabled: true } });
    await db.device.update({ where: { id: device.id }, data: { isActive: false } });
    await history(id).expect(404);
    await db.device.update({ where: { id: device.id }, data: { isActive: true } });
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
    try {
      await history(id).expect(404);
    } finally {
      await db.plot.update({ where: { id: plotId }, data: { archivedAt: null } });
    }
  });

  it('una auditoría faltante no produce límites inventados ni un historial parcial', async () => {
    const device = await createDevice(plotId);
    const id = device.sensors.soil_1;
    await put(id).expect(200);
    await put(id, body({ minValue: 30, expectedVersion: 1 })).expect(200);
    // Corruption fixture, only in this runner-owned disposable database.
    await db.sensorThresholdAudit.deleteMany({ where: { sensorId: id, version: 1 } });
    await history(id).expect(409);
    expect((await get(id).expect(200)).body.threshold.version).toBe(2);
  });

  it('OpenAPI documenta historial con fechas y error por cobertura incompleta', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    const path = response.body.paths['/api/v1/sensors/{sensorId}/thresholds/history'];
    expect(path.get.responses['200']).toBeDefined();
    expect(path.get.responses['409']).toBeDefined();
    expect(path.get.parameters.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['sensorId', 'from', 'to']),
    );
  });
});
