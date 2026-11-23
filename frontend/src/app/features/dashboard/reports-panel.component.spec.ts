import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportsPanelComponent } from './reports-panel.component';
import { CsvDownload } from '../../core/reports/csv-download.service';

describe('Panel de reportes', () => {
  const selected = { plotId: 'plot', deviceId: 'device', source: 'demo' } as const;
  async function setup() {
    const save = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ReportsPanelComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CsvDownload, useValue: { save } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(ReportsPanelComponent);
    fixture.componentRef.setInput('selection', selected);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
      save,
    };
  }
  afterEach(() => TestBed.resetTestingModule());
  it('no descarga automáticamente y muestra límites/origen', async () => {
    const { fixture, http } = await setup();
    http.expectNone(() => true);
    expect(fixture.nativeElement.textContent).toContain('DEMO');
    expect(fixture.nativeElement.textContent).toContain('UTC');
  });
  it.each(['readings', 'irrigation-events'] as const)(
    'descarga %s con filtros y sin propietario del cliente',
    async (kind) => {
      const { component, http, save } = await setup();
      component.setDays(7);
      component.download(kind);
      component.download(kind);
      const req = http.expectOne((r) => r.url.endsWith(`/${kind}.csv`));
      expect(req.request.params.get('source')).toBe('demo');
      expect(req.request.params.get('deviceId')).toBe('device');
      expect(req.request.params.has('ownerId')).toBe(false);
      expect(req.request.params.get('from')).toMatch(/Z$/);
      const csv = new Blob(['"source"\r\n"demo"'], { type: 'text/csv' });
      req.flush(csv, { headers: { 'content-type': 'text/csv; charset=utf-8' } });
      expect(save).toHaveBeenCalledWith(csv, `cacaosmart-${kind}-demo.csv`);
      expect(component.busy()).toBe(false);
      http.verify();
    },
  );
  it('valida fechas invertidas/excesivas sin pedir archivo', async () => {
    const { component, http } = await setup();
    for (const range of [
      { from: '', to: '' },
      { from: '2026-02-01T00:00', to: '2026-01-01T00:00' },
      { from: '2026-01-01T00:00', to: '2026-03-01T00:00' },
    ]) {
      component.form.setValue(range);
      component.download('readings');
      expect(component.error()).not.toBe('');
    }
    http.expectNone(() => true);
  });
  it('cancela descarga al cambiar dispositivo y no guarda respuesta anterior', async () => {
    const { fixture, component, http, save } = await setup();
    component.download('readings');
    const req = http.expectOne((r) => r.url.endsWith('/readings.csv'));
    fixture.componentRef.setInput('selection', { ...selected, deviceId: 'other' });
    fixture.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(component.busy()).toBe(false);
    expect(save).not.toHaveBeenCalled();
    http.verify();
  });
  it('rechaza respuestas no CSV y explica exceso sin reintentar automáticamente', async () => {
    const { component, http, save } = await setup();
    component.download('readings');
    http
      .expectOne((r) => r.url.endsWith('/readings.csv'))
      .flush(new Blob(['{}']), { headers: { 'content-type': 'application/json' } });
    expect(save).not.toHaveBeenCalled();
    expect(component.error()).not.toBe('');
    component.download('readings');
    http
      .expectOne((r) => r.url.endsWith('/readings.csv'))
      .flush(new Blob(), { status: 413, statusText: 'Too Large' });
    expect(component.error()).toContain('10000');
    http.verify();
  });
  it('no descarga sin selección', async () => {
    const { fixture, component, http } = await setup();
    fixture.componentRef.setInput('selection', null);
    fixture.detectChanges();
    component.download('readings');
    http.expectNone(() => true);
  });
});
