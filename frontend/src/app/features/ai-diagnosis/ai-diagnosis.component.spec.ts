import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { AiDiagnosisComponent } from './ai-diagnosis.component';
import type { Diagnosis, DiagnosisOptions } from '../../core/ai-diagnosis/ai-diagnosis-api.service';
import { localDateTime } from '../../core/telemetry/history-period';

describe('Diagnóstico privado DEMO', () => {
  const base = '/api/v1/ai-diagnostics';
  const options: DiagnosisOptions = {
    provider: 'mock',
    maxImageBytes: 8 * 1048576,
    dailyLimit: 5,
    retentionDays: 7,
    consentVersion: 'demo-v1',
  };
  const record: Diagnosis = {
    id: 'diagnosis',
    plotId: 'plot',
    requestId: 'request',
    status: 'completed',
    source: 'demo',
    provider: 'mock',
    notes: null,
    errorCode: null,
    createdAt: '2026-11-23T12:00:00Z',
    completedAt: '2026-11-23T12:00:01Z',
    expiresAt: '2026-11-30T12:00:00Z',
    hasImage: true,
    result: {
      plantPart: 'unknown',
      visibleSymptoms: ['No se evaluaron síntomas reales'],
      possibleCauses: [],
      uncertainty: 'high',
      recommendedActions: ['Consultar técnico'],
      requiresExpertReview: true,
      disclaimer: 'Resultado simulado, no diagnóstico real',
    },
  };
  async function setup(config = options) {
    const user = signal<unknown>({ role: 'FARMER' });
    const route = new BehaviorSubject(convertToParamMap({ plotId: 'plot' }));
    const NativeURL = URL;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = vi.fn(() => 'blob:private-test');
        static revokeObjectURL = vi.fn();
      },
    );
    await TestBed.configureTestingModule({
      imports: [AiDiagnosisComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: route } },
        { provide: AuthService, useValue: { user, logout: vi.fn() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AiDiagnosisComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/plots/plot')
      .flush({ id: 'plot', name: 'Cacao', locationLabel: 'Chone', areaM2: null });
    http.expectOne(base + '/config').flush(config);
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, http, user, route };
  }
  function file(
    component: AiDiagnosisComponent,
    value = new File(['png-content'], 'plant.png', { type: 'image/png' }),
  ) {
    component.selectFile({ target: { files: [value], value: 'file' } } as unknown as Event);
  }
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });
  it('explica DEMO, privacidad, consentimiento y no sube al seleccionar foto', async () => {
    const { component, fixture, http } = await setup();
    file(component);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se evalúan enfermedades reales');
    expect(fixture.nativeElement.textContent).toContain('7 días');
    http.expectNone((req) => req.method !== 'GET');
    component.submit();
    http.expectNone(base);
    expect(component.error()).toContain('consentimiento');
  });
  it('muestra cuota diaria ilimitada solo cuando lo indica la configuración autenticada', async () => {
    const { component, fixture, http } = await setup({ ...options, dailyLimit: null });
    file(component);
    fixture.detectChanges();
    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain('Sin límite diario de análisis para tu cuenta');
    expect(text).toContain('consume saldo de la API');
    expect(text).not.toContain('5 intentos por usuario');
    component.submit();
    http.expectNone(base);
    expect(component.error()).toContain('consentimiento');
  });
  it('OpenAI exige consentimiento explícito y envía openai-v1, preservando DEMO en historial', async () => {
    const { component, fixture, http } = await setup({
      ...options,
      provider: 'openai',
      consentVersion: 'openai-v1',
    });
    file(component);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('proveedor externo');
    expect(fixture.nativeElement.textContent).toContain('No confirma enfermedades');
    component.submit();
    http.expectNone(base);
    component.consent.setValue(true);
    component.submit();
    const req = http.expectOne(base);
    expect(req.request.body.get('consentVersion')).toBe('openai-v1');
    const external = { ...record, provider: 'openai', source: 'real', hasImage: false };
    req.flush(external);
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [external, { ...record, hasImage: false }], total: 2, limit: 10, offset: 0 });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#result-title').textContent).toContain('OpenAI');
    expect(fixture.nativeElement.textContent).toContain('Completado · simulado');
  });
  it('guía de captura no inventa foto y sustituirla exige consentimiento nuevo', async () => {
    const { component, fixture, http } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.empty-preview')?.textContent).toContain('Vista previa');
    expect(root.querySelector('.capture-review img')).toBeNull();
    file(component);
    component.consent.setValue(true);
    component.notes.setValue('Observación privada');
    file(component, new File(['second-photo'], 'otra.webp', { type: 'image/webp' }));
    fixture.detectChanges();
    expect(root.querySelector('.empty-preview')).toBeNull();
    expect(root.querySelector('.capture-review img')?.getAttribute('alt')).toContain(
      'aún no enviada',
    );
    expect(component.consent.value).toBe(false);
    expect(component.notes.value).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    http.expectNone((req) => req.method !== 'GET');
  });
  it('resultado conserva advertencias y falta de imagen sin impedir consultar contenido', async () => {
    const { component, fixture, http } = await setup();
    component.open({ ...record, hasImage: false });
    fixture.detectChanges();
    const result: HTMLElement = fixture.nativeElement.querySelector('.result-panel');
    expect(result.querySelector('.result-photo')?.textContent).toContain(
      'Sin fotografía conservada',
    );
    expect(result.querySelector('.result-content')?.textContent).toContain(
      record.result!.disclaimer,
    );
    expect(result.querySelector('.uncertainty')?.textContent).toContain('Alta');
    expect(result.querySelector('.next-steps')?.textContent).toContain('Consultar técnico');
    expect(result.textContent).toContain('No evaluadas por el proveedor simulado');
    http.expectNone((req) => req.method !== 'GET');
  });
  it('salir desde el encabezado limpia previsualización, comparación y consulta pendiente', async () => {
    const { fixture, component, http } = await setup();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    file(component);
    component.toggleComparison(record);
    component.loadHistory(0);
    const pending = http.expectOne(base + '?plotId=plot&limit=10&offset=0');
    fixture.nativeElement.querySelector('app-page-header button').click();
    expect(pending.cancelled).toBe(true);
    expect(component.preview()).toBeNull();
    expect(component.comparisonIds()).toEqual([]);
    expect(component.plot()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(TestBed.inject(AuthService).logout).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/login');
  });
  it.each([
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['text'], 'fake.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(8 * 1048576 + 1)], 'large.png', { type: 'image/png' }),
  ])('rechaza selección inválida antes de enviar', async (value) => {
    const { component, http } = await setup();
    file(component, value);
    expect(component.preview()).toBeNull();
    expect(component.error()).not.toBe('');
    http.expectNone(base);
  });
  it('confirmación envía multipart privado y recupera imagen por HTTP autenticado', async () => {
    const { component, fixture, http } = await setup();
    file(component);
    component.consent.setValue(true);
    component.notes.setValue('Manchas visibles');
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Confirmar análisis simulado'))!.click();
    component.submit();
    const upload = http.expectOne(base);
    const body = upload.request.body as FormData;
    expect(body.get('plotId')).toBe('plot');
    expect(body.get('consentVersion')).toBe('demo-v1');
    expect(body.get('retentionDays')).toBe('7');
    expect(body.get('notes')).toBe('Manchas visibles');
    expect(body.get('requestId')).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.get('ownerId')).toBeNull();
    upload.flush(record);
    http.expectOne(base + '/diagnosis/image').flush(new Blob(['jpeg'], { type: 'image/jpeg' }));
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [record], total: 1, limit: 10, offset: 0 });
    fixture.detectChanges();
    expect(component.preview()).toBeNull();
    expect(component.consent.value).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Resultado simulado');
    expect(fixture.nativeElement.textContent).toContain('No evaluadas');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it('respuesta perdida conserva payload/idempotencia y no reintenta automáticamente', async () => {
    const { component, http } = await setup();
    file(component);
    component.consent.setValue(true);
    component.submit();
    const first = http.expectOne(base);
    const key = (first.request.body as FormData).get('requestId');
    first.error(new ProgressEvent('error'));
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.uncertain()).toBe(true);
    expect(component.notes.disabled).toBe(true);
    http.expectNone(base);
    file(component, new File(['different'], 'other.png', { type: 'image/png' }));
    component.submit();
    const retry = http.expectOne(base);
    expect((retry.request.body as FormData).get('requestId')).toBe(key);
    retry.flush({ ...record, hasImage: false });
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [record], total: 1, limit: 10, offset: 0 });
  });
  it('rechaza respuesta que pretende ser análisis real', async () => {
    const { component, http } = await setup();
    file(component);
    component.consent.setValue(true);
    component.submit();
    http.expectOne(base).flush({ ...record, source: 'real', provider: 'openai' });
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.selected()).toBeNull();
    expect(component.uncertain()).toBe(true);
  });
  it('fallo de imagen no oculta resultado ni fabrica foto', async () => {
    const { component, http } = await setup();
    component.open(record);
    http.expectOne(base + '/diagnosis/image').flush(null, { status: 404, statusText: 'Not Found' });
    expect(component.selected()).toEqual(record);
    expect(component.imageUrl()).toBeNull();
    expect(component.imageError()).not.toBe('');
  });
  it('eliminar requiere confirmación separada y refresca sin reenviar foto', async () => {
    const { component, http } = await setup();
    component.remove();
    http.expectNone((req) => req.method === 'DELETE');
    component.deleteTarget.set(record);
    component.remove();
    component.remove();
    http.expectOne(base + '/diagnosis').flush(null, { status: 204, statusText: 'No Content' });
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.deleteTarget()).toBeNull();
  });
  it('logout cancela carga privada y revoca URLs', async () => {
    const { component, fixture, http, user } = await setup();
    file(component);
    component.consent.setValue(true);
    component.submit();
    const upload = http.expectOne(base);
    user.set(null);
    fixture.detectChanges();
    expect(upload.cancelled).toBe(true);
    expect(component.preview()).toBeNull();
    expect(component.history()).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
  it('cambiar parcela cancela imagen e historial anteriores y limpia consentimiento', async () => {
    const { component, fixture, http, route } = await setup();
    component.open(record);
    const image = http.expectOne(base + '/diagnosis/image');
    route.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(image.cancelled).toBe(true);
    expect(component.plot()).toBeNull();
    expect(component.selected()).toBeNull();
    expect(component.consent.value).toBe(false);
    expect(component.error()).toContain('Elige una parcela');
  });
  it('cambiar análisis cancela detalle anterior para que no reaparezca una foto vieja', async () => {
    const { component, http } = await setup();
    component.open({ ...record, hasImage: false });
    component.refreshSelected();
    const detail = http.expectOne(base + '/diagnosis');
    component.open({ ...record, id: 'other', hasImage: false });
    expect(detail.cancelled).toBe(true);
    expect(component.selected()?.id).toBe('other');
  });
  it('un estado pendiente solo consulta REST, sin volver a subir la fotografía', async () => {
    const { component, http } = await setup();
    component.open({ ...record, status: 'pending', result: null, hasImage: false });
    component.refreshSelected();
    http.expectOne(base + '/diagnosis').flush({ ...record, hasImage: false });
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [record], total: 1, limit: 10, offset: 0 });
    expect(component.selected()?.status).toBe('completed');
    http.expectNone((req) => req.method === 'POST');
  });
  it('aplica fechas en UTC y estado desde DOM, conserva filtros al paginar/actualizar aunque cambie el borrador', async () => {
    const { component, fixture, http } = await setup();
    component.historyForm.setValue({
      from: localDateTime(new Date('2026-11-23T00:00:00Z')),
      to: localDateTime(new Date('2026-11-24T00:00:00Z')),
      status: 'completed',
    });
    fixture.nativeElement
      .querySelector('form[aria-label="Filtros del historial de diagnósticos"]')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const first = http.expectOne((req) => req.url === base && req.params.get('offset') === '0');
    expect(first.request.params.get('from')).toBe('2026-11-23T00:00:00.000Z');
    expect(first.request.params.get('to')).toBe('2026-11-24T00:00:00.000Z');
    expect(first.request.params.get('status')).toBe('completed');
    first.flush({ items: [record], total: 12, limit: 10, offset: 0 });
    component.historyForm.controls.status.setValue('failed');
    component.loadHistory(10);
    const next = http.expectOne((req) => req.url === base && req.params.get('offset') === '10');
    expect(next.request.params.get('status')).toBe('completed');
    expect(next.request.params.get('from')).toBe(first.request.params.get('from'));
    next.flush({ items: [record], total: 12, limit: 10, offset: 10 });
    component.loadHistory(10);
    const refresh = http.expectOne((req) => req.url === base && req.params.get('offset') === '10');
    expect(refresh.request.params.toString()).toBe(next.request.params.toString());
    refresh.flush({ items: [record], total: 12, limit: 10, offset: 10 });
    expect(component.offset()).toBe(10);
  });
  it.each([
    { from: '2026-11-23T00:00', to: '', status: '' },
    { from: '2026-11-24T00:00', to: '2026-11-23T00:00', status: '' },
    { from: '2026-01-01T00:00', to: '2026-02-03T00:00', status: '' },
    { from: '2026-02-30T00:00', to: '2026-03-01T00:00', status: '' },
    { from: '', to: '', status: 'unknown' },
  ])('borrador inválido conserva resultados y filtro aplicado %j', async (value) => {
    const { component, http } = await setup();
    component.history.set([record]);
    component.historyForm.setValue(value);
    component.applyHistoryFilters();
    expect(component.filterError()).not.toBe('');
    expect(component.history()).toEqual([record]);
    expect(component.historyFilters()).toEqual({});
    http.expectNone(base);
  });
  it('limpiar elimina parámetros y vuelve a primera página sin cambiar parcela o foto sin enviar', async () => {
    const { component, http } = await setup();
    file(component);
    const preview = component.preview();
    component.historyForm.controls.status.setValue('failed');
    component.applyHistoryFilters();
    http
      .expectOne((req) => req.url === base && req.params.get('status') === 'failed')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    component.clearHistoryFilters();
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.plot()?.id).toBe('plot');
    expect(component.preview()).toBe(preview);
    expect(component.historyForm.getRawValue()).toEqual({ from: '', to: '', status: '' });
  });
  it('cancela consultas anteriores al aplicar otro filtro y conserva filtro ante fallo/reintento', async () => {
    const { component, http } = await setup();
    component.loadHistory(0);
    const old = http.expectOne(base + '?plotId=plot&limit=10&offset=0');
    component.historyForm.controls.status.setValue('failed');
    component.applyHistoryFilters();
    expect(old.cancelled).toBe(true);
    const failed = http.expectOne(
      (req) => req.url === base && req.params.get('status') === 'failed',
    );
    failed.flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.historyError()).not.toBe('');
    expect(component.historyFilters()).toEqual({ status: 'failed' });
    component.loadHistory(0);
    const retry = http.expectOne(
      (req) => req.url === base && req.params.get('status') === 'failed',
    );
    retry.flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.historyError()).toBe('');
    http.expectNone((req) => req.method === 'POST');
  });
  it('crear o eliminar conserva filtros y reset por cambio de parcela los limpia', async () => {
    const { component, fixture, http, route } = await setup();
    component.historyForm.controls.status.setValue('failed');
    component.applyHistoryFilters();
    const flushFiltered = () =>
      http
        .expectOne((req) => req.url === base && req.params.get('status') === 'failed')
        .flush({ items: [], total: 0, limit: 10, offset: 0 });
    flushFiltered();
    file(component);
    component.consent.setValue(true);
    component.submit();
    http.expectOne(base).flush({ ...record, hasImage: false });
    flushFiltered();
    expect(component.selected()?.status).toBe('completed');
    component.deleteTarget.set(record);
    component.remove();
    http.expectOne(base + '/diagnosis').flush(null, { status: 204, statusText: 'No Content' });
    flushFiltered();
    expect(component.historyFilters().status).toBe('failed');
    route.next(convertToParamMap({}));
    fixture.detectChanges();
    expect(component.historyFilters()).toEqual({});
    expect(component.historyForm.controls.status.value).toBe('');
  });
  it('elige hasta dos diagnósticos distintos, bloquea otra parcela y fotos ausentes/pendientes', async () => {
    const { component, http } = await setup();
    component.toggleComparison({ ...record, plotId: 'other' });
    component.toggleComparison({ ...record, hasImage: false });
    component.toggleComparison({ ...record, status: 'pending' });
    expect(component.comparisonIds()).toEqual([]);
    component.toggleComparison(record);
    component.toggleComparison({ ...record, id: 'second' });
    component.toggleComparison({ ...record, id: 'third' });
    expect(component.comparisonIds()).toEqual(['diagnosis', 'second']);
    component.swapComparison();
    expect(component.comparisonIds()).toEqual(['second', 'diagnosis']);
    component.toggleComparison(record);
    expect(component.comparisonIds()).toEqual(['second']);
    http.expectNone((req) => req.method !== 'GET');
  });
  it('comparación permanece al filtrar/paginar y no altera borrador de subida', async () => {
    const { component, http } = await setup();
    file(component);
    component.toggleComparison(record);
    component.historyForm.controls.status.setValue('failed');
    component.applyHistoryFilters();
    http
      .expectOne((req) => req.url === base && req.params.get('status') === 'failed')
      .flush({ items: [], total: 20, limit: 10, offset: 0 });
    component.loadHistory(10);
    http
      .expectOne((req) => req.url === base && req.params.get('offset') === '10')
      .flush({ items: [], total: 20, limit: 10, offset: 10 });
    component.clearHistoryFilters();
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    expect(component.comparisonIds()).toEqual(['diagnosis']);
    expect(component.preview()).not.toBeNull();
  });
  it('eliminar descarta primero la selección comparada y logout limpia las restantes', async () => {
    const { component, fixture, http, user } = await setup();
    component.toggleComparison(record);
    component.toggleComparison({ ...record, id: 'second' });
    component.deleteTarget.set(record);
    component.remove();
    expect(component.comparisonIds()).toEqual(['second']);
    http.expectOne(base + '/diagnosis').flush(null, { status: 204, statusText: 'No Content' });
    http
      .expectOne(base + '?plotId=plot&limit=10&offset=0')
      .flush({ items: [], total: 0, limit: 10, offset: 0 });
    user.set(null);
    fixture.detectChanges();
    expect(component.comparisonIds()).toEqual([]);
  });
});
