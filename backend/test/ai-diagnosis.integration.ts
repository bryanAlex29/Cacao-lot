import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuthService } from '../src/auth/auth.service';
import { DiagnosisService } from '../src/ai-diagnostics/diagnosis.service';
import { VisionAnalysisProvider } from '../src/ai-diagnostics/vision-analysis.provider';

describe('Diagnóstico DEMO privado con PostgreSQL y almacenamiento aislado', () => {
  let app: INestApplication,
    db: PrismaService,
    service: DiagnosisService,
    directory: string,
    image: Buffer;
  let farmer: Awaited<ReturnType<typeof account>>, other: Awaited<ReturnType<typeof account>>;
  const password = `Vision-test!${randomBytes(8).toString('hex')}`;
  async function account(role: 'ADMIN' | 'FARMER' = 'FARMER') {
    const email = `${randomUUID()}@example.test`;
    const user = await db.user.create({
      data: {
        email,
        role,
        name: 'Diagnóstico de prueba',
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    const plot = await db.plot.create({
      data: { name: 'Cacao de prueba', locationLabel: 'Chone', ownerId: user.id },
    });
    const session = await app.get(AuthService).login({ email, password });
    return { user, plot, token: session.body.accessToken };
  }
  const input = (plotId: string, requestId: string = randomUUID()) => ({
    plotId,
    requestId,
    consentVersion: 'demo-v1',
    retentionDays: 7,
    notes: 'Observación de prueba',
  });
  const upload = (token: string, fields: Record<string, string | number>, bytes = image) => {
    const req = request(app.getHttpServer())
      .post('/api/v1/ai-diagnostics')
      .auth(token, { type: 'bearer' });
    for (const [key, value] of Object.entries(fields)) req.field(key, String(value));
    return req.attach('image', bytes, { filename: '../../private.png', contentType: 'image/png' });
  };
  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal');
    directory = await mkdtemp(join(tmpdir(), 'cacaosmart-vision-integration-'));
    process.env['IMAGE_STORAGE_PATH'] = directory;
    process.env['AI_PROVIDER'] = 'mock';
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    service = app.get(DiagnosisService);
    image = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'green' } })
      .withExif({ IFD0: { Artist: 'private-name' } })
      .png()
      .toBuffer();
    farmer = await account();
    other = await account('ADMIN');
  });
  afterAll(async () => {
    if (app) await app.close();
    if (directory) await rm(directory, { recursive: true, force: true });
    delete process.env['IMAGE_STORAGE_PATH'];
    delete process.env['AI_PROVIDER'];
  });
  afterEach(() => jest.restoreAllMocks());

  it('exige JWT, propiedad incluso ADMIN, consentimiento y contenido real', async () => {
    await request(app.getHttpServer()).get('/api/v1/ai-diagnostics/config').expect(401);
    await upload(other.token, input(farmer.plot.id)).expect(404);
    const noConsent = { plotId: farmer.plot.id, requestId: randomUUID() };
    await upload(farmer.token, noConsent).expect(400);
    await upload(farmer.token, { ...input(farmer.plot.id), ownerId: other.user.id }).expect(400);
    await upload(farmer.token, input(farmer.plot.id), Buffer.from('fake PNG')).expect(400);
    await upload(farmer.token, { ...input(farmer.plot.id), retentionDays: 0 }).expect(400);
    await upload(farmer.token, input(farmer.plot.id), Buffer.alloc(8 * 1048576 + 1)).expect(413);
    expect(await db.aiDiagnosis.count()).toBe(0);
    expect(await readdir(directory)).toEqual([]);
  });
  it('FARMER guarda DEMO con consentimiento, JPEG privado sin EXIF y sin rutas/hash públicos', async () => {
    const response = await upload(farmer.token, input(farmer.plot.id)).expect(201);
    expect(response.body).toMatchObject({ source: 'demo', provider: 'mock', status: 'completed' });
    expect(response.body.result.possibleCauses).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /imageKey|payloadHash|private-name|credential/,
    );
    const saved = await db.aiDiagnosis.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(saved.consentVersion).toBe('demo-v1');
    expect(saved.userId).toBe(farmer.user.id);
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(7 * 86400000);
    const photo = await request(app.getHttpServer())
      .get(`/api/v1/ai-diagnostics/${saved.id}/image`)
      .auth(farmer.token, { type: 'bearer' })
      .expect(200);
    expect(photo.headers['content-type']).toContain('image/jpeg');
    expect(photo.headers['cache-control']).toBe('no-store');
    expect((await sharp(photo.body as Buffer).metadata()).exif).toBeUndefined();
    await request(app.getHttpServer()).get(`/api/v1/ai-diagnostics/${saved.id}/image`).expect(401);
    for (const suffix of ['', '/image'])
      await request(app.getHttpServer())
        .get(`/api/v1/ai-diagnostics/${saved.id}${suffix}`)
        .auth(other.token, { type: 'bearer' })
        .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/ai-diagnostics/${saved.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
  });
  it('reintentos concurrentes con misma clave no duplican archivos, cuota ni proveedor; conflicto de payload', async () => {
    const own = await account(),
      body = input(own.plot.id);
    const provider = jest.spyOn(app.get(VisionAnalysisProvider), 'analyze');
    const [first, second] = await Promise.all([
      service.create(own.user.id, body, { buffer: image }),
      service.create(own.user.id, body, { buffer: image }),
    ]);
    expect(first.id).toBe(second.id);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await db.aiDiagnosis.count({ where: { userId: own.user.id } })).toBe(1);
    await expect(
      service.create(own.user.id, { ...body, notes: 'Cambió' }, { buffer: image }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('nunca retiene más días de los aceptados aunque cambie la configuración del servidor', async () => {
    const own = await account();
    const config = app.get(ConfigService);
    config.set('IMAGE_RETENTION_DAYS', 30);
    try {
      const record = await service.create(
        own.user.id,
        { ...input(own.plot.id), retentionDays: 1 },
        { buffer: image },
      );
      expect(new Date(record.expiresAt).getTime() - new Date(record.createdAt).getTime()).toBe(
        86400000,
      );
    } finally {
      config.set('IMAGE_RETENTION_DAYS', 7);
    }
  });
  it('historial paginado aislado, sin acceso a parcelas ajenas o archivadas', async () => {
    const page = await request(app.getHttpServer())
      .get(`/api/v1/ai-diagnostics?plotId=${farmer.plot.id}&limit=1&offset=0`)
      .auth(farmer.token, { type: 'bearer' })
      .expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.total).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/ai-diagnostics?plotId=${farmer.plot.id}`)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/ai-diagnostics?plotId=${farmer.plot.id}&from=bad`)
      .auth(farmer.token, { type: 'bearer' })
      .expect(400);
    await db.plot.update({ where: { id: farmer.plot.id }, data: { archivedAt: new Date() } });
    await expect(service.get(page.body.items[0].id, farmer.user.id)).rejects.toMatchObject({
      status: 404,
    });
    await db.plot.update({ where: { id: farmer.plot.id }, data: { archivedAt: null } });
  });
  it('cuota diaria serializada incluye fallos/eliminados; un reintento previo sigue permitido', async () => {
    const own = await account();
    const config = app.get(ConfigService);
    config.set('AI_DAILY_LIMIT_PER_USER', 2);
    try {
      const one = input(own.plot.id);
      const first = await service.create(own.user.id, one, { buffer: image });
      await service.remove(first.id, own.user.id);
      const attempts = await Promise.allSettled([
        service.create(own.user.id, input(own.plot.id), { buffer: image }),
        service.create(own.user.id, input(own.plot.id), { buffer: image }),
      ]);
      expect(attempts.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
      expect(attempts.filter((v) => v.status === 'rejected')).toHaveLength(1);
      const success = attempts.find((v) => v.status === 'fulfilled') as PromiseFulfilledResult<
        Awaited<ReturnType<typeof service.create>>
      >;
      const stored = await db.aiDiagnosis.findUniqueOrThrow({ where: { id: success.value.id } });
      expect(
        (
          await service.create(
            own.user.id,
            { ...input(own.plot.id, stored.requestId) },
            { buffer: image },
          )
        ).id,
      ).toBe(stored.id);
      expect(await db.aiDiagnosis.count({ where: { userId: own.user.id } })).toBe(2);
    } finally {
      config.set('AI_DAILY_LIMIT_PER_USER', 5);
    }
  });
  it('exime solo al UUID configurado, conserva idempotencia y permite revocar sin borrar historial', async () => {
    const exempt = await account(),
      limited = await account();
    const config = app.get(ConfigService);
    config.set('AI_DAILY_LIMIT_PER_USER', 1);
    config.set('AI_UNLIMITED_USER_ID', exempt.user.id);
    const provider = jest.spyOn(app.get(VisionAnalysisProvider), 'analyze');
    try {
      const ownConfig = await request(app.getHttpServer())
        .get('/api/v1/ai-diagnostics/config')
        .auth(exempt.token, { type: 'bearer' })
        .expect(200);
      expect(ownConfig.body.dailyLimit).toBeNull();
      expect(ownConfig.headers['cache-control']).toBe('no-store');
      expect(JSON.stringify(ownConfig.body)).not.toContain(exempt.user.id);
      const otherConfig = await request(app.getHttpServer())
        .get('/api/v1/ai-diagnostics/config')
        .auth(limited.token, { type: 'bearer' })
        .expect(200);
      expect(otherConfig.body.dailyLimit).toBe(1);
      const body = input(exempt.plot.id);
      const first = await service.create(exempt.user.id, body, { buffer: image });
      await service.create(exempt.user.id, input(exempt.plot.id), { buffer: image });
      expect((await service.create(exempt.user.id, body, { buffer: image })).id).toBe(first.id);
      expect(provider).toHaveBeenCalledTimes(2);
      await service.create(limited.user.id, input(limited.plot.id), { buffer: image });
      await expect(
        service.create(limited.user.id, input(limited.plot.id), { buffer: image }),
      ).rejects.toMatchObject({ status: 429 });
      await expect(
        service.create(exempt.user.id, input(limited.plot.id), { buffer: image }),
      ).rejects.toMatchObject({ status: 404 });
      config.set('AI_UNLIMITED_USER_ID', '');
      expect(service.options(exempt.user.id).dailyLimit).toBe(1);
      await expect(
        service.create(exempt.user.id, input(exempt.plot.id), { buffer: image }),
      ).rejects.toMatchObject({ status: 429 });
      expect(await db.aiDiagnosis.count({ where: { userId: exempt.user.id } })).toBe(2);
    } finally {
      config.set('AI_DAILY_LIMIT_PER_USER', 5);
      config.set('AI_UNLIMITED_USER_ID', '');
    }
  });
  it('el cliente no puede solicitar exención con campos del formulario', async () => {
    const own = await account();
    await upload(own.token, { ...input(own.plot.id), dailyLimit: 'unlimited' }).expect(400);
    expect(await db.aiDiagnosis.count({ where: { userId: own.user.id } })).toBe(0);
  });
  it.each(['malformed', 'unavailable', 'timeout'])(
    'fallo %s conserva estado sin diagnóstico inventado y borra imagen',
    async (kind) => {
      const own = await account();
      const provider = jest.spyOn(app.get(VisionAnalysisProvider), 'analyze');
      if (kind === 'malformed') provider.mockResolvedValue({ command: 'open-valve' });
      if (kind === 'unavailable') provider.mockRejectedValue(new Error('private-provider-details'));
      if (kind === 'timeout') provider.mockImplementation(() => new Promise(() => undefined));
      const config = app.get(ConfigService);
      config.set('AI_REQUEST_TIMEOUT_MS', 10);
      try {
        const response = await service.create(own.user.id, input(own.plot.id), { buffer: image });
        expect(response).toMatchObject({
          status: 'failed',
          result: null,
          hasImage: false,
          errorCode: 'ANALYSIS_FAILED',
        });
        expect(JSON.stringify(response)).not.toContain('private-provider-details');
        await expect(service.image(response.id, own.user.id)).rejects.toMatchObject({
          status: 404,
        });
      } finally {
        config.set('AI_REQUEST_TIMEOUT_MS', 10000);
      }
    },
  );
  it('elimina foto/resultado, mantiene tombstone privado para cuota y no permite recuperación', async () => {
    const own = await account();
    const record = await service.create(own.user.id, input(own.plot.id), { buffer: image });
    await request(app.getHttpServer())
      .delete(`/api/v1/ai-diagnostics/${record.id}`)
      .auth(own.token, { type: 'bearer' })
      .expect(204);
    await expect(service.get(record.id, own.user.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.image(record.id, own.user.id)).rejects.toMatchObject({ status: 404 });
    const tombstone = await db.aiDiagnosis.findUniqueOrThrow({ where: { id: record.id } });
    expect(tombstone).toMatchObject({ notes: null, result: null, imageKey: null });
    expect(tombstone.deletedAt).not.toBeNull();
    await expect(readFile(join(directory, `${record.id}.jpg`))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('retención elimina archivos/registros vencidos y recupera pending interrumpidos', async () => {
    const own = await account();
    const record = await service.create(own.user.id, input(own.plot.id), { buffer: image });
    await db.aiDiagnosis.update({
      where: { id: record.id },
      data: { createdAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(service.get(record.id, own.user.id)).rejects.toMatchObject({ status: 404 });
    const pending = await db.aiDiagnosis.create({
      data: {
        userId: own.user.id,
        plotId: own.plot.id,
        requestId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        status: 'pending',
        consentAt: new Date(),
        consentVersion: 'demo-v1',
        createdAt: new Date(Date.now() - 600000),
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await expect(service.remove(pending.id, own.user.id)).rejects.toMatchObject({ status: 409 });
    await service.cleanup();
    expect(await db.aiDiagnosis.findUnique({ where: { id: record.id } })).toBeNull();
    await expect(readFile(join(directory, `${record.id}.jpg`))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect((await db.aiDiagnosis.findUniqueOrThrow({ where: { id: pending.id } })).errorCode).toBe(
      'ANALYSIS_INTERRUPTED',
    );
  });
  it('OpenAI exige consentimiento externo, persiste proveedor y no reenvía solicitudes existentes', async () => {
    const own = await account();
    const demo = await service.create(own.user.id, input(own.plot.id), { buffer: image });
    const config = app.get(ConfigService);
    const provider = jest.spyOn(app.get(VisionAnalysisProvider), 'analyze').mockResolvedValue({
      plantPart: 'unknown',
      visibleSymptoms: [],
      possibleCauses: [],
      uncertainty: 'high',
      recommendedActions: ['Solicitar fotografías nítidas y revisión técnica.'],
      requiresExpertReview: true,
      disclaimer: 'No concluyente; análisis orientativo.',
    });
    config.set('AI_PROVIDER', 'openai');
    try {
      await upload(own.token, input(own.plot.id)).expect(400);
      expect(provider).not.toHaveBeenCalled();
      const body = { ...input(own.plot.id), consentVersion: 'openai-v1' };
      const record = (await upload(own.token, body).expect(201)).body;
      expect(record).toMatchObject({ provider: 'openai', source: 'real', status: 'completed' });
      expect(provider).toHaveBeenCalledTimes(1);
      const sanitized = provider.mock.calls[0][0];
      expect((await sharp(sanitized).metadata()).exif).toBeUndefined();
      expect(provider.mock.calls[0][1]).toBe(body.notes);
      expect((await upload(own.token, body).expect(201)).body.id).toBe(record.id);
      expect(provider).toHaveBeenCalledTimes(1);
      const saved = await db.aiDiagnosis.findUniqueOrThrow({ where: { id: record.id } });
      expect(saved).toMatchObject({ provider: 'openai', consentVersion: 'openai-v1' });
      expect(await service.get(demo.id, own.user.id)).toMatchObject({
        provider: 'mock',
        source: 'demo',
      });
      await request(app.getHttpServer())
        .get(`/api/v1/ai-diagnostics/${record.id}`)
        .auth(other.token, { type: 'bearer' })
        .expect(404);
      await service.remove(record.id, own.user.id);
      await expect(service.get(record.id, own.user.id)).rejects.toMatchObject({ status: 404 });
    } finally {
      config.set('AI_PROVIDER', 'mock');
    }
  });
  it('disabled no procesa imágenes ni afecta salud', async () => {
    const config = app.get(ConfigService);
    config.set('AI_PROVIDER', 'disabled');
    try {
      await expect(
        service.create(farmer.user.id, input(farmer.plot.id), { buffer: image }),
      ).rejects.toMatchObject({ status: 503 });
      await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    } finally {
      config.set('AI_PROVIDER', 'mock');
    }
  });
  it('combina fechas inclusivas y estado en SQL antes de paginar, con total filtrado y aislamiento', async () => {
    const own = await account();
    const now = Date.now(),
      from = new Date(now - 120000),
      to = new Date(now - 60000);
    const row = (status: string, createdAt: Date) => ({
      id: randomUUID(),
      userId: own.user.id,
      plotId: own.plot.id,
      requestId: randomUUID(),
      payloadHash: 'a'.repeat(64),
      status,
      consentVersion: 'demo-v1',
      consentAt: createdAt,
      createdAt,
      expiresAt: new Date(now + 86400000),
    });
    const completed = Array.from({ length: 12 }, () => row('completed', from));
    const failed = row('failed', to),
      pending = row('pending', from);
    const hidden = row('completed', from),
      expired = row('completed', from);
    await db.aiDiagnosis.createMany({
      data: [
        ...completed,
        failed,
        pending,
        row('completed', new Date(from.getTime() - 1)),
        row('completed', new Date(to.getTime() + 1)),
        { ...hidden, deletedAt: new Date() },
        { ...expired, expiresAt: new Date(now - 1000) },
        { ...row('completed', from), plotId: other.plot.id, userId: other.user.id },
      ],
    });
    const path = '/api/v1/ai-diagnostics';
    const query = {
      plotId: own.plot.id,
      from: from.toISOString(),
      to: to.toISOString(),
      status: 'completed',
      limit: 10,
    };
    const first = await request(app.getHttpServer())
      .get(path)
      .query({ ...query, offset: 0 })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    const second = await request(app.getHttpServer())
      .get(path)
      .query({ ...query, offset: 10 })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    expect(first.body.total).toBe(12);
    expect(first.body.items).toHaveLength(10);
    expect(second.body.total).toBe(12);
    expect(second.body.items).toHaveLength(2);
    expect(
      new Set([...first.body.items, ...second.body.items].map((item: { id: string }) => item.id)),
    ).toEqual(new Set(completed.map((item) => item.id)));
    const end = await request(app.getHttpServer())
      .get(path)
      .query({ ...query, status: 'failed' })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    expect(end.body.items.map((item: { id: string }) => item.id)).toEqual([failed.id]);
    const start = await request(app.getHttpServer())
      .get(path)
      .query({
        plotId: own.plot.id,
        from: from.toISOString(),
        to: from.toISOString(),
        status: 'pending',
      })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    expect(start.body.items.map((item: { id: string }) => item.id)).toEqual([pending.id]);
    const offsetZone = (value: Date) =>
      new Date(value.getTime() - 5 * 3600000).toISOString().slice(0, -1) + '-05:00';
    const local = await request(app.getHttpServer())
      .get(path)
      .query({ ...query, from: offsetZone(from), to: offsetZone(to), limit: 100 })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    expect(local.body.total).toBe(12);
    const all = await request(app.getHttpServer())
      .get(path)
      .query({ plotId: own.plot.id, limit: 100 })
      .auth(own.token, { type: 'bearer' })
      .expect(200);
    expect(all.body.total).toBe(16);
    await request(app.getHttpServer())
      .get(path)
      .query(query)
      .auth(other.token, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer()).get(path).query(query).expect(401);
    expect(JSON.stringify(first.body)).not.toMatch(/imageKey|payloadHash/);
    const provider = jest.spyOn(app.get(VisionAnalysisProvider), 'analyze');
    await service.list(own.user.id, { ...query, status: 'completed', offset: 0 });
    expect(provider).not.toHaveBeenCalled();
  });
  it.each([
    { from: '2026-11-23T00:00:00Z' },
    { to: '2026-11-23T00:00:00Z' },
    { from: '2026-11-24T00:00:00Z', to: '2026-11-23T00:00:00Z' },
    { from: '2026-01-01T00:00:00Z', to: '2026-02-02T00:00:00Z' },
    { from: '2026-02-30T00:00:00Z', to: '2026-03-01T00:00:00Z' },
    { status: 'unknown' },
    { from: '2026-11-23', to: '2026-11-24' },
  ])('rechaza periodo/estado inválido sin cambiar diagnósticos %j', async (filters) => {
    const before = await db.aiDiagnosis.count();
    await request(app.getHttpServer())
      .get('/api/v1/ai-diagnostics')
      .query({ plotId: farmer.plot.id, ...filters })
      .auth(farmer.token, { type: 'bearer' })
      .expect(400);
    expect(await db.aiDiagnosis.count()).toBe(before);
  });
});
