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
import { OfflineAlertDetector } from '../src/alerts/offline-alert.detector';
import { OfflineAlertRepository } from '../src/alerts/offline-alert.repository';
import { SourcePolicy } from '../src/integrations/source-policy.service';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/auth.service';

describe('Alertas de desconexión: persistencia, concurrencia, permisos y reconocimiento', () => {
  let app: INestApplication, db: PrismaService, repository: OfflineAlertRepository;
  let ownerId: string, plotId: string, farmerId: string, farmerPlotId: string;
  let token: string, otherToken: string, farmerToken: string;
  const sign = (id: string, expiresIn = 900) =>
    app.get(JwtService).sign(
      {},
      {
        secret: process.env['JWT_SECRET'],
        subject: id,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn,
      },
    );
  const createDevice = (source: 'real' | 'demo' = 'real', plot = plotId, owner = ownerId) =>
    app.get(DevicesService).create(plot, owner, {
      serial: `offline-${randomUUID()}`,
      source,
      expectedIntervalSeconds: 5,
    });
  const list = (deviceId: string, source = 'real', auth = token, plot = plotId, extra = {}) =>
    request(app.getHttpServer())
      .get(`/api/v1/plots/${plot}/alerts`)
      .query({ deviceId, source, ...extra })
      .auth(auth, { type: 'bearer' });
  const ack = (id: string, auth = token, plot = plotId, body = {}) =>
    request(app.getHttpServer())
      .post(`/api/v1/plots/${plot}/alerts/${id}/acknowledge`)
      .auth(auth, { type: 'bearer' })
      .send(body);
  const sync = (deviceId: string, clock?: Date) =>
    repository.synchronize(deviceId, (source) => app.get(SourcePolicy).allows(source), clock);
  const makeOffline = async (deviceId: string) => {
    const now = new Date(Date.now() - 1000);
    await db.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(now.getTime() - 30000) },
    });
    await sync(deviceId, now);
    return db.offlineAlert.findFirstOrThrow({ where: { deviceId, closedAt: null } });
  };

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner; nunca la principal');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    // Most cases control evaluation time. Real boot/restart detection is checked explicitly below.
    await app.get(OfflineAlertDetector).onModuleDestroy();
    db = app.get(PrismaService);
    repository = app.get(OfflineAlertRepository);
    const user = (role: 'ADMIN' | 'FARMER') =>
      db.user.create({
        data: {
          name: 'Offline fixture',
          email: `${randomUUID()}@example.test`,
          role,
          passwordHash: 'unused-test-only',
        },
      });
    ownerId = (await user('ADMIN')).id;
    farmerId = (await user('FARMER')).id;
    token = sign(ownerId);
    farmerToken = sign(farmerId);
    otherToken = sign((await user('ADMIN')).id);
    plotId = (
      await db.plot.create({
        data: { ownerId, name: 'Offline temporal', locationLabel: 'Pruebas' },
      })
    ).id;
    farmerPlotId = (
      await db.plot.create({
        data: { ownerId: farmerId, name: 'Farmer temporal', locationLabel: 'Pruebas' },
      })
    ).id;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('sin contacto previo y en el límite exacto no crea alertas ni altera el dispositivo', async () => {
    const device = await createDevice();
    await sync(device.id);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(0);
    const seen = new Date(Date.now() - 60000);
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: seen } });
    await sync(device.id, new Date(seen.getTime() + 25000));
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(0);
    await sync(device.id, new Date(seen.getTime() + 25001));
    const alert = await db.offlineAlert.findFirstOrThrow({ where: { deviceId: device.id } });
    expect(alert.lastSeenAt).toEqual(seen);
    expect(alert.expectedIntervalSeconds).toBe(5);
    expect((await db.device.findUniqueOrThrow({ where: { id: device.id } })).lastSeenAt).toEqual(
      seen,
    );
    expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(0);
  });

  it('escaneos concurrentes y reinicio del detector conservan un solo episodio sin navegador', async () => {
    const device = await createDevice();
    await makeOffline(device.id);
    await Promise.all(Array.from({ length: 5 }, () => sync(device.id)));
    const detector = new OfflineAlertDetector(repository, app.get(SourcePolicy));
    try {
      detector.onApplicationBootstrap();
      await detector.scan();
    } finally {
      await detector.onModuleDestroy();
    }
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(1);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id, closedAt: null } })).toBe(1);
  });

  it('al arrancar detecta dispositivos desconectados aunque nadie haya consultado el dashboard', async () => {
    const device = await createDevice();
    await db.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(Date.now() - 30000) },
    });
    const detector = new OfflineAlertDetector(repository, app.get(SourcePolicy));
    try {
      detector.onApplicationBootstrap();
      await detector.scan();
    } finally {
      await detector.onModuleDestroy();
    }
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(1);
  });

  it('GET es solo lectura: no inventa alertas al consultar si aún no hubo evaluación', async () => {
    const device = await createDevice();
    await db.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date(Date.now() - 30000) },
    });
    expect((await list(device.id).expect(200)).body.items).toEqual([]);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(0);
  });

  it('JWT, UUID y propiedad se comprueban tanto al leer como al reconocer', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await list(device.id, 'real', '').expect(401);
    await ack(alert.id, '').expect(401);
    await list(device.id, 'real', sign(ownerId, -1)).expect(401);
    await list('serial').expect(400);
    await ack('not-uuid').expect(400);
    await list(device.id, 'real', otherToken).expect(404);
    await ack(alert.id, otherToken).expect(404);
    await list(device.id, 'real', farmerToken).expect(404);
    await ack(alert.id, farmerToken).expect(404);
    await ack(randomUUID()).expect(404);
    await ack(alert.id, token, farmerPlotId).expect(404);
  });

  it('reconocimiento idempotente guarda actor y fecha sin cerrar ni duplicar la condición', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    const first = (await ack(alert.id).expect(200)).body;
    expect(first.acknowledgedAt).toBeTruthy();
    expect(first.closedAt).toBeNull();
    expect((await ack(alert.id).expect(200)).body).toEqual(first);
    const stored = await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(stored.acknowledgedBy).toBe(ownerId);
    expect(stored.closedAt).toBeNull();
    expect(first).not.toHaveProperty('acknowledgedBy');
    await sync(device.id);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(1);
  });

  it('FARMER propietario puede reconocer lo suyo sin adquirir edición de rangos', async () => {
    const device = await createDevice('real', farmerPlotId, farmerId),
      alert = await makeOffline(device.id);
    await list(device.id, 'real', farmerToken, farmerPlotId).expect(200);
    const response = await ack(alert.id, farmerToken, farmerPlotId).expect(200);
    expect(response.body.acknowledgedAt).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: farmerId } })).role).toBe('FARMER');
  });

  it.each([
    { acknowledgedBy: 'client' },
    { acknowledgedAt: '2026-01-01T00:00:00Z' },
    { closedAt: 'now' },
    { source: 'demo' },
  ])('no acepta campos de reconocimiento del cliente %j', async (body) => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await ack(alert.id, token, plotId, body).expect(400);
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).acknowledgedAt,
    ).toBeNull();
  });

  it('reconocimientos concurrentes devuelven el mismo primer sello de tiempo', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    const results = await Promise.all([ack(alert.id), ack(alert.id), ack(alert.id)]);
    expect(results.map((result) => result.status)).toEqual([200, 200, 200]);
    expect(new Set(results.map((result) => result.body.acknowledgedAt)).size).toBe(1);
  });

  it('nuevo contacto cierra el episodio, conserva reconocimiento y una nueva desconexión crea otro', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    const recognized = (await ack(alert.id).expect(200)).body;
    const contact = new Date();
    await db.device.update({ where: { id: device.id }, data: { lastSeenAt: contact } });
    await sync(device.id);
    const closed = await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(closed.closeReason).toBe('CONTACT_RESTORED');
    expect(closed.closedAt).toEqual(contact);
    expect(closed.acknowledgedAt?.toISOString()).toBe(recognized.acknowledgedAt);
    await sync(device.id, new Date(contact.getTime() + 25001));
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(2);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id, closedAt: null } })).toBe(1);
  });

  it('un reintento idéntico no restablece contacto; un evento nuevo sí lo hace aunque la medición sea antigua', async () => {
    const device = await createDevice();
    const payload = {
      schemaVersion: '1.2',
      deviceId: device.id,
      eventId: 'offline-original',
      recordedAt: new Date(Date.now() - 3600000).toISOString(),
      soilMoisture: { soil_1: null, soil_2: null, soil_3: null },
      temperatureC: null,
      airHumidityPct: null,
      rainDetected: null,
      valve: { relayCommandedOpen: null, feedbackOpen: null },
    };
    const send = (input = payload) =>
      request(app.getHttpServer())
        .post('/api/v1/iot/telemetry')
        .set('X-Device-Id', device.id)
        .set('X-Device-Key', device.deviceKey)
        .send(input);
    await send().expect(201);
    const alert = await makeOffline(device.id);
    const duplicate = await send().expect(201);
    expect(duplicate.body.duplicate).toBe(true);
    await sync(device.id);
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).closedAt,
    ).toBeNull();
    await send({ ...payload, eventId: 'offline-new-contact' }).expect(201);
    await sync(device.id);
    expect((await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).closeReason).toBe(
      'CONTACT_RESTORED',
    );
    expect(await db.reading.count({ where: { deviceId: device.id } })).toBe(2);
  });

  it('DEMO está separado y su política también bloquea lectura y reconocimiento', async () => {
    const device = await createDevice('demo'),
      alert = await makeOffline(device.id);
    expect((await list(device.id, 'demo').expect(200)).body.items[0].source).toBe('demo');
    await list(device.id, 'real').expect(404);
    const config = app.get(ConfigService);
    try {
      config.set('TELEMETRY_MODE', 'real');
      await list(device.id, 'demo').expect(403);
      await ack(alert.id).expect(403);
    } finally {
      config.set('TELEMETRY_MODE', 'demo');
    }
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).acknowledgedAt,
    ).toBeNull();
  });

  it('deshabilitar monitoreo cierra sin fingir recuperación y conserva acceso al historial del equipo', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await db.device.update({ where: { id: device.id }, data: { isActive: false } });
    await sync(device.id);
    expect((await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).closeReason).toBe(
      'MONITORING_STOPPED',
    );
    await list(device.id).expect(200);
    await db.device.update({ where: { id: device.id }, data: { isActive: true } });
    await sync(device.id);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(2);
  });

  it('cambio de intervalo reevalúa la conectividad sin reescribir evidencia anterior', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await db.device.update({ where: { id: device.id }, data: { expectedIntervalSeconds: 60 } });
    await sync(device.id);
    const stored = await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(stored.closeReason).toBe('INTERVAL_CHANGED');
    expect(stored.expectedIntervalSeconds).toBe(5);
    expect(await db.offlineAlert.count({ where: { deviceId: device.id, closedAt: null } })).toBe(0);
  });

  it('parcela archivada y usuario inactivo no generan episodios nuevos y bloquean el acceso', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await db.plot.update({ where: { id: plotId }, data: { archivedAt: new Date() } });
    try {
      await sync(device.id);
      await list(device.id).expect(404);
      await ack(alert.id).expect(404);
    } finally {
      await db.plot.update({ where: { id: plotId }, data: { archivedAt: null } });
    }
    expect((await db.offlineAlert.findUniqueOrThrow({ where: { id: alert.id } })).closeReason).toBe(
      'MONITORING_STOPPED',
    );
    await db.user.update({ where: { id: ownerId }, data: { isActive: false } });
    try {
      await sync(device.id);
      await list(device.id).expect(401);
      await ack(alert.id).expect(401);
    } finally {
      await db.user.update({ where: { id: ownerId }, data: { isActive: true } });
    }
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(1);
  });

  it('paginación tiene orden estable y solo contiene el dispositivo seleccionado', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    await db.offlineAlert.update({
      where: { id: alert.id },
      data: { closedAt: new Date(), closeReason: 'MONITORING_STOPPED' },
    });
    await sync(device.id);
    const first = (
      await list(device.id, 'real', token, plotId, { limit: 1, offset: 0 }).expect(200)
    ).body;
    const second = (
      await list(device.id, 'real', token, plotId, { limit: 1, offset: 1 }).expect(200)
    ).body;
    expect(first.total).toBe(2);
    expect(second.total).toBe(2);
    expect(first.items[0].id).not.toBe(second.items[0].id);
    expect(first.items[0].deviceId).toBe(device.id);
    await list(device.id, 'real', token, plotId, { limit: 101 }).expect(400);
    await list(device.id, 'real', token, plotId, { ownerId: 'client' }).expect(400);
  });

  it('la base impide dos alertas activas del mismo equipo y estados temporales incoherentes', async () => {
    const device = await createDevice(),
      alert = await makeOffline(device.id);
    const data = {
      deviceId: alert.deviceId,
      plotId: alert.plotId,
      source: alert.source,
      lastSeenAt: alert.lastSeenAt,
      expectedIntervalSeconds: alert.expectedIntervalSeconds,
      detectedAt: alert.detectedAt,
    };
    await expect(db.offlineAlert.create({ data })).rejects.toThrow();
    await expect(
      db.offlineAlert.update({
        where: { id: alert.id },
        data: { closedAt: new Date(), closeReason: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.offlineAlert.update({
        where: { id: alert.id },
        data: { acknowledgedAt: new Date(), acknowledgedBy: null },
      }),
    ).rejects.toThrow();
    expect(await db.offlineAlert.count({ where: { deviceId: device.id } })).toBe(1);
  });

  it('OpenAPI documenta consulta y reconocimiento sin permitir cierre manual de la condición', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/docs-json').expect(200);
    expect(response.body.paths['/api/v1/plots/{plotId}/alerts'].get.responses['200']).toBeDefined();
    expect(
      response.body.paths['/api/v1/plots/{plotId}/alerts/{alertId}/acknowledge'].post.responses[
        '200'
      ],
    ).toBeDefined();
    expect(response.body.paths['/api/v1/plots/{plotId}/alerts/{alertId}']?.delete).toBeUndefined();
  });
});
