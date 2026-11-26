import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { IotTelemetryPayload } from '@cacaosmart/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { AuthService } from '../src/auth/auth.service';
import { DevicesService } from '../src/devices/devices.service';

interface Step {
  name: string;
  expectedStatus: number;
  expectedDuplicate?: boolean;
  payload: IotTelemetryPayload;
}

describe('Escenarios ficticios contra HTTP y PostgreSQL temporal', () => {
  let app: INestApplication;
  let db: PrismaService;
  let deviceId: string;
  let key: string;
  let token: string;
  let plotId: string;
  let steps: Step[];

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal generada por el runner');
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    db = app.get(PrismaService);
    const password = 'Synthetic-test!';
    const owner = await db.user.create({
      data: {
        name: 'Escenarios ficticios',
        email: 'scenarios@example.test',
        role: 'ADMIN',
        passwordHash: await app.get(PasswordService).hash(password),
      },
    });
    token = (await app.get(AuthService).login({ email: owner.email, password })).body.accessToken;
    plotId = (
      await db.plot.create({
        data: { ownerId: owner.id, name: 'DEMO aislada', locationLabel: 'No campo real' },
      })
    ).id;
    const device = await app.get(DevicesService).create(plotId, owner.id, {
      serial: 'synthetic-scenarios',
      source: 'demo',
      expectedIntervalSeconds: 5,
    });
    deviceId = device.id;
    key = device.deviceKey;
    // Exercise the same public generator as the offline preview; no credentials in argv/stdout.
    const code = `import {simulationScenarios} from './scripts/simulation-scenarios.mjs';let text='';for await(const c of process.stdin)text+=c;const p=JSON.parse(text);console.log(JSON.stringify(simulationScenarios(p.id,p.now)));`;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: resolve(__dirname, '../..'),
      input: JSON.stringify({ id: deviceId, now: new Date().toISOString() }),
      encoding: 'utf8',
      timeout: 10000,
    });
    steps = (JSON.parse(result) as { steps: Step[] }).steps;
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('reproduce 13 pasos, verifica almacenamiento, rechazos y última lectura sin mezclar REAL', async () => {
    let stored = 0;
    let latestId: string | undefined;
    for (const step of steps) {
      const before = await db.reading.count({ where: { deviceId } });
      const response = await request(app.getHttpServer())
        .post('/api/v1/iot/telemetry')
        .set('X-Device-Id', deviceId)
        .set('X-Device-Key', key)
        .send(step.payload)
        .expect(step.expectedStatus);
      if (step.expectedStatus === 201) {
        expect(response.body.reading.source).toBe('demo');
        expect(response.body.duplicate).toBe(step.expectedDuplicate ?? false);
        expect(response.body.reading.valve.feedbackOpen).toBeNull();
        if (!step.expectedDuplicate) stored++;
        if (!step.expectedDuplicate && step.name !== 'late-message')
          latestId = step.payload.eventId;
        if (step.name === 'missing-soil-2') {
          expect(response.body.reading.soilMoisture).toEqual({
            soil_1: 0,
            soil_2: null,
            soil_3: 65,
          });
          expect(response.body.reading.quality.soil_2).toBe('missing');
        }
      } else {
        expect(await db.reading.count({ where: { deviceId } })).toBe(before);
      }
      const snapshot = await request(app.getHttpServer())
        .get(`/api/v1/plots/${plotId}/dashboard`)
        .auth(token, { type: 'bearer' })
        .query({ source: 'demo', deviceId })
        .expect(200);
      expect(snapshot.body.reading.eventId).toBe(latestId);
      expect(await db.reading.count({ where: { deviceId } })).toBe(stored);
    }
    expect(stored).toBe(9);
    expect(await db.soilReading.count()).toBe(stored * 3);
    expect(await db.reading.count({ where: { source: 'real' } })).toBe(0);
  });
});
