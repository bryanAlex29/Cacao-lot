import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/database/prisma.service';

describe('HTTP salud (base simulada)', () => {
  let app: INestApplication;
  const database = { ping: jest.fn<Promise<void>, []>() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService, { provide: PrismaService, useValue: database }],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('liveness responde sin consultar PostgreSQL', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .expect(200)
      .expect({ status: 'ok', service: 'cacaosmart-api' });
    expect(database.ping).not.toHaveBeenCalled();
  });

  it('readiness responde 200 con base disponible', async () => {
    database.ping.mockResolvedValueOnce(undefined);
    await request(app.getHttpServer())
      .get('/api/v1/health/ready')
      .expect(200)
      .expect({ status: 'ok', service: 'cacaosmart-api', database: 'up' });
  });

  it('readiness responde 503 sin filtrar secretos y liveness sigue activo', async () => {
    database.ping.mockRejectedValueOnce(new Error('postgresql://secret:password@private/database'));
    const response = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(response.body).toEqual({ status: 'unavailable', database: 'down' });
    expect(response.text).not.toContain('password');
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
  });
});
