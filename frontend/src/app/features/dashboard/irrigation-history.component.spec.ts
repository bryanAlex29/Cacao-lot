import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { IrrigationHistoryComponent } from './irrigation-history.component';

describe('Historial observado de riego', () => {
  const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' } as const;
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [IrrigationHistoryComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(IrrigationHistoryComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
    };
  }
  afterEach(() => TestBed.resetTestingModule());
  it('consulta solo a petición, muestra DEMO y no habilita control remoto', async () => {
    const { fixture, http } = await setup();
    http.expectNone(() => true);
    expect(fixture.nativeElement.textContent).toContain('DEMO');
    expect(fixture.nativeElement.textContent).toContain('No acredita flujo');
    expect(fixture.nativeElement.textContent).toContain('Pulsa consultar');
  });
  it('evento de riego solo refresca tras consultar y cancela consulta previa para revalidar REST', async () => {
    const { fixture, component, http } = await setup();
    fixture.componentRef.setInput('refreshRevision', 1);
    fixture.detectChanges();
    http.expectNone(() => true);
    component.refresh();
    const first = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    first.flush({ items: [], total: 0, limit: 10, offset: 0 });
    fixture.componentRef.setInput('refreshRevision', 2);
    fixture.detectChanges();
    const pending = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    fixture.componentRef.setInput('refreshRevision', 3);
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    http
      .expectOne((r) => r.url.endsWith('/irrigation-events'))
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    http.verify();
  });
  it('envía filtros y distingue sin cambios de ausencia de riego', async () => {
    const { fixture, component, http } = await setup();
    component.setDays(7);
    const req = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    expect(req.request.params.get('source')).toBe('demo');
    expect(req.request.params.get('deviceId')).toBe('device');
    expect(
      Date.parse(req.request.params.get('to')!) - Date.parse(req.request.params.get('from')!),
    ).toBe(7 * 86400000);
    req.flush({ items: [], total: 0, limit: 10, offset: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Esto no confirma ausencia de riego');
    http.verify();
  });
  it('cancela y limpia al cambiar dispositivo; nunca muestra respuestas del anterior', async () => {
    const { fixture, component, http } = await setup();
    component.refresh();
    const req = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    fixture.componentRef.setInput('selection', { ...selection, deviceId: 'other' });
    fixture.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(component.page().items).toEqual([]);
    expect(component.checkedAt()).toBeNull();
    expect(component.busy()).toBe(false);
    http.verify();
  });
  it('rechaza una página cruzada y permite reintentar sin fallback simulado', async () => {
    const { fixture, component, http } = await setup();
    component.refresh();
    http
      .expectOne((r) => r.url.endsWith('/irrigation-events'))
      .flush({
        items: [{ id: 'x', plotId: 'other', deviceId: 'device', source: 'real' }],
        total: 1,
        limit: 10,
        offset: 0,
      });
    fixture.detectChanges();
    expect(component.error()).not.toBe('');
    expect(component.page().items).toEqual([]);
    component.refresh();
    http
      .expectOne((r) => r.url.endsWith('/irrigation-events'))
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.error()).toBe('');
    http.verify();
  });
  it('null nunca se presenta como cerrado ni como confirmación física', async () => {
    const { component } = await setup();
    expect(component.relay(null)).toBe('Sin dato');
    expect(component.feedback(null)).toBe('Sin confirmación');
    expect(component.relay(false)).toBe('Orden de cierre');
  });
  it('presenta evidencia y pagina manteniendo el periodo consultado', async () => {
    const { fixture, component, http } = await setup();
    component.refresh();
    const first = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    const from = first.request.params.get('from');
    const to = first.request.params.get('to');
    first.flush({
      items: [
        {
          ...selection,
          id: 'observation',
          eventId: 'event',
          observedAt: to,
          receivedAt: to,
          timestampOrigin: 'server',
          kind: 'change',
          valve: { relayCommandedOpen: true, feedbackOpen: null },
          previousValve: { relayCommandedOpen: false, feedbackOpen: null },
        },
      ],
      total: 11,
      limit: 10,
      offset: 0,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Orden de apertura');
    expect(fixture.nativeElement.textContent).toContain('Anterior: Orden de cierre');
    expect(fixture.nativeElement.textContent).toContain('Hora de recepción');
    component.load(10);
    const second = http.expectOne((r) => r.url.endsWith('/irrigation-events'));
    expect(second.request.params.get('from')).toBe(from);
    expect(second.request.params.get('to')).toBe(to);
    expect(second.request.params.get('offset')).toBe('10');
    second.flush({ items: [], total: 11, limit: 10, offset: 10 });
    http.verify();
  });
  it('fallo HTTP limpia evidencia anterior y no declara un periodo sin riego', async () => {
    const { fixture, component, http } = await setup();
    component.refresh();
    http
      .expectOne((r) => r.url.endsWith('/irrigation-events'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se pudo consultar');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Sin cambios observados en este periodo',
    );
    http.verify();
  });
});
