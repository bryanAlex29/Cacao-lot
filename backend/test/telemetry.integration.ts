import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import request from 'supertest';
import type { IotTelemetryPayload } from '@cacaosmart/contracts';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { DeviceAuthService } from '../src/devices/device-auth.service';
import { TelemetryService } from '../src/telemetry/telemetry.service';

describe('Ingesta y consultas PostgreSQL', () => {
  let app: INestApplication;
  let db: PrismaService;
  let token: string;
  let otherToken: string;
  let ownerId: string;
  let plotId: string;
  let deviceId: string;
  let key: string;
  let demoId: string;
  let demoKey: string;
  const password = `Aa!${randomBytes(16).toString('hex')}`;
  const payload = (eventId: string = randomUUID()): IotTelemetryPayload => ({
    schemaVersion: '1.2',
    deviceId,
    eventId,
    recordedAt: null,
    soilMoisture: { soil_1: 11, soil_2: 42, soil_3: 73 },
    temperatureC: 28,
    airHumidityPct: 80,
    rainDetected: false,
    valve: { relayCommandedOpen: true, feedbackOpen: null },
  });
  const send = (body: object = payload(), id = deviceId, secret = key) =>
    request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('X-Device-Id', id)
      .set('X-Device-Key', secret)
      .send(body);
  const snapshot = (query: Record<string, string> = {}, auth = token) =>
    request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/dashboard`)
      .auth(auth, { type: 'bearer' })
      .query(query);

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const hash = await app.get(PasswordService).hash(password);
    const owner = await db.user.create({
      data: { name: 'Owner', email: 'owner@example.test', passwordHash: hash, role: 'ADMIN' },
    });
    ownerId = owner.id;
    await db.user.create({
      data: { name: 'Other', email: 'other@example.test', passwordHash: hash, role: 'ADMIN' },
    });
    token = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: owner.email, password })
        .expect(200)
    ).body.accessToken as string;
    otherToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'other@example.test', password })
        .expect(200)
    ).body.accessToken as string;
    plotId = (
      await db.plot.create({ data: { ownerId, name: 'Telemetría', locationLabel: 'Test' } })
    ).id;
    const provision = async (source: 'real' | 'demo') =>
      (
        await request(app.getHttpServer())
          .post(`/api/v1/plots/${plotId}/devices`)
          .auth(token, { type: 'bearer' })
          .send({ serial: `test-${source}`, source, expectedIntervalSeconds: 10 })
          .expect(201)
      ).body as { id: string; deviceKey: string };
    const device = await provision('real');
    deviceId = device.id;
    key = device.deviceKey;
    const demo = await provision('demo');
    demoId = demo.id;
    demoKey = demo.deviceKey;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('sin datos devuelve null y UNKNOWN, no inventa mediciones', async () => {
    const response = await snapshot().expect(200);
    expect(response.body.reading).toBeNull();
    expect(response.body.device.status).toBe('unknown');
    expect(JSON.stringify(response.body)).not.toContain(key);
  });
  it('rechaza JWT solo, claves erróneas, identidad ajena y campos extra', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .auth(token, { type: 'bearer' })
      .send(payload())
      .expect(401);
    await send(payload(), deviceId, '0'.repeat(64)).expect(401);
    await send({ ...payload(), deviceId: randomUUID() }).expect(403);
    await send({ ...payload(), untrusted: true } as ReturnType<typeof payload>).expect(400);
    await send({
      ...payload(),
      valve: { relayCommandedOpen: true, feedbackOpen: null, valveOpen: true },
    } as ReturnType<typeof payload>).expect(400);
    expect(await db.reading.count()).toBe(0);
  });
  it('persiste tres sondas atómicas, fecha servidor y origen autenticado', async () => {
    const body = { ...payload(), source: 'demo' };
    const response = await send(body).expect(201);
    expect(response.body.duplicate).toBe(false);
    expect(response.body.reading).toMatchObject({
      source: 'real',
      timestampOrigin: 'server',
      soilMoisture: body.soilMoisture,
      rainDetected: false,
      valve: body.valve,
    });
    const stored = await db.reading.findUniqueOrThrow({
      where: { deviceId_eventId: { deviceId, eventId: body.eventId } },
      include: { soilReadings: true },
    });
    expect(stored.soilReadings).toHaveLength(3);
    expect(stored.recordedAt).toBeNull();
    expect((await snapshot().expect(200)).body.device.status).toBe('online');
  });
  it('reintento exacto no duplica ni renueva lastSeenAt; conflicto 409', async () => {
    const body = payload();
    const first = await send(body).expect(201);
    const before = await db.device.findUniqueOrThrow({ where: { id: deviceId } });
    const again = await send(body).expect(201);
    expect(again.body).toEqual({ duplicate: true, reading: first.body.reading });
    expect((await db.device.findUniqueOrThrow({ where: { id: deviceId } })).lastSeenAt).toEqual(
      before.lastSeenAt,
    );
    await send({ ...body, temperatureC: 29 }).expect(409);
    expect(await db.reading.count({ where: { deviceId, eventId: body.eventId } })).toBe(1);
  });
  it('reintentos concurrentes aceptan exactamente una escritura', async () => {
    const body = payload();
    const responses = await Promise.all([send(body), send(body), send(body)]);
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201]);
    expect(responses.filter((r) => !r.body.duplicate)).toHaveLength(1);
    expect(await db.reading.count({ where: { deviceId, eventId: body.eventId } })).toBe(1);
  });
  it('lectura parcial y sensor deshabilitado son null/missing, no cero', async () => {
    await db.sensor.update({
      where: { deviceId_code: { deviceId, code: 'soil_2' } },
      data: { enabled: false },
    });
    const response = await send({
      ...payload(),
      soilMoisture: { soil_1: 0, soil_2: 42, soil_3: null },
    }).expect(201);
    expect(response.body.reading.soilMoisture).toEqual({ soil_1: 0, soil_2: null, soil_3: null });
    expect(response.body.reading.quality).toMatchObject({
      soil_1: 'uncalibrated',
      soil_2: 'missing',
      soil_3: 'missing',
    });
    await db.sensor.update({
      where: { deviceId_code: { deviceId, code: 'soil_2' } },
      data: { enabled: true },
    });
  });
  it('lectura antigua queda en histórico sin desplazar snapshot', async () => {
    const before = (await snapshot().expect(200)).body.reading;
    await send({ ...payload(), recordedAt: '2026-01-01T00:00:00Z' } as ReturnType<
      typeof payload
    >).expect(201);
    expect((await snapshot().expect(200)).body.reading).toEqual(before);
    const history = await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/readings`)
      .auth(token, { type: 'bearer' })
      .query({ from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z', limit: 1 })
      .expect(200);
    expect(history.body.total).toBe(1);
    expect(history.body.items).toHaveLength(1);
  });
  it('rechaza futuro, tipos, rangos y claves omitidas sin persistir', async () => {
    const count = await db.reading.count();
    await send({
      ...payload(),
      recordedAt: new Date(Date.now() + 120000).toISOString(),
    } as ReturnType<typeof payload>).expect(400);
    await send({ ...payload(), soilMoisture: { soil_1: -1, soil_2: 42, soil_3: 73 } }).expect(400);
    await send({ ...payload(), soilMoisture: { soil_1: 10, soil_2: 42 } } as ReturnType<
      typeof payload
    >).expect(400);
    expect(await db.reading.count()).toBe(count);
  });
  it('datos demo aislados por canal, sin fallback ni suplantar real', async () => {
    await send({ ...payload(), deviceId: demoId }, demoId, demoKey).expect(201);
    expect((await snapshot({ source: 'demo' }).expect(200)).body.reading.source).toBe('demo');
    expect((await snapshot().expect(200)).body.reading.source).toBe('real');
    await snapshot({ source: 'real', deviceId: demoId }).expect(404);
    app.get(ConfigService).set('TELEMETRY_MODE', 'real');
    await send({ ...payload(), deviceId: demoId }, demoId, demoKey).expect(401);
    await snapshot({ source: 'demo' }).expect(403);
    app.get(ConfigService).set('TELEMETRY_MODE', 'demo');
  });
  it('otro propietario incluso ADMIN no consulta snapshot ni histórico', async () => {
    await snapshot({}, otherToken).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/readings`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await snapshot({ deviceId: randomUUID() }).expect(404);
  });
  it('simulador Node -> HTTP NestJS -> PostgreSQL -> snapshot REST', async () => {
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    const config = {
      endpoint: `http://127.0.0.1:${address.port}/api/v1/iot/telemetry`,
      source: 'demo',
      deviceId: demoId,
      deviceKey: demoKey,
    };
    const code = `import {validateSimulatorConfig,simulatorPayload,sendWithRetry} from './scripts/simulator-core.mjs'; let input=''; for await(const chunk of process.stdin) input+=chunk; const c=validateSimulatorConfig(JSON.parse(input)); const p=simulatorPayload(c.deviceId,'integration',0,new Date().toISOString()); await sendWithRetry(c,p); const retry=await sendWithRetry(c,p); if(!retry.duplicate) process.exitCode=1;`;
    const exit = await new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
        cwd: resolve(__dirname, '../..'),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      child.once('error', reject);
      child.once('exit', resolveExit);
      child.stdin.end(JSON.stringify(config));
    });
    expect(exit).toBe(0);
    const reading = (await snapshot({ source: 'demo' }).expect(200)).body.reading;
    expect(reading).toMatchObject({
      eventId: 'sim:integration:0',
      soilMoisture: { soil_1: 25, soil_2: 45, soil_3: 65 },
      valve: { feedbackOpen: null },
    });
    expect(
      await db.reading.count({ where: { deviceId: demoId, eventId: 'sim:integration:0' } }),
    ).toBe(1);
  });
  it('revalida actividad dentro de transacción tras autenticación previa', async () => {
    const auth = await app
      .get(DeviceAuthService)
      .authenticate({ 'x-device-id': deviceId, 'x-device-key': key });
    await db.device.update({ where: { id: deviceId }, data: { isActive: false } });
    await expect(app.get(TelemetryService).ingest(auth, payload())).rejects.toThrow('Credencial');
    await db.device.update({ where: { id: deviceId }, data: { isActive: true } });
  });
  it('desempata mismo tiempo efectivo y recepción por orden de ingesta y pagina', async () => {
    const time = '2026-02-01T00:00:00.000Z';
    const first = { ...payload(), recordedAt: time };
    const second = { ...payload(), recordedAt: time };
    await send(first).expect(201);
    await send(second).expect(201);
    await db.reading.updateMany({
      where: { deviceId, eventId: { in: [first.eventId, second.eventId] } },
      data: { receivedAt: new Date(time) },
    });
    for (const [offset, eventId] of [
      [0, second.eventId],
      [1, first.eventId],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/plots/${plotId}/readings`)
        .auth(token, { type: 'bearer' })
        .query({ from: time, to: time, limit: 1, offset })
        .expect(200);
      expect(response.body.total).toBe(2);
      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].eventId).toBe(eventId);
    }
  });
  it('inventario incompleto revierte lectura, filas suelo y última conexión', async () => {
    const fresh = await request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/devices`)
      .auth(token, { type: 'bearer' })
      .send({ serial: 'broken-demo', source: 'demo' })
      .expect(201);
    const id = fresh.body.id as string;
    await db.sensor.delete({ where: { deviceId_code: { deviceId: id, code: 'soil_3' } } });
    await send({ ...payload(), deviceId: id }, id, fresh.body.deviceKey as string).expect(409);
    expect(await db.reading.count({ where: { deviceId: id } })).toBe(0);
    expect((await db.device.findUniqueOrThrow({ where: { id } })).lastSeenAt).toBeNull();
  });
  it('rechaza rangos temporales excesivos e invertidos', async () => {
    for (const range of [
      { from: '2026-01-01T00:00:00Z', to: '2026-03-01T00:00:00Z' },
      { from: '2026-01-02T00:00:00Z', to: '2026-01-01T00:00:00Z' },
    ])
      await request(app.getHttpServer())
        .get(`/api/v1/plots/${plotId}/readings`)
        .auth(token, { type: 'bearer' })
        .query(range)
        .expect(400);
  });
  it('dispositivo, parcela y propietario inactivos rechazan ingesta', async () => {
    const count = await db.reading.count();
    await db.device.update({ where: { id: deviceId }, data: { isActive: false } });
    await send().expect(401);
    await db.device.update({ where: { id: deviceId }, data: { isActive: true } });
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
    await send().expect(401);
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: null } });
    await db.user.update({ where: { id: ownerId }, data: { isActive: false } });
    await send().expect(401);
    await db.user.update({ where: { id: ownerId }, data: { isActive: true } });
    expect(await db.reading.count()).toBe(count);
  });
  it('no combina dispositivos ambiguos ni expone hashes', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/devices`)
      .auth(token, { type: 'bearer' })
      .send({ serial: 'second-real' })
      .expect(201);
    await snapshot().expect(409);
    const response = await snapshot({ deviceId }).expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /credentialHash|payloadHash|ingestionOrder|passwordHash/,
    );
  });
});
