import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/auth.service';
import { ConfigService } from '@nestjs/config';
import type { TelemetryUpdatedEvent } from '@cacaosmart/contracts';

describe('Socket.IO autenticado, aislado y persistido', () => {
  let app: INestApplication,
    db: PrismaService,
    base: string,
    token: string,
    otherToken: string,
    ownerId: string,
    plotId: string,
    deviceId: string,
    key: string,
    demoId: string,
    demoKey: string;
  const sockets: Socket[] = [];
  const body = () => ({
    schemaVersion: '1.2',
    eventId: randomUUID(),
    deviceId,
    recordedAt: null,
    soilMoisture: { soil_1: 21, soil_2: 42, soil_3: 63 },
    temperatureC: 28,
    airHumidityPct: 71,
    rainDetected: false,
    valve: { relayCommandedOpen: true, feedbackOpen: null },
  });
  const send = (payload = body(), id = deviceId, secret = key) =>
    request(app.getHttpServer())
      .post('/api/v1/iot/telemetry')
      .set('X-Device-Id', id)
      .set('X-Device-Key', secret)
      .send(payload);
  const sub = () => ({ plotId, deviceId, source: 'real' });
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
  const event = <T>(socket: Socket, name: string, ms = 3000): Promise<T> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(name, listener);
        reject(new Error(`Evento no recibido: ${name}`));
      }, ms);
      const listener = (value: T) => {
        clearTimeout(timer);
        resolve(value);
      };
      socket.once(name, listener);
    });
  const socket = (auth = token, origin = 'http://localhost:4200') => {
    const client = io(`${base}/telemetry`, {
      auth: { token: auth },
      extraHeaders: { Origin: origin },
      transports: ['websocket'],
      reconnection: false,
      autoConnect: false,
    });
    sockets.push(client);
    return client;
  };
  const connected = async (auth = token) => {
    const client = socket(auth);
    const ready = event(client, 'connect');
    client.connect();
    await ready;
    return client;
  };
  const join = (client: Socket, selection = sub()) =>
    client.timeout(3000).emitWithAck('subscribe', selection) as Promise<{ ok: boolean }>;

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
    db = app.get(PrismaService);
    const owner = await db.user.create({
      data: {
        name: 'Socket owner',
        email: 'socket@example.test',
        passwordHash: 'unused-test-only',
        role: 'ADMIN',
      },
    });
    ownerId = owner.id;
    const other = await db.user.create({
      data: {
        name: 'Other',
        email: 'socket-other@example.test',
        passwordHash: 'unused-test-only',
        role: 'ADMIN',
      },
    });
    token = sign(ownerId);
    otherToken = sign(other.id);
    plotId = (
      await db.plot.create({ data: { ownerId, name: 'Socket test', locationLabel: 'Temporal' } })
    ).id;
    const create = async (source: string) =>
      (
        await request(app.getHttpServer())
          .post(`/api/v1/plots/${plotId}/devices`)
          .auth(token, { type: 'bearer' })
          .send({ serial: `socket-${source}`, source, expectedIntervalSeconds: 1 })
          .expect(201)
      ).body as { id: string; deviceKey: string };
    const real = await create('real');
    deviceId = real.id;
    key = real.deviceKey;
    const demo = await create('demo');
    demoId = demo.id;
    demoKey = demo.deviceKey;
  });
  afterEach(() => {
    for (const client of sockets.splice(0)) {
      client.removeAllListeners();
      client.disconnect();
    }
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it.each(['', 'invalid.jwt', 'device-key-not-jwt'])(
    'rechaza handshake sin JWT válido (%s)',
    async (auth) => {
      const client = socket(auth);
      const failed = event(client, 'connect_error');
      client.connect();
      await failed;
      expect(client.connected).toBe(false);
    },
  );
  it('rechaza Origin ajeno también en transporte websocket', async () => {
    const client = socket(token, 'https://untrusted.example');
    const failed = event(client, 'connect_error');
    client.connect();
    await failed;
    expect(client.connected).toBe(false);
  });
  it('otro ADMIN no puede unirse; dispositivo y origen deben pertenecer a la parcela', async () => {
    const other = await connected(otherToken);
    expect((await join(other)).ok).toBe(false);
    const own = await connected();
    expect((await join(own, { ...sub(), deviceId: randomUUID() })).ok).toBe(false);
    expect((await join(own, { ...sub(), source: 'demo' })).ok).toBe(false);
    expect((await own.timeout(3000).emitWithAck('subscribe', { ...sub(), ownerId })).ok).toBe(
      false,
    );
  });
  it('ingesta -> commit PostgreSQL -> evento agregado v1.0 con tres sondas', async () => {
    const client = await connected();
    expect((await join(client)).ok).toBe(true);
    const update = event<TelemetryUpdatedEvent>(client, 'telemetry.updated');
    const payload = body();
    await send(payload).expect(201);
    const received = await update;
    expect(received).toMatchObject({
      schemaVersion: '1.0',
      plotId,
      reading: {
        eventId: payload.eventId,
        soilMoisture: payload.soilMoisture,
        source: 'real',
        valve: payload.valve,
      },
    });
    expect(await db.reading.count({ where: { deviceId, eventId: received.reading.eventId } })).toBe(
      1,
    );
    expect(JSON.stringify(received)).not.toMatch(
      /credentialHash|payloadHash|deviceKey|ingestionOrder/,
    );
  });
  it('duplicado y rechazo no emiten nuevos eventos', async () => {
    const client = await connected();
    await join(client);
    const updates: TelemetryUpdatedEvent[] = [];
    client.on('telemetry.updated', (value) => updates.push(value));
    const payload = body();
    await send(payload).expect(201);
    await delay(100);
    expect(updates).toHaveLength(1);
    await send(payload).expect(201);
    await send({ ...payload, temperatureC: 29 }).expect(409);
    await delay(150);
    expect(updates).toHaveLength(1);
  });
  it('real/demo y salas ajenas no reciben telemetría cruzada', async () => {
    const real = await connected(),
      demo = await connected(),
      other = await connected(otherToken);
    await join(real);
    await join(demo, { ...sub(), deviceId: demoId, source: 'demo' });
    await join(other);
    const realEvents: unknown[] = [],
      otherEvents: unknown[] = [];
    real.on('telemetry.updated', (e) => realEvents.push(e));
    other.on('telemetry.updated', (e) => otherEvents.push(e));
    const update = event<TelemetryUpdatedEvent>(demo, 'telemetry.updated');
    await send({ ...body(), deviceId: demoId }, demoId, demoKey).expect(201);
    expect((await update).reading.source).toBe('demo');
    await delay(150);
    expect(realEvents).toHaveLength(0);
    expect(otherEvents).toHaveLength(0);
  });
  it('cambiar a una suscripción inválida abandona la anterior', async () => {
    const client = await connected();
    await join(client);
    expect((await join(client, { ...sub(), plotId: randomUUID() })).ok).toBe(false);
    expect(
      (await client.timeout(3000).emitWithAck('subscribe', { ...sub(), source: ['real'] })).ok,
    ).toBe(false);
    const updates: unknown[] = [];
    client.on('telemetry.updated', (value) => updates.push(value));
    await send().expect(201);
    await delay(150);
    expect(updates).toHaveLength(0);
  });
  it('reconecta y recupera por REST la lectura perdida', async () => {
    const client = await connected();
    await join(client);
    client.disconnect();
    const payload = body();
    await send(payload).expect(201);
    const ready = event(client, 'connect');
    client.connect();
    await ready;
    expect((await join(client)).ok).toBe(true);
    const snapshot = await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/dashboard`)
      .auth(token, { type: 'bearer' })
      .query({ deviceId })
      .expect(200);
    expect(snapshot.body.reading.eventId).toBe(payload.eventId);
  });
  it('estado offline se deriva del intervalo sin inventar nuevos datos', async () => {
    await db.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(Date.now() - 10000) },
    });
    const client = await connected();
    const status = event<{ status: string }>(client, 'device.status', 7000);
    await join(client);
    expect((await status).status).toBe('offline');
  });
  it('sesión caducada y propietario inactivo se revalidan antes de emitir', async () => {
    // JWT redondea a segundos: dejar margen para el handshake y escuchar antes del barrido.
    const expired = await connected(sign(ownerId, 5));
    await join(expired);
    const disconnected = event(expired, 'disconnect', 12000);
    await delay(5100);
    await send().expect(201);
    await disconnected;
    expect(expired.connected).toBe(false);
    const inactive = await connected();
    await join(inactive);
    const closed = event(inactive, 'disconnect', 7000);
    await db.user.update({ where: { id: ownerId }, data: { isActive: false } });
    await closed;
    await db.user.update({ where: { id: ownerId }, data: { isActive: true } });
  });
  it('cerrar canal demo revoca suscripciones existentes', async () => {
    const client = await connected();
    await join(client, { ...sub(), deviceId: demoId, source: 'demo' });
    const closed = event(client, 'disconnect', 7000);
    app.get(ConfigService).set('TELEMETRY_MODE', 'real');
    await closed;
    app.get(ConfigService).set('TELEMETRY_MODE', 'demo');
  });
});
