import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('distingue API disponible de base no disponible', () => {
    service.check().subscribe((health) => expect(health).toEqual({ api: 'up', database: 'down' }));
    http.expectOne('/api/v1/health/live').flush({ status: 'ok' });
    http
      .expectOne('/api/v1/health/ready')
      .flush({ status: 'unavailable' }, { status: 503, statusText: 'Unavailable' });
  });

  it('no sustituye errores de red por estado saludable', () => {
    service
      .check()
      .subscribe((health) => expect(health).toEqual({ api: 'down', database: 'down' }));
    http.expectOne('/api/v1/health/live').error(new ProgressEvent('error'));
    http.expectOne('/api/v1/health/ready').error(new ProgressEvent('error'));
  });

  it('confirma ambos servicios solo con respuestas válidas', () => {
    service.check().subscribe((health) => expect(health).toEqual({ api: 'up', database: 'up' }));
    http.expectOne('/api/v1/health/live').flush({ status: 'ok' });
    http.expectOne('/api/v1/health/ready').flush({ status: 'ok', database: 'up' });
  });
});
