import 'reflect-metadata';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/auth.service';
import request from 'supertest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

describe('Seguridad HTTP y persistencia PostgreSQL reales', () => {
  let app: INestApplication;
  let database: PrismaService;
  let passwords: PasswordService;
  let tokenA: string;
  let tokenB: string;
  let farmerToken: string;
  let adminId: string;
  let farmerId: string;
  let plotId: string;
  let farmerPlotId: string;
  let deviceId: string;
  let oneTimeKey: string;
  let bootstrapExit: number | null;
  let repeatedBootstrapExit: number | null;
  let bootstrapErrors: string[];
  let registeredToken: string;
  const password = `Aa!${randomBytes(24).toString('hex')}`;
  const minimumPassword = 'Abcdefg!'; // Solo fixture de prueba en base temporal.

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (
      !/^cacaosmart_test_[a-f0-9]{16}$/.test(name) ||
      name !== process.env['TEST_DATABASE_NAME']
    ) {
      throw new Error('Se requiere la base temporal del runner; no ejecutar en la base principal');
    }
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    database = app.get(PrismaService);
    passwords = app.get(PasswordService);
    const bootstrapEnv = {
      ...process.env,
      NODE_ENV: 'development',
      BOOTSTRAP_ADMIN_NAME: 'Bootstrap test',
      BOOTSTRAP_ADMIN_EMAIL: 'bootstrap@example.test',
      BOOTSTRAP_ADMIN_PASSWORD: minimumPassword,
    };
    const bootstrap = () =>
      spawnSync(process.execPath, [resolve(__dirname, '../../scripts/bootstrap-admin.mjs')], {
        env: bootstrapEnv,
        encoding: 'utf8',
        timeout: 30000,
      });
    const firstBootstrap = bootstrap();
    const repeatedBootstrap = bootstrap();
    bootstrapExit = firstBootstrap.status;
    repeatedBootstrapExit = repeatedBootstrap.status;
    bootstrapErrors = [firstBootstrap.stderr, repeatedBootstrap.stderr];
    const hash = await passwords.hash(password);
    const a = await database.user.create({
      data: { name: 'Admin A', email: 'a@example.test', passwordHash: hash, role: 'ADMIN' },
    });
    adminId = a.id;
    await database.user.create({
      data: { name: 'Admin B', email: 'b@example.test', passwordHash: hash, role: 'ADMIN' },
    });
    const farmer = await database.user.create({
      data: { name: 'Farmer', email: 'farmer@example.test', passwordHash: hash, role: 'FARMER' },
    });
    farmerId = farmer.id;
    const login = async (email: string): Promise<string> => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password })
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      return response.body.accessToken as string;
    };
    tokenA = await login(' A@example.test ');
    tokenB = await login('b@example.test');
    farmerToken = await login('farmer@example.test');
    const response = await request(app.getHttpServer())
      .post('/api/v1/plots')
      .auth(tokenA, { type: 'bearer' })
      .send({ name: 'Parcela A', locationLabel: 'Chone', areaM2: 1200 })
      .expect(201);
    plotId = response.body.id as string;
    const farmerPlot = await database.plot.create({
      data: { name: 'Farmer plot', locationLabel: 'Chone', ownerId: farmerId },
    });
    farmerPlotId = farmerPlot.id;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('CLI limita bootstrap a local y no sobrescribe cuentas', async () => {
    const host = new URL(process.env['DATABASE_URL'] ?? '').hostname;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      expect(bootstrapExit).toBe(1);
      expect(repeatedBootstrapExit).toBe(1);
      for (const error of bootstrapErrors)
        expect(error).toContain('El bootstrap está limitado a desarrollo y PostgreSQL local.');
      expect(await database.user.count({ where: { email: 'bootstrap@example.test' } })).toBe(0);
      return;
    }
    expect(bootstrapExit).toBe(0);
    expect(repeatedBootstrapExit).toBe(1);
    expect(
      await database.user.count({ where: { email: 'bootstrap@example.test', role: 'ADMIN' } }),
    ).toBe(1);
    const bootstrapUser = await database.user.findUniqueOrThrow({
      where: { email: 'bootstrap@example.test' },
    });
    expect(await passwords.verify(bootstrapUser.passwordHash, minimumPassword)).toBe(true);
  });

  it('protege rutas por defecto y mantiene salud pública', async () => {
    await request(app.getHttpServer()).get('/api/v1/plots').expect(401);
    await request(app.getHttpServer()).post('/api/v1/users').send({}).expect(401);
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
  });

  it('rechaza JWT inválido, expirado o con otra audiencia', async () => {
    const jwt = new JwtService();
    const secret = process.env['JWT_SECRET'];
    const expired = await jwt.signAsync(
      {},
      { secret, subject: adminId, issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE, expiresIn: -1 },
    );
    const wrong = await jwt.signAsync(
      {},
      { secret, subject: adminId, issuer: TOKEN_ISSUER, audience: 'other', expiresIn: 900 },
    );
    for (const token of ['invalid', expired, wrong]) {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    }
  });

  it('solo lista recursos propios y oculta existencia de parcelas ajenas incluso a ADMIN', async () => {
    const a = await request(app.getHttpServer())
      .get('/api/v1/plots')
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    expect(a.body.items.map((p: { id: string }) => p.id)).toEqual([plotId]);
    const b = await request(app.getHttpServer())
      .get('/api/v1/plots')
      .auth(tokenB, { type: 'bearer' })
      .expect(200);
    expect(b.body.items).toEqual([]);
    for (const path of [`/plots/${plotId}`, `/plots/${plotId}/devices`]) {
      await request(app.getHttpServer())
        .get(`/api/v1${path}`)
        .auth(tokenB, { type: 'bearer' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/plots/${plotId}`)
      .auth(tokenB, { type: 'bearer' })
      .send({ name: 'Intrusión' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/plots/${plotId}`)
      .auth(tokenB, { type: 'bearer' })
      .expect(404);
    expect((await database.plot.findUniqueOrThrow({ where: { id: plotId } })).name).toBe(
      'Parcela A',
    );
  });

  it('no permite asignar propietario ni saltarse validaciones', async () => {
    for (const body of [
      { name: 'x', locationLabel: 'y', ownerId: farmerId },
      { name: '', locationLabel: 'y' },
      { name: 'x', locationLabel: 'y', areaM2: -1 },
      { name: 'x', locationLabel: 'y', areaM2: '1200' },
    ]) {
      await request(app.getHttpServer())
        .post('/api/v1/plots')
        .auth(tokenA, { type: 'bearer' })
        .send(body)
        .expect(400);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/plots/${plotId}`)
      .auth(tokenA, { type: 'bearer' })
      .send({ name: null })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/plots?limit=101')
      .auth(tokenA, { type: 'bearer' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/v1/plots/not-a-uuid')
      .auth(tokenA, { type: 'bearer' })
      .expect(400);
  });

  it('permite alta de parcela propia FARMER sin habilitar otras escrituras', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${farmerPlotId}`)
      .auth(farmerToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}`)
      .auth(farmerToken, { type: 'bearer' })
      .expect(404);
    const created = await request(app.getHttpServer())
      .post('/api/v1/plots')
      .auth(farmerToken, { type: 'bearer' })
      .send({ name: 'x', locationLabel: 'y' })
      .expect(201);
    expect(created.body.ownerId).toBe(farmerId);
    expect(created.body.areaM2).toBeNull();
    expect(
      (await database.plot.findUniqueOrThrow({ where: { id: created.body.id as string } })).ownerId,
    ).toBe(farmerId);
    expect(await database.device.count({ where: { plotId: created.body.id as string } })).toBe(0);
    for (const auth of [tokenA, tokenB]) {
      await request(app.getHttpServer())
        .get(`/api/v1/plots/${created.body.id}`)
        .auth(auth, { type: 'bearer' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .delete(`/api/v1/plots/${created.body.id}`)
      .auth(farmerToken, { type: 'bearer' })
      .expect(403);
    for (const body of [
      { name: 'x', locationLabel: 'y', ownerId: adminId },
      { name: 'x', locationLabel: 'y', role: 'ADMIN' },
      { name: ' ', locationLabel: 'y' },
      { name: 'x', locationLabel: 'y', areaM2: 0 },
    ])
      await request(app.getHttpServer())
        .post('/api/v1/plots')
        .auth(farmerToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    await request(app.getHttpServer())
      .patch(`/api/v1/plots/${farmerPlotId}`)
      .auth(farmerToken, { type: 'bearer' })
      .send({ name: 'x' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/plots/${farmerPlotId}/devices`)
      .auth(farmerToken, { type: 'bearer' })
      .send({ serial: 'esp-test' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .auth(farmerToken, { type: 'bearer' })
      .send({})
      .expect(403);
  });

  it('crea FARMER con Argon2id, nunca acepta ADMIN del cliente ni devuelve hashes', async () => {
    const body = { name: 'Nuevo', email: ' NEW@example.test ', password };
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .auth(tokenA, { type: 'bearer' })
      .send({ ...body, role: 'ADMIN' })
      .expect(400);
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .auth(tokenA, { type: 'bearer' })
      .send(body)
      .expect(201);
    expect(response.body.role).toBe('FARMER');
    expect(response.body.email).toBe('new@example.test');
    expect(response.body).not.toHaveProperty('passwordHash');
    const account = await database.user.findUniqueOrThrow({ where: { email: 'new@example.test' } });
    expect(account.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(account.passwordHash, password)).toBe(true);
    await request(app.getHttpServer())
      .post('/api/v1/users')
      .auth(tokenA, { type: 'bearer' })
      .send(body)
      .expect(409);
  });

  it('registra dispositivo y seis sensores atómicos y guarda solo hash de clave', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/devices`)
      .auth(tokenA, { type: 'bearer' })
      .send({ serial: 'esp-test-001' })
      .expect(201);
    deviceId = response.body.id as string;
    oneTimeKey = response.body.deviceKey as string;
    expect(oneTimeKey).toMatch(/^[a-f0-9]{64}$/);
    expect(response.body).not.toHaveProperty('credentialHash');
    expect(response.body.status).toBe('UNKNOWN');
    expect(response.body.lastSeenAt).toBeNull();
    expect(response.body.sensors).toHaveLength(6);
    const zones = response.body.sensors
      .filter((s: { code: string }) => s.code.startsWith('soil_'))
      .map((s: { zone: string }) => s.zone);
    expect(zones).toEqual(['A', 'B', 'C']);
    const device = await database.device.findUniqueOrThrow({ where: { id: deviceId } });
    expect(device.credentialHash).toBe(createHash('sha256').update(oneTimeKey).digest('hex'));
    expect(device.credentialHash).not.toBe(oneTimeKey);
  });

  it('no recupera secretos en detalle/lista y aísla dispositivos y sensores por parcela', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/devices/${deviceId}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    expect(response.body).not.toHaveProperty('deviceKey');
    expect(response.body).not.toHaveProperty('credentialHash');
    const list = await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/devices`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    expect(list.text).not.toContain(oneTimeKey);
    for (const token of [tokenB, farmerToken]) {
      await request(app.getHttpServer())
        .get(`/api/v1/plots/${plotId}/devices/${deviceId}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
    }
    await request(app.getHttpServer())
      .patch(`/api/v1/plots/${plotId}/devices/${deviceId}`)
      .auth(tokenB, { type: 'bearer' })
      .send({ isActive: false })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/devices`)
      .auth(tokenB, { type: 'bearer' })
      .send({ serial: 'esp-intruder' })
      .expect(404);
  });

  it('rechaza duplicados sin crear sensores huérfanos y permite deshabilitar el propio', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/plots/${plotId}/devices`)
      .auth(tokenA, { type: 'bearer' })
      .send({ serial: 'esp-test-001' })
      .expect(409);
    expect(await database.sensor.count({ where: { deviceId } })).toBe(6);
    const result = await request(app.getHttpServer())
      .patch(`/api/v1/plots/${plotId}/devices/${deviceId}`)
      .auth(tokenA, { type: 'bearer' })
      .send({ isActive: false })
      .expect(200);
    expect(result.body.isActive).toBe(false);
  });

  it('revalida usuario y rol en base aun con JWT firmado vigente', async () => {
    await database.user.update({ where: { id: farmerId }, data: { isActive: false } });
    await request(app.getHttpServer())
      .post('/api/v1/plots')
      .auth(farmerToken, { type: 'bearer' })
      .send({ name: 'x', locationLabel: 'y' })
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(farmerToken, { type: 'bearer' })
      .expect(401);
    await database.user.update({ where: { id: farmerId }, data: { isActive: true } });
    await database.user.update({ where: { id: adminId }, data: { role: 'FARMER' } });
    await request(app.getHttpServer())
      .patch(`/api/v1/plots/${plotId}`)
      .auth(tokenA, { type: 'bearer' })
      .send({ name: 'x' })
      .expect(403);
    await database.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } });
  });

  it('archiva sin borrar y bloquea acceso posterior a parcela y dispositivos', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/plots/${plotId}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(204);
    expect(
      (await database.plot.findUniqueOrThrow({ where: { id: plotId } })).archivedAt,
    ).not.toBeNull();
    expect(await database.device.count({ where: { id: deviceId } })).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}/devices/${deviceId}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${plotId}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(404);
  });

  it('registro público no acepta rol ADMIN ni propietario del cliente', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: 'Intrusión',
        email: 'intruder@example.test',
        password,
        role: 'ADMIN',
        ownerId: adminId,
      })
      .expect(400);
    expect(await database.user.count({ where: { email: 'intruder@example.test' } })).toBe(0);
  });

  it('registro público crea FARMER con Argon2id y sesión sin acceso ajeno', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        name: ' Registro público ',
        email: ' PUBLIC@example.test ',
        password: minimumPassword,
      })
      .expect(201);
    registeredToken = response.body.accessToken as string;
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.expiresIn).toBe(900);
    expect(response.body.user).toMatchObject({
      name: 'Registro público',
      email: 'public@example.test',
      role: 'FARMER',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    const account = await database.user.findUniqueOrThrow({
      where: { email: 'public@example.test' },
    });
    expect(account.passwordHash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(account.passwordHash, minimumPassword)).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(registeredToken, { type: 'bearer' })
      .expect(200);
    const plots = await request(app.getHttpServer())
      .get('/api/v1/plots')
      .auth(registeredToken, { type: 'bearer' })
      .expect(200);
    expect(plots.body.items).toEqual([]);
    await request(app.getHttpServer())
      .get(`/api/v1/plots/${farmerPlotId}`)
      .auth(registeredToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .post('/api/v1/plots')
      .auth(registeredToken, { type: 'bearer' })
      .send({ name: 'x', locationLabel: 'y' })
      .expect(201);
  });

  it('registro duplicado no sobrescribe cuenta ni devuelve secretos', async () => {
    const before = await database.user.findUniqueOrThrow({
      where: { email: 'public@example.test' },
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Otro', email: 'public@example.test', password: 'Another-password!' })
      .expect(409);
    expect(response.body).not.toHaveProperty('accessToken');
    const after = await database.user.findUniqueOrThrow({
      where: { email: 'public@example.test' },
    });
    expect(after.id).toBe(before.id);
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.name).toBe(before.name);
  });

  it('limita registro a tres solicitudes por minuto e IP', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Otro', email: 'another@example.test', password })
      .expect(429);
    expect(await database.user.count({ where: { email: 'another@example.test' } })).toBe(0);
  });

  it('login falla genéricamente y limita intentos; salud sigue pública', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: `${randomUUID()}@example.test`, password })
      .expect(401);
    const wrong = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'a@example.test', password: 'incorrect' })
      .expect(401);
    expect(unknown.body.message).toBe(wrong.body.message);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'a@example.test', password })
      .expect(429);
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
