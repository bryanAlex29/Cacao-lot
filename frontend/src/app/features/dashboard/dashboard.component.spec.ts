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

describe('Dashboard de un sensor de suelo', () => {
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
      period: signal(null),
      setPeriod: vi.fn(),
      irrigationRefresh: signal(0),
      sensorRefresh: signal(0),
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
    http
      .expectOne('/api/v1/plots/plot/weather/current')
      .flush({ plotId: 'plot', status: 'location_required', current: null });
    fixture.detectChanges();
    http.verify();
    return { fixture, component: fixture.componentInstance, facade, thresholds, thresholdHistory };
  }
  it('muestra solo sensor 1 sin alterar contratos ni inventar humedad, consumo o diagnóstico', async () => {
    const { fixture } = await setup();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelectorAll('app-soil-sensor-card')).toHaveLength(1);
    expect(element.textContent).toContain('Zona A');
    expect(element.textContent).not.toContain('Zona B');
    expect(element.textContent).not.toContain('Zona C');
    expect(element.textContent).not.toContain('Sensor 2');
    expect(element.textContent).not.toContain('Sensor 3');
    expect(element.textContent).toContain('Sin datos');
    expect(element.textContent).toContain('No calculable');
    expect(element.textContent).toContain('El proveedor simulado no evalúa enfermedades reales');
    expect(element.querySelector('app-diagnosis-preview a')?.getAttribute('href')).toContain(
      '/diagnostico-ia',
    );
    expect(element.querySelector('input[type=file]')).toBeNull();
    expect(element.textContent).not.toContain('Configurar rango');
  });
  it('replaces rain with current weather without exposing a rain simulation', async () => {
    const { fixture, component, facade } = await setup();
    const before = facade.snapshot();
    const source = component.source();
    const selected = component.selected();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('app-current-weather-card')).not.toBeNull();
    expect(element.textContent).toContain('Clima actual');
    expect(element.textContent).not.toContain('Simular lluvia');
    expect(element.querySelector('app-rain-simulation')).toBeNull();
    expect(element.querySelector('app-reports-panel')).not.toBeNull();
    expect(element.querySelector('app-irrigation-history')).not.toBeNull();
    expect(element.querySelector('app-dashboard-insights')).not.toBeNull();
    expect(element.querySelector('app-soil-history-chart')).not.toBeNull();
    expect(facade.snapshot()).toBe(before);
    expect(component.source()).toBe(source);
    expect(component.selected()).toBe(selected);
    TestBed.inject(HttpTestingController).expectNone((req) => req.method !== 'GET');
    expect(component.source()).toBe('real');
  });
  it('keeps the water example inside its card without replacing live views, reports or selection', async () => {
    const { fixture, component, facade } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    const originalSnapshot = facade.snapshot();
    const originalSource = component.source();
    const originalDevice = component.selected();
    const soilBefore = root.querySelector('app-soil-sensor-card')?.textContent;
    const environmentBefore = root.querySelector('.environment')?.textContent;
    const relayBefore = root.querySelector('.irrigation-body')?.textContent;
    const exampleButton = root.querySelector<HTMLButtonElement>(
      '.water app-water-consumption-example button',
    )!;
    exampleButton.click();
    fixture.detectChanges();
    expect(root.querySelector('.water .demo-badge')?.textContent).toContain('DEMO');
    expect(root.querySelector('.water')?.textContent).toContain('20 %');
    expect(root.querySelector('app-rain-simulation')).toBeNull();
    expect(root.querySelector('app-reports-panel')).not.toBeNull();
    expect(root.querySelector('app-irrigation-history')).not.toBeNull();
    expect(root.querySelector('app-soil-history-chart')).not.toBeNull();
    expect(root.querySelector('app-soil-sensor-card')?.textContent).toBe(soilBefore);
    expect(root.querySelector('.environment')?.textContent).toBe(environmentBefore);
    expect(root.querySelector('.irrigation-body')?.textContent).toBe(relayBefore);
    expect(facade.snapshot()).toBe(originalSnapshot);
    expect(component.source()).toBe(originalSource);
    expect(component.selected()).toBe(originalDevice);
    TestBed.inject(HttpTestingController).expectNone((request) => request.method !== 'GET');
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

  it.each([
    [true, 'Relé activo'],
    [false, 'Relé apagado'],
    [null, 'Orden del relé desconocida'],
  ] as const)(
    'muestra el relé ThingSpeak %s sin confirmar posición de válvula',
    async (relay, label) => {
      const { fixture, facade } = await setup();
      facade.snapshot.set({
        plotId: 'plot',
        source: 'real',
        device: {
          id: 'device-0',
          status: 'online',
          lastSeenAt: '2026-11-26T00:00:00Z',
          expectedIntervalSeconds: 60,
        },
        reading: {
          deviceId: 'device-0',
          eventId: 'thingspeak:3554501:400',
          source: 'real',
          recordedAt: null,
          receivedAt: '2026-11-26T00:00:02Z',
          providerObservedAt: '2026-11-26T00:00:00Z',
          timestampOrigin: 'server',
          soilMoisture: { soil_1: 43, soil_2: null, soil_3: null },
          temperatureC: 26,
          airHumidityPct: 62,
          rainDetected: null,
          valve: { relayCommandedOpen: relay, feedbackOpen: null },
          quality: {
            soil_1: 'valid',
            soil_2: 'missing',
            soil_3: 'missing',
            temperatureC: 'uncalibrated',
            airHumidityPct: 'uncalibrated',
            rainDetected: 'missing',
            relayCommandedOpen: relay === null ? 'missing' : 'valid',
            feedbackOpen: 'missing',
          },
        },
      });
      fixture.detectChanges();
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelector('.irrigation-body strong')?.textContent?.trim()).toBe(label);
      expect(root.querySelector('.irrigation-metrics')?.textContent).toContain('No disponible');
      expect(root.querySelector('.irrigation-metrics')?.textContent).not.toContain('Abierta');
      expect(root.querySelector('.irrigation-body')?.textContent).toContain(
        'no confirma apertura física',
      );
      expect(root.querySelector('.irrigation button')).toBeNull();
      TestBed.inject(HttpTestingController).expectNone((request) => request.method !== 'GET');
    },
  );
  it('encabezado sin equipo seleccionado no inventa conexión', async () => {
    const { fixture, component } = await setup(2);
    expect(component.headerConnection()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-page-header .connection')).toBeNull();
  });
  it('encabezado degrada un online sin canal actualizado y no da verde sin lectura', async () => {
    const { component, facade } = await setup();
    facade.status.set('online');
    facade.stream.set('error');
    expect(component.headerConnection()?.label).toBe('Conexión o datos sin actualizar');
    expect(component.headerConnection()?.healthy).toBe(false);
    facade.stream.set('connected');
    facade.readingStale.set(false);
    expect(component.headerConnection()?.label).toBe('Sin lecturas disponibles');
    expect(component.headerConnection()?.healthy).toBe(false);
  });
  it.each(['alerts', 'readings', 'history'])(
    '%s usa navegación Angular y desplaza el panel sin recargar ni cerrar sesión',
    async (fragment) => {
      const { fixture, component } = await setup();
      const scroll = vi
        .spyOn(TestBed.inject(ViewportScroller), 'scrollToAnchor')
        .mockImplementation(() => undefined);
      const link = fixture.debugElement
        .queryAll(By.directive(RouterLink))
        .find((element) => element.injector.get(RouterLink).fragment === fragment)!;
      expect(link.injector.get(RouterLink).fragment).toBe(fragment);
      expect(link.injector.get(RouterLink).queryParamsHandling).toBe('preserve');
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.nativeElement.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(scroll).toHaveBeenCalledWith(fragment);
      expect(component.selected()).toBe('device-0');
      expect(TestBed.inject(AuthService).logout).not.toHaveBeenCalled();
      link.nativeElement.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      );
      expect(scroll).toHaveBeenCalledTimes(2);
    },
  );
  it('origen DEMO permanece explícito y no toma un dispositivo real', async () => {
    const { component, fixture, facade } = await setup();
    facade.select.mockClear();
    component.setSource('demo');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DEMO · Datos simulados');
    expect(component.selected()).toBe('');
    expect(facade.select).not.toHaveBeenCalled();
  });
  it('invalidación de sensores refresca rangos sin aplicar estados del socket', async () => {
    const { fixture, facade, thresholds } = await setup();
    thresholds.reload.mockClear();
    facade.sensorRefresh.set(1);
    fixture.detectChanges();
    expect(thresholds.reload).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(thresholds.reload).toHaveBeenCalledTimes(1);
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
    expect(element.querySelectorAll('app-sensor-range')).toHaveLength(3);
    expect(element.querySelector('.rain app-sensor-range')).toBeNull();
    expect(
      element.querySelectorAll('app-sensor-range input, app-sensor-range-editor input'),
    ).toHaveLength(0);
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
    ).toHaveLength(3);
    component.configureRange('soil_1', 'Zona A');
    expect(component.editing()?.sensor.id).toBe('soil-uuid');
    expect(component.editing()?.range?.version).toBe(2);
    thresholds.states.set(rangeStates('loading'));
    expect(component.editing()?.range?.version).toBe(2);
    component.chooseDevice('');
    expect(component.editing()).toBeNull();
  });

  it('clasifica suelo 1 y ambiente sin mutar u ocultar datos del contrato original', async () => {
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
    expect(statuses()).toEqual(['low', 'within', 'low']);
    expect(element.querySelectorAll('app-sensor-assessment')).toHaveLength(3);
    expect(facade.snapshot()?.reading?.soilMoisture).toEqual({
      soil_1: 25,
      soil_2: 45,
      soil_3: 70,
    });
    expect(element.querySelector('.rain app-sensor-assessment')).toBeNull();
    expect(element.textContent).toContain('Sin calibrar');
    expect(element.textContent).not.toContain('Normal');
    expect(element.querySelectorAll('.comparison.within')).toHaveLength(0);
    thresholds.states.update((states) => ({ ...states, soil_2: rangeStates('error').soil_2 }));
    fixture.detectChanges();
    expect(statuses()).toEqual(['low', 'within', 'low']);
    facade.readingStale.set(true);
    fixture.detectChanges();
    expect(statuses()).toEqual(['stale', 'stale', 'stale']);
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
    expect(statuses()[1]).toBe('invalid');
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
