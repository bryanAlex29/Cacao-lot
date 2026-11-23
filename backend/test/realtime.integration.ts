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
import type {
  IotTelemetryPayload,
  IrrigationUpdatedEvent,
  SensorStatusEvent,
  TelemetryUpdatedEvent,
} from '@cacaosmart/contracts';

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
  const body = (): IotTelemetryPayload => ({
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
    const leakedSensors: SensorStatusEvent[] = [];
    real.on('sensor.status', (e: SensorStatusEvent) => {
      if (e.source !== 'real') leakedSensors.push(e);
    });
    other.on('sensor.status', (e: SensorStatusEvent) => leakedSensors.push(e));
    const sensorUpdate = event<SensorStatusEvent>(demo, 'sensor.status', 7000);
    const update = event<TelemetryUpdatedEvent>(demo, 'telemetry.updated');
    await send({ ...body(), deviceId: demoId }, demoId, demoKey).expect(201);
    expect((await update).reading.source).toBe('demo');
    expect(await sensorUpdate).toMatchObject({
      schemaVersion: '1.0',
      source: 'demo',
      deviceId: demoId,
    });
    await delay(150);
    expect(realEvents).toHaveLength(0);
    expect(otherEvents).toHaveLength(0);
    expect(leakedSensors).toEqual([]);
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
  describe('sensor.status independiente', () => {
    const fresh = async (expectedIntervalSeconds = 60) =>
      (
        await request(app.getHttpServer())
          .post(`/api/v1/plots/${plotId}/devices`)
          .auth(token, { type: 'bearer' })
          .send({ serial: `sensor-${randomUUID()}`, source: 'demo', expectedIntervalSeconds })
          .expect(201)
      ).body as { id: string; deviceKey: string };
    const until = (client: Socket, predicate: (e: SensorStatusEvent) => boolean) =>
      new Promise<SensorStatusEvent>((resolve, reject) => {
        const timer = setTimeout(() => {
          client.off('sensor.status', listener);
          reject(new Error('Estado de sensor no recibido'));
        }, 10000);
        const listener = (e: SensorStatusEvent) => {
          if (predicate(e)) {
            clearTimeout(timer);
            client.off('sensor.status', listener);
            resolve(e);
          }
        };
        client.on('sensor.status', listener);
      });
    const observe = async (interval = 60) => {
      const device = await fresh(interval),
        client = await connected();
      const initial = until(client, (e) => e.deviceId === device.id);
      expect((await join(client, { plotId, deviceId: device.id, source: 'demo' })).ok).toBe(true);
      return { device, client, initial };
    };
    it('sin datos publica inventario real y luego missing de una sonda no desconecta las demás', async () => {
      const { device, client, initial } = await observe();
      const empty = await initial;
      expect(empty.readingId).toBeNull();
      expect(empty.sensors).toHaveLength(6);
      expect(empty.sensors.every((s) => s.freshness === 'unknown' && s.quality === null)).toBe(
        true,
      );
      const input = {
        ...body(),
        deviceId: device.id,
        soilMoisture: { soil_1: null, soil_2: 0, soil_3: 63 },
      };
      const pending = until(client, (e) => e.readingId !== null);
      await send(input, device.id, device.deviceKey).expect(201);
      const update = await pending;
      expect(await db.reading.count({ where: { id: update.readingId! } })).toBe(1);
      expect(update.sensors.find((s) => s.code === 'soil_1')).toMatchObject({
        quality: 'missing',
        freshness: 'fresh',
        range: null,
      });
      expect(update.sensors.find((s) => s.code === 'soil_2')).toMatchObject({
        quality: 'uncalibrated',
        freshness: 'fresh',
        range: 'unconfigured',
      });
      expect(update.sensors.find((s) => s.code === 'rainDetected')).toMatchObject({
        quality: 'valid',
        range: 'not_applicable',
      });
      expect(JSON.stringify(update)).not.toMatch(
        /credentialHash|payloadHash|deviceKey|calibrationMetadata|ingestionOrder/,
      );
    });
    it('rango explícito cambia comparación sin otra lectura, con extremos inclusivos y versión', async () => {
      const { device, client, initial } = await observe();
      await initial;
      const pending = until(client, (e) => e.readingId !== null);
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(201);
      await pending;
      const sensor = await db.sensor.findUniqueOrThrow({
        where: { deviceId_code: { deviceId: device.id, code: 'soil_1' } },
      });
      const update = until(client, (e) =>
        e.sensors.some((s) => s.sensorId === sensor.id && s.range === 'within'),
      );
      await request(app.getHttpServer())
        .put(`/api/v1/sensors/${sensor.id}/thresholds`)
        .auth(token, { type: 'bearer' })
        .send({
          variable: 'SOIL_MOISTURE',
          unit: 'PERCENT',
          minValue: 21,
          maxValue: 60,
          expectedVersion: 0,
        })
        .expect(200);
      expect((await update).sensors.find((s) => s.sensorId === sensor.id)).toMatchObject({
        range: 'within',
        rangeVersion: 1,
        quality: 'uncalibrated',
      });
      expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(1);
    });
    it('estados iguales, duplicado, rechazo y lectura antigua no emiten otro estado', async () => {
      const { device, client, initial } = await observe();
      await initial;
      const input = { ...body(), deviceId: device.id };
      const pending = until(client, (e) => e.readingId !== null);
      await send(input, device.id, device.deviceKey).expect(201);
      await pending;
      const updates: SensorStatusEvent[] = [];
      client.on('sensor.status', (e) => updates.push(e));
      await send(input, device.id, device.deviceKey).expect(201);
      await send({ ...input, temperatureC: 29 }, device.id, device.deviceKey).expect(409);
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(201);
      await send(
        {
          ...body(),
          deviceId: device.id,
          recordedAt: '2026-01-01T00:00:00Z',
          soilMoisture: { soil_1: null, soil_2: null, soil_3: null },
        },
        device.id,
        device.deviceKey,
      ).expect(201);
      await delay(250);
      expect(updates).toEqual([]);
    });
    it('envejece sin ingesta nueva y recupera; contacto del equipo no rejuvenece medición antigua', async () => {
      const { device, client, initial } = await observe(1);
      await initial;
      const old = until(
        client,
        (e) => e.readingId !== null && e.sensors.every((s) => s.freshness === 'stale'),
      );
      await send(
        { ...body(), deviceId: device.id, recordedAt: new Date(Date.now() - 10000).toISOString() },
        device.id,
        device.deviceKey,
      ).expect(201);
      await old;
      expect(
        (await db.device.findUniqueOrThrow({ where: { id: device.id } })).lastSeenAt!.getTime(),
      ).toBeGreaterThan(Date.now() - 5000);
      const recovered = until(client, (e) => e.sensors.every((s) => s.freshness === 'fresh'));
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(201);
      await recovered;
      const stale = until(client, (e) => e.sensors.every((s) => s.freshness === 'stale'));
      await stale;
      expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(2);
    });
  });
  describe('irrigation.updated independiente', () => {
    const fresh = async (source = 'real') =>
      (
        await request(app.getHttpServer())
          .post(`/api/v1/plots/${plotId}/devices`)
          .auth(token, { type: 'bearer' })
          .send({ serial: `irrigation-${randomUUID()}`, source })
          .expect(201)
      ).body as { id: string; deviceKey: string };
    const observe = async (source = 'real') => {
      const device = await fresh(source);
      const client = await connected();
      expect((await join(client, { plotId, deviceId: device.id, source })).ok).toBe(true);
      return { device, client };
    };
    it('emite primera observación y cambios independientes de relé/feedback solo después de persistir', async () => {
      const { device, client } = await observe();
      let previous: { relayCommandedOpen: boolean | null; feedbackOpen: boolean | null } | null =
        null;
      for (const valve of [
        { relayCommandedOpen: true, feedbackOpen: null },
        { relayCommandedOpen: false, feedbackOpen: null },
        { relayCommandedOpen: null, feedbackOpen: null },
        { relayCommandedOpen: null, feedbackOpen: true },
      ]) {
        const input = { ...body(), deviceId: device.id, valve };
        const pending = event<IrrigationUpdatedEvent>(client, 'irrigation.updated');
        const result = await send(input, device.id, device.deviceKey).expect(201);
        expect(result.body).not.toHaveProperty('irrigationUpdate');
        const update = await pending;
        expect(update).toMatchObject({
          schemaVersion: '1.0',
          plotId,
          observation: {
            deviceId: device.id,
            source: 'real',
            eventId: input.eventId,
            kind: previous ? 'change' : 'initial',
            valve,
            previousValve: previous,
          },
        });
        expect(await db.reading.count({ where: { id: update.observation.id } })).toBe(1);
        expect(await db.soilReading.count({ where: { readingId: update.observation.id } })).toBe(3);
        expect(JSON.stringify(update)).not.toMatch(
          /credentialHash|payloadHash|deviceKey|ingestionOrder|liters|duration/,
        );
        previous = valve;
      }
    });
    it('reintento, estados iguales, lectura atrasada y rechazo no generan cambios nuevos', async () => {
      const { device, client } = await observe();
      const updates: IrrigationUpdatedEvent[] = [];
      client.on('irrigation.updated', (value) => updates.push(value));
      const first = { ...body(), deviceId: device.id };
      const pending = event(client, 'irrigation.updated');
      await send(first, device.id, device.deviceKey).expect(201);
      await pending;
      await send(first, device.id, device.deviceKey).expect(201);
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(201);
      await send({ ...first, temperatureC: 29 }, device.id, device.deviceKey).expect(409);
      await send(
        { ...body(), deviceId: device.id, temperatureC: 999 },
        device.id,
        device.deviceKey,
      ).expect(400);
      await send(
        {
          ...body(),
          deviceId: device.id,
          recordedAt: '2026-01-01T00:00:00Z',
          valve: { relayCommandedOpen: false, feedbackOpen: null },
        },
        device.id,
        device.deviceKey,
      ).expect(201);
      await delay(150);
      expect(updates).toHaveLength(1);
    });
    it('mantiene aislamiento por origen, equipo y propietario incluso ADMIN', async () => {
      const { device, client } = await observe('demo');
      const real = await connected(),
        other = await connected(otherToken);
      await join(real);
      expect((await join(other, { plotId, deviceId: device.id, source: 'demo' })).ok).toBe(false);
      const unexpected: unknown[] = [];
      real.on('irrigation.updated', (e) => unexpected.push(e));
      other.on('irrigation.updated', (e) => unexpected.push(e));
      const pending = event<IrrigationUpdatedEvent>(client, 'irrigation.updated');
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(201);
      expect((await pending).observation.source).toBe('demo');
      await delay(150);
      expect(unexpected).toEqual([]);
      const disconnect = event(client, 'disconnect', 7000);
      app.get(ConfigService).set('TELEMETRY_MODE', 'real');
      await disconnect;
      app.get(ConfigService).set('TELEMETRY_MODE', 'demo');
    });
    it('rollback de ingesta no publica evidencia inexistente', async () => {
      const { device, client } = await observe();
      await db.sensor.delete({ where: { deviceId_code: { deviceId: device.id, code: 'soil_3' } } });
      const updates: unknown[] = [];
      client.on('irrigation.updated', (value) => updates.push(value));
      await send({ ...body(), deviceId: device.id }, device.id, device.deviceKey).expect(409);
      await delay(150);
      expect(updates).toEqual([]);
      expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(0);
    });
    it('reintentos concurrentes conservan una observación y una publicación', async () => {
      const { device, client } = await observe();
      const updates: unknown[] = [];
      client.on('irrigation.updated', (value) => updates.push(value));
      const input = { ...body(), deviceId: device.id };
      const pending = event(client, 'irrigation.updated');
      await Promise.all([
        send(input, device.id, device.deviceKey),
        send(input, device.id, device.deviceKey),
      ]);
      await pending;
      await delay(150);
      expect(updates).toHaveLength(1);
      expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(1);
    });
  });
});
