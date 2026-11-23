import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceInventoryComponent } from './device-inventory.component';
import type { RegisteredDevice } from '../../core/devices/devices-api.service';

describe('Inventario de dispositivos por parcela, solo lectura', () => {
  const device: RegisteredDevice = {
    id: 'device',
    plotId: 'plot',
    serial: 'cacao-demo',
    source: 'demo',
    status: 'UNKNOWN',
    isActive: true,
    expectedIntervalSeconds: 60,
    lastSeenAt: null,
    createdAt: '2026-11-23T12:00:00.000Z',
    sensors: [
      {
        id: 's1',
        code: 'soil_1',
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        zone: 'A',
        enabled: true,
      },
      {
        id: 's2',
        code: 'soil_2',
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        zone: 'B',
        enabled: false,
      },
      {
        id: 's3',
        code: 'soil_3',
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        zone: 'C',
        enabled: true,
      },
      {
        id: 't',
        code: 'temperatureC',
        variable: 'TEMPERATURE',
        unit: 'CELSIUS',
        zone: null,
        enabled: true,
      },
      {
        id: 'h',
        code: 'airHumidityPct',
        variable: 'AIR_HUMIDITY',
        unit: 'PERCENT',
        zone: null,
        enabled: true,
      },
      {
        id: 'r',
        code: 'rainDetected',
        variable: 'RAIN_DETECTED',
        unit: 'BOOLEAN',
        zone: null,
        enabled: true,
      },
    ],
  };
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [DeviceInventoryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeviceInventoryComponent);
    fixture.componentRef.setInput('plotId', 'plot');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      component: fixture.componentInstance,
      http,
      first: http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=0'),
    };
  }
  const page = (items: unknown[] = [device], total = items.length, offset = 0) => ({
    items,
    total,
    limit: 10,
    offset,
  });
  afterEach(() => TestBed.resetTestingModule());

  it('consulta GET paginado sin ownerId, roles ni credenciales; muestra carga', async () => {
    const { fixture, first, http } = await setup();
    expect(first.request.method).toBe('GET');
    expect(first.request.body).toBeNull();
    expect(first.request.params.keys()).toEqual(['limit', 'offset']);
    expect(fixture.nativeElement.textContent).toContain('Consultando dispositivos');
    first.flush(page());
    http.verify();
  });
  it('distingue seis sensores, zona, unidad, habilitación, DEMO y ausencia de contacto', async () => {
    const { fixture, first, http } = await setup();
    first.flush(page());
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    for (const label of [
      'DEMO · Equipo de demostración',
      'Sin contacto registrado',
      'Sensor 1',
      'Sensor 2',
      'Sensor 3',
      'Temperatura ambiental',
      'Humedad ambiental',
      'Detección de lluvia',
      'Zona: A',
      'Zona: B',
      'Zona: C',
      '°C',
      'Sí/no (no precipitación en mm)',
      'Deshabilitado',
      'Estado al consultar',
    ])
      expect(text).toContain(label);
    expect(fixture.nativeElement.querySelectorAll('.sensor')).toHaveLength(6);
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.verify();
  });
  it('proyecta exclusivamente campos públicos sin conservar ni renderizar secretos extra', async () => {
    const { fixture, component, first, http } = await setup();
    first.flush(
      page([{ ...device, deviceKey: 'secret-test-only', credentialHash: 'hidden-test-only' }]),
    );
    fixture.detectChanges();
    expect(JSON.stringify(component.devices())).not.toMatch(
      /deviceKey|credentialHash|secret-test-only|hidden-test-only/,
    );
    expect(fixture.nativeElement.textContent).not.toContain('secret-test-only');
    http.verify();
  });
  it('muestra inventario vacío sin crear sensores ni sustituirlo por DEMO', async () => {
    const { fixture, component, first, http } = await setup();
    first.flush(page([]));
    fixture.detectChanges();
    expect(component.devices()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain(
      'Esta parcela no tiene dispositivos registrados',
    );
    expect(fixture.nativeElement.textContent).not.toContain('DEMO · Equipo');
    http.verify();
  });
  it('no completa inventario parcial con sensores de ejemplo', async () => {
    const { fixture, first, http } = await setup();
    first.flush(page([{ ...device, sensors: [] }]));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Sin sensores registrados');
    expect(fixture.nativeElement.querySelectorAll('.sensor')).toHaveLength(0);
    http.verify();
  });
  it.each([
    ['ONLINE', 'Contacto reciente'],
    ['STALE', 'Contacto desactualizado'],
    ['OFFLINE', 'Sin contacto reciente'],
  ] as const)(
    'presenta estado %s con contacto y no como calibración o flujo',
    async (status, label) => {
      const { fixture, first, http } = await setup();
      first.flush(
        page([{ ...device, source: 'real', status, lastSeenAt: '2026-11-23T12:00:00.000Z' }]),
      );
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(label);
      expect(fixture.nativeElement.textContent).toContain(
        'REAL · Equipo registrado para datos reales',
      );
      expect(fixture.nativeElement.textContent).toContain('no acredita instalación física');
      http.verify();
    },
  );
  it('deshabilitado no se presenta como conectado aunque el estado recibido sea ONLINE', async () => {
    const { component, first, http } = await setup();
    first.flush(page([{ ...device, status: 'ONLINE', isActive: false }]));
    expect(component.connection(component.devices()[0]!)).toBe('Deshabilitado para recepción');
    http.verify();
  });
  it('pagina y actualiza la página consultada sin mezclar resultados anteriores', async () => {
    const { component, first, http } = await setup();
    first.flush(page([device], 11));
    component.load(10);
    expect(component.devices()).toEqual([]);
    const next = http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=10');
    next.flush(page([{ ...device, id: 'next', serial: 'next-real', source: 'real' }], 11, 10));
    expect(component.devices()[0]?.serial).toBe('next-real');
    component.load(component.offset());
    http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=10').flush(page([], 10, 10));
    expect(component.offset()).toBe(10);
    http.verify();
  });
  it('cancela y elimina evidencia al cambiar parcela sin aceptar respuesta anterior', async () => {
    const { fixture, component, first, http } = await setup();
    fixture.componentRef.setInput('plotId', 'other');
    fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    expect(component.devices()).toEqual([]);
    expect(component.checkedAt()).toBeNull();
    http
      .expectOne('/api/v1/plots/other/devices?limit=10&offset=0')
      .flush(page([{ ...device, plotId: 'other' }]));
    http.verify();
  });
  it('cerrar/destruir cancela la consulta pendiente', async () => {
    const { fixture, first, http } = await setup();
    fixture.destroy();
    expect(first.cancelled).toBe(true);
    http.verify();
  });
  it.each([403, 404, 503])(
    'fallo %s no se presenta como inventario vacío; reintento manual sin fallback',
    async (status) => {
      const { fixture, component, first, http } = await setup();
      first.flush({}, { status, statusText: 'Failure' });
      fixture.detectChanges();
      expect(component.error()).not.toBe('');
      expect(component.devices()).toEqual([]);
      expect(fixture.nativeElement.textContent).not.toContain(
        'Esta parcela no tiene dispositivos registrados',
      );
      const retry = Array.from(
        fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
      ).find((b) => b.textContent?.includes('Reintentar'))!;
      retry.click();
      fixture.detectChanges();
      http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=0').flush(page());
      expect(component.error()).toBe('');
      http.verify();
    },
  );
  it.each([
    { ...device, plotId: 'foreign' },
    { ...device, source: 'unknown' },
    { ...device, status: 'NEW' },
    { ...device, expectedIntervalSeconds: 0 },
    { ...device, lastSeenAt: 'bad' },
    { ...device, sensors: [{ ...device.sensors[0], unit: 'CELSIUS' }] },
    { ...device, sensors: [{ ...device.sensors[0], code: 'unknown' }] },
    { ...device, sensors: [device.sensors[0], device.sensors[0]] },
  ])('rechaza inventario cruzado o malformado: %o', async (item) => {
    const { component, first, http } = await setup();
    first.flush(page([item]));
    expect(component.devices()).toEqual([]);
    expect(component.error()).not.toBe('');
    expect(component.checkedAt()).toBeNull();
    http.verify();
  });
  it.each([
    { ...page(), limit: 20 },
    { ...page(), offset: 10 },
    { ...page(), total: -1 },
    page([device, device]),
  ])('rechaza metadatos incoherentes de página: %o', async (body) => {
    const { component, first, http } = await setup();
    first.flush(body);
    expect(component.error()).not.toBe('');
    expect(component.devices()).toEqual([]);
    http.verify();
  });
});
