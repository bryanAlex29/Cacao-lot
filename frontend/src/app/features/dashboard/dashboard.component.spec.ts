import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySnapshot } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { TelemetryFacade } from '../../core/telemetry/telemetry.facade';
import { DashboardComponent } from './dashboard.component';
import { chartSegments } from './soil-history-chart.component';

describe('Dashboard de tres zonas', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(deviceCount = 1) {
    const facade = {
      stop: vi.fn(),
      select: vi.fn(),
      reload: vi.fn(),
      reconnect: vi.fn(),
      setDays: vi.fn(),
      page: vi.fn(),
      snapshot: signal<TelemetrySnapshot | null>(null),
      history: signal({ items: [], total: 0, limit: 100, offset: 0 }),
      busy: signal(false),
      status: signal('unknown'),
      stream: signal('connecting'),
      error: signal(''),
      days: signal(1),
      offset: signal(0),
      readingStale: signal(true),
    };
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'plot' })) } },
        {
          provide: AuthService,
          useValue: { user: signal({ name: 'Agricultor', role: 'FARMER' }), logout: vi.fn() },
        },
      ],
    })
      .overrideComponent(DashboardComponent, {
        set: { providers: [{ provide: TelemetryFacade, useValue: facade }] },
      })
      .compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/plots/plot')
      .flush({ id: 'plot', name: 'Cacao de prueba', locationLabel: 'Chone' });
    http
      .expectOne((r) => r.url === '/api/v1/plots/plot/devices')
      .flush({
        items: Array.from({ length: deviceCount }, (_, i) => ({
          id: `device-${i}`,
          serial: `ESP32-${i}`,
          source: 'real',
          isActive: true,
        })),
        total: deviceCount,
        limit: 100,
        offset: 0,
      });
    fixture.detectChanges();
    http.verify();
    return { fixture, component: fixture.componentInstance, facade };
  }
  it('muestra tres identidades, sin inventar humedad, consumo ni diagnóstico', async () => {
    const { fixture } = await setup();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('app-soil-sensor-card')).toHaveLength(3);
    expect(element.textContent).toContain('Zona A');
    expect(element.textContent).toContain('Zona B');
    expect(element.textContent).toContain('Zona C');
    expect(element.textContent).toContain('Sin datos');
    expect(element.textContent).toContain('No calculable');
    expect(element.textContent).toContain('No se ha analizado ninguna imagen');
    expect(element.querySelector('input[type=file]')).toBeNull();
  });
  it('elige dispositivo único y no mezcla cuando hay varios', async () => {
    const { component, facade } = await setup(2);
    expect(component.selected()).toBe('');
    expect(facade.select).not.toHaveBeenCalled();
    component.chooseDevice('device-1');
    expect(facade.select).toHaveBeenCalledWith({
      plotId: 'plot',
      deviceId: 'device-1',
      source: 'real',
    });
  });
  it('origen DEMO permanece explícito y no toma un dispositivo real', async () => {
    const { component, fixture, facade } = await setup();
    facade.select.mockClear();
    component.setSource('demo');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DEMO · Datos simulados');
    expect(component.selected()).toBe('');
    expect(facade.select).not.toHaveBeenCalled();
  });
  it('enlace de parcela tiene selección explícita y logout limpia telemetría', async () => {
    const { component, facade } = await setup();
    expect(facade.select).toHaveBeenCalledWith({
      plotId: 'plot',
      deviceId: 'device-0',
      source: 'real',
    });
    component.logout();
    expect(facade.stop).toHaveBeenCalled();
  });
});

describe('Gráfica no interpola ausencias', () => {
  it('crea segmentos separados por sonda ausente y hueco temporal', () => {
    const row = (time: number, value: number | null) => ({
      eventId: String(time),
      receivedAt: new Date(time).toISOString(),
      recordedAt: null,
      soilMoisture: { soil_1: value },
      quality: { soil_1: value === null ? 'missing' : 'uncalibrated' },
    });
    const rows = [row(300000, 60), row(20000, 40), row(10000, null), row(0, 0)] as Parameters<
      typeof chartSegments
    >[0];
    const result = chartSegments(rows, 'soil_1', 120000);
    expect((result.path.match(/M/g) ?? []).length).toBe(3);
    expect(result.points).toHaveLength(3);
    expect(result.path).not.toContain('L');
  });
});
