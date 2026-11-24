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
import { WeatherService } from '../src/weather/weather.service';
import { OpenMeteoProvider, normalizeWeather } from '../src/weather/open-meteo.provider';
import { weatherFixture } from './weather-fixture';
import { WeatherJob } from '../src/weather/weather.job';

describe('Clima ERA5 por parcela con persistencia aislada, sin red externa', () => {
  let app: INestApplication, db: PrismaService, service: WeatherService, config: ConfigService;
  let owner: Awaited<ReturnType<typeof account>>, stranger: Awaited<ReturnType<typeof account>>, farmer: Awaited<ReturnType<typeof account>>;
  const password = 'Weather-test!';
  const profile = { latitude: 0, longitude: 0, timezone: 'America/Guayaquil', enabled: true, expectedVersion: 0 };
  let calls = 0;
  async function account(role: 'ADMIN' | 'FARMER') {
    const user = await db.user.create({ data: { email: `${randomUUID()}@example.test`, name: 'Clima sintético', role,
      passwordHash: await app.get(PasswordService).hash(password) } });
    const plot = await db.plot.create({ data: { ownerId: user.id, name: 'Clima de prueba', locationLabel: 'Sin ubicación real' } });
    return { user, plot, token: (await app.get(AuthService).login({ email: user.email, password })).body.accessToken };
  }
  const path = (id: string) => `/api/v1/plots/${id}/weather`;
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME']) throw new Error('Solo base temporal');
    process.env['WEATHER_PROVIDER'] = 'disabled';
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OpenMeteoProvider).useValue({
      fetch: async (location: typeof profile, from: string, to: string) => {
        calls++;
        return normalizeWeather(weatherFixture(from, to, location.timezone), location, from, to);
      },
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app); await app.init();
    db = app.get(PrismaService); service = app.get(WeatherService); config = app.get(ConfigService);
    owner = await account('ADMIN'); stranger = await account('ADMIN'); farmer = await account('FARMER');
  });
  afterAll(async () => { if (app) await app.close(); delete process.env['WEATHER_PROVIDER']; });
  afterEach(() => { jest.restoreAllMocks(); config.set('WEATHER_PROVIDER', 'disabled'); });
  it('JWT, propiedad incluso ADMIN y FARMER lectura propia sin escrituras', async () => {
    await request(app.getHttpServer()).get(path(owner.plot.id)).expect(401);
    await request(app.getHttpServer()).get(path(owner.plot.id)).auth(stranger.token, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).put(path(owner.plot.id) + '/profile').auth(farmer.token, { type: 'bearer' }).send(profile).expect(403);
    await request(app.getHttpServer()).post(path(farmer.plot.id) + '/sync').auth(farmer.token, { type: 'bearer' }).send({}).expect(403);
    const empty = await request(app.getHttpServer()).get(path(farmer.plot.id)).auth(farmer.token, { type: 'bearer' }).expect(200);
    expect(empty.body).toMatchObject({ provider: 'disabled', profile: null, items: [], provenance: null });
  });
  it('guardar autorización no llama al proveedor, versiona y audita sin alterar parcelas', async () => {
    await request(app.getHttpServer()).put(path(owner.plot.id) + '/profile').auth(owner.token, { type: 'bearer' }).send(profile).expect(200);
    expect(calls).toBe(0);
    expect(await db.weatherProfileRevision.count()).toBe(1);
    expect((await db.plot.findUniqueOrThrow({ where: { id: owner.plot.id } })).locationLabel).toBe('Sin ubicación real');
    await request(app.getHttpServer()).post(path(owner.plot.id) + '/sync').auth(owner.token, { type: 'bearer' }).send({}).expect(503);
    expect(calls).toBe(0);
  });
  it.each([{ latitude: '0' }, { longitude: 181 }, { enabled: null }, { timezone: 'UTC' }, { ownerId: 'client' }])('valida perfil sin suplantación %j', async (extra) => {
    await request(app.getHttpServer()).put(path(owner.plot.id) + '/profile').auth(owner.token, { type: 'bearer' })
      .send({ ...profile, ...extra }).expect(400);
  });
  it('edición concurrente da conflicto y no duplica auditoría', async () => {
    await request(app.getHttpServer()).put(path(owner.plot.id) + '/profile').auth(owner.token, { type: 'bearer' }).send(profile).expect(409);
    expect(await db.weatherProfileRevision.count()).toBe(1);
  });
  it('concurrencia de sync se serializa y almacena crudo, procedencia y 28 agregados una sola vez', async () => {
    config.set('WEATHER_PROVIDER', 'open-meteo');
    const before = calls;
    const replies = await Promise.all([service.sync(owner.plot.id, owner.user.id), service.sync(owner.plot.id, owner.user.id)]);
    expect(replies.map((v) => v.status).sort()).toEqual(['cooldown', 'updated']);
    expect(calls - before).toBe(1);
    expect(await db.weatherObservation.count()).toBe(28);
    expect(await db.weatherBatch.count()).toBe(1);
    const result = await service.get(owner.plot.id, owner.user.id);
    expect(result.items).toHaveLength(28);
    expect(result.provenance).toMatchObject({ dataset: 'ERA5', licence: 'CC BY 4.0', requestedLatitude: 0 });
    expect(JSON.stringify(result)).not.toMatch(/"raw"|"updatedBy"|"batchId"/);
    const batches = await db.weatherBatch.findMany();
    expect(batches[0].raw).toHaveProperty('hourly');
  });
  it('GET no llama al proveedor, FARMER no puede acceder a coordenadas ajenas', async () => {
    const before = calls;
    await service.get(owner.plot.id, owner.user.id);
    await request(app.getHttpServer()).get(path(owner.plot.id)).auth(farmer.token, { type: 'bearer' }).expect(404);
    expect(calls).toBe(before);
  });
  it('repetir importación no duplica observaciones y conserva batches crudos', async () => {
    config.set('WEATHER_PROVIDER', 'open-meteo');
    await db.weatherProfile.update({ where: { plotId: owner.plot.id }, data: { attemptAt: new Date(Date.now() - 16 * 60000) } });
    await service.sync(owner.plot.id, owner.user.id);
    expect(await db.weatherObservation.count()).toBe(28);
    expect(await db.weatherBatch.count()).toBe(2);
  });
  it('fallo no inventa datos ni borra evidencia previa; cooldown persiste', async () => {
    config.set('WEATHER_PROVIDER', 'open-meteo');
    await db.weatherProfile.update({ where: { plotId: owner.plot.id }, data: { attemptAt: new Date(Date.now() - 16 * 60000) } });
    jest.spyOn(app.get(OpenMeteoProvider), 'fetch').mockRejectedValueOnce(new Error('No publicar URL/secretos'));
    await expect(service.sync(owner.plot.id, owner.user.id)).rejects.toMatchObject({ status: 503 });
    expect((await service.get(owner.plot.id, owner.user.id)).items).toHaveLength(28);
    expect((await db.weatherProfile.findUniqueOrThrow({ where: { plotId: owner.plot.id } })).lastError).toBe('provider_unavailable');
    expect((await service.sync(owner.plot.id, owner.user.id)).status).toBe('cooldown');
  });
  it('revocar consentimiento cambia versión y no reutiliza datos anteriores ni consulta', async () => {
    config.set('WEATHER_PROVIDER', 'open-meteo');
    await service.save(owner.plot.id, owner.user.id, { ...profile, enabled: false, expectedVersion: 1 });
    const before = calls;
    expect((await service.get(owner.plot.id, owner.user.id)).items).toEqual([]);
    await expect(service.sync(owner.plot.id, owner.user.id)).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(before);
    expect(await db.weatherBatch.count()).toBe(2);
    expect(await db.weatherProfileRevision.count()).toBe(2);
  });
  it('cambio de perfil durante descarga descarta respuesta antigua', async () => {
    const own = await account('ADMIN');
    await service.save(own.plot.id, own.user.id, profile);
    config.set('WEATHER_PROVIDER', 'open-meteo');
    jest.spyOn(app.get(OpenMeteoProvider), 'fetch').mockImplementationOnce(async (location, from, to) => {
      await service.save(own.plot.id, own.user.id, { ...profile, enabled: false, expectedVersion: 1 });
      return normalizeWeather(weatherFixture(from, to), location, from, to);
    });
    await expect(service.sync(own.plot.id, own.user.id)).rejects.toMatchObject({ status: 503 });
    expect(await db.weatherBatch.count({ where: { plotId: own.plot.id } })).toBe(0);
    expect((await service.get(own.plot.id, own.user.id)).profile?.lastError).toBeNull();
  });
  it('archivar o inactivar propietario bloquea lectura y worker; no hay acceso global', async () => {
    await db.plot.update({ where: { id: owner.plot.id }, data: { archivedAt: new Date() } });
    await request(app.getHttpServer()).get(path(owner.plot.id)).auth(owner.token, { type: 'bearer' }).expect(404);
    const before = calls;
    await app.get(WeatherJob).scan();
    expect(calls).toBe(before);
  });
});
