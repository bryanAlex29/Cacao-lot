import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosisComparisonCardComponent } from './diagnosis-comparison-card.component';
import type { Diagnosis } from '../../core/ai-diagnosis/ai-diagnosis-api.service';

describe('Fotografía privada de comparación', () => {
  const base = '/api/v1/ai-diagnostics';
  const record = (): Diagnosis => ({
    id: 'one',
    plotId: 'plot',
    requestId: 'request',
    status: 'completed',
    source: 'demo',
    provider: 'mock',
    notes: 'Observación del usuario',
    errorCode: null,
    createdAt: '2026-11-23T12:00:00Z',
    completedAt: '2026-11-23T12:00:01Z',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    hasImage: true,
    result: {
      plantPart: 'unknown',
      visibleSymptoms: ['No se han evaluado síntomas reales'],
      possibleCauses: [],
      uncertainty: 'high',
      recommendedActions: ['Consultar técnico'],
      requiresExpertReview: true,
      disclaimer: 'Resultado simulado, no concluyente',
    },
  });
  async function setup() {
    const NativeURL = URL;
    let counter = 0;
    vi.stubGlobal(
      'URL',
      class extends NativeURL {
        static createObjectURL = vi.fn(() => `blob:comparison-${++counter}`);
        static revokeObjectURL = vi.fn();
      },
    );
    await TestBed.configureTestingModule({
      imports: [DiagnosisComparisonCardComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(DiagnosisComparisonCardComponent);
    fixture.componentRef.setInput('plotId', 'plot');
    fixture.componentRef.setInput('diagnosisId', 'one');
    fixture.componentRef.setInput('label', 'Foto A');
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    return {
      fixture,
      component: fixture.componentInstance,
      http,
      first: http.expectOne(base + '/one'),
    };
  }
  const jpeg = () => new Blob(['synthetic-jpeg'], { type: 'image/jpeg' });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it('consulta metadata autorizada antes de la imagen, muestra fecha/resultado DEMO y no escribe', async () => {
    const { fixture, component, http, first } = await setup();
    expect(first.request.method).toBe('GET');
    http.expectNone(base + '/one/image');
    first.flush(record());
    http.expectOne(base + '/one/image').flush(jpeg());
    fixture.detectChanges();
    expect(component.imageUrl()).toBe('blob:comparison-1');
    expect(fixture.nativeElement.textContent).toContain('Fecha del diagnóstico (creación)');
    expect(fixture.nativeElement.textContent).toContain('23/11/2026');
    expect(fixture.nativeElement.textContent).toContain('Resultado simulado');
    expect(fixture.nativeElement.textContent).toContain('Observación del usuario');
    expect(fixture.nativeElement.querySelector('img').getAttribute('alt')).toContain('Foto A');
    http.expectNone((req) => req.method !== 'GET');
  });
  it.each([{ plotId: 'other' }, { id: 'other' }, { source: 'real' }, { provider: 'openai' }])(
    'rechaza identidad/origen ajeno %j antes de pedir imagen',
    async (extra) => {
      const { component, http, first } = await setup();
      first.flush({ ...record(), ...extra });
      expect(component.diagnosis()).toBeNull();
      expect(component.imageUrl()).toBeNull();
      expect(component.error()).toContain('no disponible');
      http.expectNone(base + '/one/image');
    },
  );
  it.each([{ hasImage: false }, { status: 'pending', result: null }])(
    'no inventa fotografía ausente/pendiente %j',
    async (extra) => {
      const { component, http, first } = await setup();
      first.flush({ ...record(), ...extra });
      expect(component.imageUrl()).toBeNull();
      expect(component.error()).toContain('no está disponible');
      http.expectNone(base + '/one/image');
    },
  );
  it('diagnóstico eliminado o sin acceso no permite pedir imagen ni conserva copia anterior', async () => {
    const { component, http, first } = await setup();
    first.flush(null, { status: 404, statusText: 'Not Found' });
    expect(component.error()).toContain('No se muestra una copia anterior');
    expect(component.busy()).toBe(false);
    http.expectNone(base + '/one/image');
  });
  it('fallo de foto conserva metadata consultada pero ninguna imagen de reemplazo', async () => {
    const { component, http, first } = await setup();
    first.flush(record());
    http.expectOne(base + '/one/image').flush(null, { status: 404, statusText: 'Not Found' });
    expect(component.diagnosis()?.id).toBe('one');
    expect(component.imageUrl()).toBeNull();
    expect(component.error()).toContain('fotografía privada');
  });
  it.each([new Blob([], { type: 'image/jpeg' }), new Blob(['not-image'], { type: 'text/html' })])(
    'rechaza respuesta vacía o contenido no JPEG',
    async (bytes) => {
      const { component, http, first } = await setup();
      first.flush(record());
      http.expectOne(base + '/one/image').flush(bytes);
      expect(component.imageUrl()).toBeNull();
      expect(component.error()).toContain('JPEG privada válida');
    },
  );
  it('actualizar revoca la URL y limpia evidencia antes de volver a comprobar acceso', async () => {
    const { component, http, first } = await setup();
    first.flush(record());
    http.expectOne(base + '/one/image').flush(jpeg());
    component.load();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comparison-1');
    expect(component.imageUrl()).toBeNull();
    expect(component.diagnosis()).toBeNull();
    http.expectOne(base + '/one').flush(null, { status: 403, statusText: 'Forbidden' });
    expect(component.error()).toContain('no disponible');
  });
  it('cambiar selección cancela metadata pendiente', async () => {
    const { fixture, component, http, first } = await setup();
    fixture.componentRef.setInput('diagnosisId', 'two');
    fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    http.expectOne(base + '/two').flush({ ...record(), id: 'two', hasImage: false });
    expect(component.diagnosis()?.id).toBe('two');
  });
  it('cambiar parcela cancela fotografía anterior sin mostrar datos de la otra', async () => {
    const { fixture, component, http, first } = await setup();
    first.flush(record());
    const image = http.expectOne(base + '/one/image');
    fixture.componentRef.setInput('plotId', 'other');
    fixture.detectChanges();
    expect(image.cancelled).toBe(true);
    expect(component.imageUrl()).toBeNull();
    http.expectOne(base + '/one').flush(record());
    expect(component.diagnosis()).toBeNull();
  });
  it('cambiar etiqueta al intercambiar no vuelve a consultar ni crea otra URL', async () => {
    const { fixture, http, first } = await setup();
    first.flush(record());
    http.expectOne(base + '/one/image').flush(jpeg());
    fixture.componentRef.setInput('label', 'Foto B');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img').getAttribute('alt')).toContain('Foto B');
    http.expectNone(() => true);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  });
  it('desmontar cancela foto pendiente y revoca la foto ya mostrada', async () => {
    const { fixture, component, http, first } = await setup();
    first.flush(record());
    http.expectOne(base + '/one/image').flush(jpeg());
    component.imageFailed();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comparison-1');
    component.load();
    const pending = http.expectOne(base + '/one');
    fixture.destroy();
    expect(pending.cancelled).toBe(true);
  });
  it('al vencer elimina automáticamente URL, metadata y resultado', async () => {
    const { component, http, first } = await setup();
    vi.useFakeTimers();
    first.flush({ ...record(), expiresAt: new Date(Date.now() + 1000).toISOString() });
    http.expectOne(base + '/one/image').flush(jpeg());
    expect(component.imageUrl()).not.toBeNull();
    vi.advanceTimersByTime(1001);
    expect(component.diagnosis()).toBeNull();
    expect(component.imageUrl()).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(component.error()).toContain('no disponible');
  });
  it('un análisis fallido con foto se compara sin inventar resultado', async () => {
    const { fixture, component, http, first } = await setup();
    first.flush({ ...record(), status: 'failed', result: null });
    http.expectOne(base + '/one/image').flush(jpeg());
    fixture.detectChanges();
    expect(component.imageUrl()).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Fallido');
    expect(fixture.nativeElement.textContent).toContain('No hay un resultado completado');
  });
  it('vencimiento cancela descarga pendiente sin resucitar evidencia', async () => {
    const { component, http, first } = await setup();
    vi.useFakeTimers();
    first.flush({ ...record(), expiresAt: new Date(Date.now() + 1000).toISOString() });
    const image = http.expectOne(base + '/one/image');
    vi.advanceTimersByTime(1001);
    expect(image.cancelled).toBe(true);
    expect(component.imageUrl()).toBeNull();
    expect(component.diagnosis()).toBeNull();
  });
  it('desmontar revoca la última URL mostrada', async () => {
    const { fixture, http, first } = await setup();
    first.flush(record());
    http.expectOne(base + '/one/image').flush(jpeg());
    fixture.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:comparison-1');
  });
  it('no descarga una foto cuyo diagnóstico ya venció', async () => {
    const { component, http, first } = await setup();
    first.flush({ ...record(), expiresAt: new Date(Date.now() - 1).toISOString() });
    http.expectNone(base + '/one/image');
    expect(component.diagnosis()).toBeNull();
  });
});
