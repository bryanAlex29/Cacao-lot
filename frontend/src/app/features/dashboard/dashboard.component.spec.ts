import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
  RouterLink,
} from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { By } from '@angular/platform-browser';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySnapshot } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { TelemetryFacade } from '../../core/telemetry/telemetry.facade';
import { DashboardComponent } from './dashboard.component';
import { chartSegments } from './soil-history-chart.component';
import { OfflineAlertsPanelComponent } from './offline-alerts-panel.component';
import { OfflineAlertsFacade } from '../../core/alerts/offline-alerts.facade';
import { SensorThresholdsFacade } from '../../core/sensor-thresholds/sensor-thresholds.facade';
import {
  historyStates,
  ThresholdHistoryFacade,
} from '../../core/sensor-thresholds/threshold-history.facade';
import {
  rangeStates,
  SensorRangeState,
} from '../../core/sensor-thresholds/sensor-thresholds.types';

describe('Dashboard de tres zonas', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(deviceCount = 1, role = 'FARMER') {
    const thresholdHistory = {
      states: signal(historyStates('idle')),
      stop: vi.fn(),
      load: vi.fn(),
      reload: vi.fn(),
    };
    const thresholds = {
      stop: vi.fn(),
      select: vi.fn(),
      reload: vi.fn(),
      reloadAfterSave: vi.fn(),
      states: signal(rangeStates('unselected')),
      busy: signal(false),
      hasErrors: signal(false),
    };
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
          useValue: { user: signal({ name: 'Usuario de prueba', role }), logout: vi.fn() },
        },
      ],
    })
      .overrideComponent(OfflineAlertsPanelComponent, {
        set: {
          template: '<p>Alertas de desconexión</p>',
          providers: [{ provide: OfflineAlertsFacade, useValue: { select: vi.fn() } }],
        },
      })
      .overrideComponent(DashboardComponent, {
        set: {
          providers: [
            { provide: TelemetryFacade, useValue: facade },
            { provide: SensorThresholdsFacade, useValue: thresholds },
            { provide: ThresholdHistoryFacade, useValue: thresholdHistory },
          ],
        },
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
          sensors: [],
        })),
        total: deviceCount,
        limit: 100,
        offset: 0,
      });
    fixture.detectChanges();
    http.verify();
    return { fixture, component: fixture.componentInstance, facade, thresholds, thresholdHistory };
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
    expect(element.textContent).not.toContain('Configurar rango');
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
  it('Alertas usa navegación Angular y desplaza el panel sin recargar ni cerrar sesión', async () => {
    const { fixture, component } = await setup();
    const scroll = vi
      .spyOn(TestBed.inject(ViewportScroller), 'scrollToAnchor')
      .mockImplementation(() => undefined);
    const link = fixture.debugElement.query(By.css('nav a[fragment="alerts"]'));
    expect(link.injector.get(RouterLink).fragment).toBe('alerts');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.nativeElement.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(scroll).toHaveBeenCalledWith('alerts');
    expect(component.selected()).toBe('device-0');
    expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
    link.nativeElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    );
    expect(scroll).toHaveBeenCalledTimes(2);
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
    const { component, facade, thresholds } = await setup();
    expect(facade.select).toHaveBeenCalledWith({
      plotId: 'plot',
      deviceId: 'device-0',
      source: 'real',
    });
    component.logout();
    expect(facade.stop).toHaveBeenCalled();
    expect(thresholds.stop).toHaveBeenCalled();
  });

  it('consulta rangos con el mismo equipo y origen y los limpia al cambiar selección', async () => {
    const { component, thresholds } = await setup();
    expect(thresholds.select).toHaveBeenCalledWith(
      { plotId: 'plot', deviceId: 'device-0', source: 'real' },
      [],
      true,
    );
    thresholds.stop.mockClear();
    component.setSource('demo');
    expect(thresholds.stop).toHaveBeenCalled();
    expect(thresholds.select).toHaveBeenCalledTimes(1);
  });

  it('muestra límites y unidades sin sustituir datos ausentes ni afirmar calibración', async () => {
    const { fixture, thresholds } = await setup();
    const range = {
      id: 'range',
      minValue: 0,
      maxValue: 60,
      version: 1,
      effectiveAt: '2026-11-21T00:00:00Z',
      updatedBy: 'admin',
      hysteresis: 0,
    };
    thresholds.states.set({
      ...rangeStates('unconfigured'),
      soil_1: { status: 'configured', range, unit: 'PERCENT', checkedAt: '2026-11-21T00:01:00Z' },
      temperatureC: {
        status: 'configured',
        range: { ...range, minValue: -10, maxValue: 35 },
        unit: 'CELSIUS',
        checkedAt: null,
      },
    });
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const soil = element.querySelector('app-soil-sensor-card');
    expect(soil?.textContent).toContain('Mín. 0 %');
    expect(soil?.textContent).toContain('Máx. 60 %');
    expect(soil?.textContent).toContain('Sin datos');
    expect(element.querySelector('.environment')?.textContent).toContain('Mín. -10 °C');
    expect(element.textContent).toContain('Sin rango configurado');
    expect(element.textContent).not.toContain('Normal');
    expect(element.querySelectorAll('app-sensor-range')).toHaveLength(5);
    expect(element.querySelector('.rain app-sensor-range')).toBeNull();
    expect(element.querySelectorAll('input')).toHaveLength(0);
  });

  it('reintenta rangos sin recargar telemetría y Actualizar consulta ambos', async () => {
    const { component, fixture, thresholds, facade } = await setup();
    thresholds.hasErrors.set(true);
    thresholds.states.set(rangeStates('error'));
    fixture.detectChanges();
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    buttons.find((b) => b.textContent?.includes('Reintentar rangos'))?.click();
    expect(thresholds.reload).toHaveBeenCalledTimes(1);
    expect(facade.reload).not.toHaveBeenCalled();
    component.refresh();
    expect(thresholds.reload).toHaveBeenCalledTimes(2);
    expect(facade.reload).toHaveBeenCalledTimes(1);
  });

  it('reconsulta configuración cuando el canal en vivo reconecta', async () => {
    const { fixture, facade, thresholds } = await setup();
    facade.stream.set('connected');
    fixture.detectChanges();
    expect(thresholds.reload).toHaveBeenCalledTimes(1);
    facade.stream.set('disconnected');
    fixture.detectChanges();
    facade.stream.set('connected');
    fixture.detectChanges();
    expect(thresholds.reload).toHaveBeenCalledTimes(2);
  });

  it('FARMER no abre el editor aunque invoque la acción directamente', async () => {
    const { component } = await setup();
    component.configureRange('soil_1', 'Zona A');
    expect(component.editing()).toBeNull();
  });

  it('guardar cierra el editor y actualiza solo las tarjetas de rangos', async () => {
    const { component, thresholds, facade, thresholdHistory } = await setup();
    component.rangeSaved();
    expect(thresholds.reloadAfterSave).toHaveBeenCalledTimes(1);
    expect(thresholdHistory.reload).toHaveBeenCalledTimes(1);
    expect(facade.reload).not.toHaveBeenCalled();
    expect(component.editing()).toBeNull();
    expect(component.rangeMessage()).toBe('Rango guardado correctamente.');
  });

  it('la consulta histórica sigue el dispositivo y logout limpia también los límites del gráfico', async () => {
    const { component, thresholdHistory } = await setup();
    expect(thresholdHistory.load).toHaveBeenCalledWith(
      { plotId: 'plot', deviceId: 'device-0', source: 'real' },
      [],
      true,
      [],
    );
    thresholdHistory.stop.mockClear();
    component.logout();
    expect(thresholdHistory.stop).toHaveBeenCalled();
  });

  it('ADMIN abre con UUID y versión originales; cambiar dispositivo cierra el editor', async () => {
    const { component, fixture, thresholds } = await setup(1, 'ADMIN');
    const range = {
      id: 'range',
      minValue: 10,
      maxValue: 70,
      version: 2,
      effectiveAt: '2026-11-21T00:00:00Z',
      updatedBy: 'admin',
      hysteresis: 0,
    };
    thresholds.states.set({
      ...rangeStates('unconfigured'),
      soil_1: { status: 'configured', range, unit: 'PERCENT', checkedAt: null },
    });
    component.devices.update((devices) =>
      devices.map((device) => ({
        ...device,
        sensors: [
          {
            id: 'soil-uuid',
            code: 'soil_1',
            variable: 'SOIL_MOISTURE',
            unit: 'PERCENT',
            enabled: true,
          },
        ],
      })),
    );
    fixture.detectChanges();
    expect(
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(
        (button) => button.textContent?.includes('Configurar rango'),
      ),
    ).toHaveLength(5);
    component.configureRange('soil_1', 'Zona A');
    expect(component.editing()?.sensor.id).toBe('soil-uuid');
    expect(component.editing()?.range?.version).toBe(2);
    thresholds.states.set(rangeStates('loading'));
    expect(component.editing()?.range?.version).toBe(2);
    component.chooseDevice('');
    expect(component.editing()).toBeNull();
  });

  it('clasifica cinco sensores independientemente y mantiene calidad, ausencia y errores separados', async () => {
    const { fixture, facade, thresholds } = await setup();
    const configured = (
      minValue: number,
      maxValue: number,
      unit: 'PERCENT' | 'CELSIUS' = 'PERCENT',
    ): SensorRangeState => ({
      status: 'configured',
      unit,
      checkedAt: null,
      range: {
        id: 'range',
        minValue,
        maxValue,
        version: 1,
        effectiveAt: '2026-11-21T00:00:00Z',
        updatedBy: 'admin',
        hysteresis: 0,
      },
    });
    thresholds.states.set({
      soil_1: configured(30, 50),
      soil_2: configured(40, 50),
      soil_3: configured(40, 50),
      temperatureC: configured(20, 30, 'CELSIUS'),
      airHumidityPct: configured(40, 60),
    });
    const snapshot: TelemetrySnapshot = {
      plotId: 'plot',
      source: 'real',
      device: {
        id: 'device-0',
        status: 'online',
        lastSeenAt: '2026-11-21T00:00:00Z',
        expectedIntervalSeconds: 60,
      },
      reading: {
        deviceId: 'device-0',
        eventId: 'event',
        source: 'real',
        recordedAt: null,
        receivedAt: '2026-11-21T00:00:00Z',
        timestampOrigin: 'server',
        soilMoisture: { soil_1: 25, soil_2: 45, soil_3: 70 },
        temperatureC: 28,
        airHumidityPct: 0,
        rainDetected: false,
        valve: { relayCommandedOpen: false, feedbackOpen: null },
        quality: {
          soil_1: 'uncalibrated',
          soil_2: 'uncalibrated',
          soil_3: 'uncalibrated',
          temperatureC: 'uncalibrated',
          airHumidityPct: 'uncalibrated',
          rainDetected: 'valid',
          relayCommandedOpen: 'valid',
          feedbackOpen: 'missing',
        },
      },
    };
    facade.snapshot.set(snapshot);
    facade.status.set('online');
    facade.stream.set('connected');
    facade.readingStale.set(false);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    const statuses = () =>
      Array.from(element.querySelectorAll('.assessment')).map((node) =>
        node.getAttribute('data-comparison'),
      );
    expect(statuses()).toEqual(['low', 'within', 'high', 'within', 'low']);
    expect(element.querySelectorAll('app-sensor-assessment')).toHaveLength(5);
    expect(element.querySelector('.rain app-sensor-assessment')).toBeNull();
    expect(element.textContent).toContain('Sin calibrar');
    expect(element.textContent).not.toContain('Normal');
    expect(element.querySelectorAll('.comparison.within')).toHaveLength(0);
    thresholds.states.update((states) => ({ ...states, soil_2: rangeStates('error').soil_2 }));
    fixture.detectChanges();
    expect(statuses()).toEqual(['low', 'unavailable', 'high', 'within', 'low']);
    facade.readingStale.set(true);
    fixture.detectChanges();
    expect(statuses()).toEqual(['stale', 'stale', 'stale', 'stale', 'stale']);
    expect(element.querySelectorAll('.comparison.within')).toHaveLength(0);
    facade.snapshot.set({
      ...snapshot,
      reading: {
        ...snapshot.reading!,
        temperatureC: 999,
        quality: { ...snapshot.reading!.quality, temperatureC: 'invalid' },
      },
    });
    fixture.detectChanges();
    expect(element.querySelector('.environment strong')?.textContent).toContain('—');
    expect(statuses()[3]).toBe('invalid');
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
