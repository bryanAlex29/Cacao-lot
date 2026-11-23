import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuthService } from '../src/auth/auth.service';
import { SESSION_COOKIE } from '../src/auth/browser-session.service';

describe('Sesiones renovables: cookie privada, rotación, CSRF y revocación', () => {
  let app: INestApplication, db: PrismaService, userId: string;
  const password = `Session-test!${randomBytes(12).toString('hex')}`;
  const email = 'renewal@example.test';
  const cookie = (value: string) => `${SESSION_COOKIE}=${value}`;
  const fresh = () => app.get(AuthService).login({ email, password });
  const refresh = (value: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:4200')
      .set('X-CacaoSmart-Session', '1')
      .set('Cookie', cookie(value))
      .send({});
  const logout = (value: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Origin', 'http://localhost:4200')
      .set('X-CacaoSmart-Session', '1')
      .set('Cookie', cookie(value))
      .send({});
  const readCookie = (response: request.Response): string => {
    const header = response.headers['set-cookie'] as unknown as string[];
    return header[0]!.split(';')[0]!.slice(SESSION_COOKIE.length + 1);
  };
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    userId = (
      await db.user.create({
        data: {
          name: 'Sesión de prueba',
          email,
          role: 'FARMER',
          passwordHash: await app.get(PasswordService).hash(password),
        },
      })
    ).id;
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it('login entrega JWT15m y cookie HttpOnly/Strict privada; solo guarda hash y vínculo de sesión', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const value = readCookie(response);
    const raw = (response.headers['set-cookie'] as unknown as string[])[0]!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\/api\/v1\/auth/);
    expect(response.body.expiresIn).toBe(900);
    expect(response.body).not.toHaveProperty('cookie');
    expect(response.headers['cache-control']).toBe('no-store');
    const [id, secret] = value.split('.');
    const session = await db.authSession.findUniqueOrThrow({ where: { id } });
    expect(session.refreshHash).not.toContain(secret);
    expect(session.refreshHash).toHaveLength(64);
    expect(session.expiresAt.getTime() - session.createdAt.getTime()).toBe(8 * 3600000);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(response.body.accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('rota refresh y admite concurrencia breve sin escribir una cookie anterior; no amplía ocho horas', async () => {
    const session = await fresh();
    const renewed = await refresh(session.cookie).expect(200),
      nextCookie = readCookie(renewed);
    expect(nextCookie).not.toBe(session.cookie);
    expect(renewed.body.accessToken).not.toBe(session.body.accessToken);
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: session.id } })).expiresAt,
    ).toEqual(session.expiresAt);
    const concurrent = await refresh(session.cookie).expect(200);
    expect(concurrent.headers['set-cookie']).toBeUndefined();
    await db.authSession.update({
      where: { id: session.id },
      data: { previousUntil: new Date(Date.now() - 1000) },
    });
    await refresh(session.cookie).expect(401);
    await refresh(nextCookie).expect(200);
  });
  it('dos pestañas concurrentes reciben JWT autorizado y solo una rota la cookie', async () => {
    const session = await fresh();
    const results = await Promise.all([refresh(session.cookie), refresh(session.cookie)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.filter((r) => r.headers['set-cookie'])).toHaveLength(1);
  });
  it('exige origen y header anti-CSRF; no admite campos ni usa JWT como sustituto de cookie', async () => {
    const session = await fresh();
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie(session.cookie))
      .send({})
      .expect(403);
    await refresh(session.cookie).set('Origin', 'https://untrusted.example').expect(403);
    await refresh(session.cookie).send({ userId }).expect(400);
    await refresh('invalid').expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:4200')
      .set('X-CacaoSmart-Session', '1')
      .auth(session.body.accessToken, { type: 'bearer' })
      .send({})
      .expect(401);
    await logout(session.cookie).set('Origin', 'https://untrusted.example').expect(403);
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    ).toBeNull();
  });
  it('revalida actividad/rol de cuenta y vencimiento absoluto, incluidos JWT ya emitidos', async () => {
    const session = await fresh();
    await db.user.update({ where: { id: userId }, data: { isActive: false } });
    await refresh(session.cookie).expect(401);
    await db.user.update({ where: { id: userId }, data: { isActive: true, role: 'ADMIN' } });
    const renewed = await refresh(session.cookie).expect(200);
    expect(renewed.body.user.role).toBe('ADMIN');
    await db.user.update({ where: { id: userId }, data: { role: 'FARMER' } });
    await db.authSession.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() - 9 * 3600000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await refresh(readCookie(renewed)).expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(renewed.body.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('cerrar sesión revoca refresh y todos los JWT vinculados, sin afectar otra sesión', async () => {
    const session = await fresh(),
      other = await fresh();
    const renewed = await refresh(session.cookie).expect(200),
      value = readCookie(renewed);
    await logout(`${session.id}.${randomBytes(32).toString('base64url')}`).expect(204);
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: session.id } })).revokedAt,
    ).toBeNull();
    const closed = await logout(value).expect(204);
    expect((closed.headers['set-cookie'] as unknown as string[])[0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
    await refresh(value).expect(401);
    for (const token of [session.body.accessToken, renewed.body.accessToken])
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(token, { type: 'bearer' })
        .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(other.body.accessToken, { type: 'bearer' })
      .expect(200);
  });
});
