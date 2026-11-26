import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { PlotsComponent } from './plots.component';

describe('Parcelas propias', () => {
  async function create(role: 'ADMIN' | 'FARMER') {
    await TestBed.configureTestingModule({
      imports: [PlotsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user: signal({ name: 'Usuario', role }), logout: () => undefined },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlotsComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/plots?limit=20&offset=0')
      .flush({ items: [], total: 0, limit: 20, offset: 0 });
    fixture.detectChanges();
    return { fixture, http, component: fixture.componentInstance };
  }

  it('muestra vacío sin fabricar parcelas y permite crear a FARMER', async () => {
    const { fixture, http } = await create('FARMER');
    expect(fixture.nativeElement.textContent).toContain('No tienes parcelas registradas');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Registrar una parcela propia');
    http.verify();
  });

  it.each(['ADMIN', 'FARMER'] as const)(
    'crea como %s sin ownerId y mantiene área opcional null',
    async (role) => {
      const { component, http } = await create(role);
      component.form.setValue({ name: ' Parcela ', locationLabel: ' Chone ', areaM2: null });
      component.create();
      const request = http.expectOne('/api/v1/plots');
      expect(request.request.body).toEqual({
        name: 'Parcela',
        locationLabel: 'Chone',
        areaM2: null,
      });
      request.flush({ id: 'new', name: 'Parcela', locationLabel: 'Chone', areaM2: null });
      http
        .expectOne('/api/v1/plots?limit=20&offset=0')
        .flush({ items: [], total: 0, limit: 20, offset: 0 });
      expect(component.saving()).toBe(false);
      expect(component.message()).toContain('Parcela creada');
      http.verify();
    },
  );

  it('FARMER envía formulario desde DOM con superficie positiva y bloquea doble envío', async () => {
    const { fixture, component, http } = await create('FARMER');
    component.form.setValue({ name: 'Mi cacao', locationLabel: 'Chone', areaM2: 1500 });
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    component.create();
    const req = http.expectOne('/api/v1/plots');
    expect(req.request.body).toEqual({ name: 'Mi cacao', locationLabel: 'Chone', areaM2: 1500 });
    req.flush({ id: 'new', name: 'Mi cacao', locationLabel: 'Chone', areaM2: 1500 });
    http
      .expectOne('/api/v1/plots?limit=20&offset=0')
      .flush({ items: [], total: 0, limit: 20, offset: 0 });
    http.verify();
  });

  it('valida campos y conserva borrador ante error sin reintentar POST', async () => {
    const { component, http } = await create('FARMER');
    component.create();
    http.expectNone('/api/v1/plots');
    component.form.setValue({ name: 'Cacao', locationLabel: 'Chone', areaM2: -1 });
    component.create();
    http.expectNone('/api/v1/plots');
    component.form.controls.areaM2.setValue(null);
    component.create();
    http.expectOne('/api/v1/plots').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(component.form.controls.name.value).toBe('Cacao');
    expect(component.saving()).toBe(false);
    expect(component.error()).not.toBe('');
    http.verify();
  });
  it.each(['ADMIN', 'FARMER'] as const)(
    'abre/cierra inventario de %s sin navegar, escribir ni consultar otras parcelas',
    async (role) => {
      const { fixture, component, http } = await create(role);
      component.plots.set([
        {
          id: 'plot',
          ownerId: 'owner',
          name: 'Mi parcela',
          locationLabel: 'Chone',
          areaM2: null,
          createdAt: '2026-11-23T00:00:00.000Z',
        },
      ]);
      fixture.detectChanges();
      http.expectNone((r) => r.url.endsWith('/devices'));
      const toggle = fixture.nativeElement.querySelector('.inventory-toggle') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      const req = http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=0');
      toggle.click();
      fixture.detectChanges();
      expect(req.cancelled).toBe(true);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(fixture.nativeElement.querySelector('app-device-inventory')).toBeNull();
      http.verify();
    },
  );
  it('actualizar parcelas cierra inventario y cancela su consulta', async () => {
    const { fixture, component, http } = await create('FARMER');
    component.plots.set([
      {
        id: 'plot',
        ownerId: 'owner',
        name: 'Mi parcela',
        locationLabel: 'Chone',
        areaM2: null,
        createdAt: '2026-11-23T00:00:00.000Z',
      },
    ]);
    component.inventoryPlotId.set('plot');
    fixture.detectChanges();
    const pending = http.expectOne('/api/v1/plots/plot/devices?limit=10&offset=0');
    component.load(0);
    fixture.detectChanges();
    expect(pending.cancelled).toBe(true);
    http
      .expectOne('/api/v1/plots?limit=20&offset=0')
      .flush({ items: [], total: 0, limit: 20, offset: 0 });
    http.verify();
  });

  it('marca texto de solo espacios como inválido sin enviar ni perder el borrador', async () => {
    const { fixture, component, http } = await create('FARMER');
    component.form.setValue({ name: '   ', locationLabel: '  ', areaM2: null });
    component.create();
    fixture.detectChanges();
    expect(component.form.controls.name.invalid).toBe(true);
    expect(component.form.controls.locationLabel.invalid).toBe(true);
    expect(fixture.nativeElement.querySelector('input').getAttribute('aria-invalid')).toBe('true');
    expect(fixture.nativeElement.querySelector('#create-validation').textContent).toContain(
      'texto',
    );
    expect(component.form.controls.name.value).toBe('   ');
    http.expectNone('/api/v1/plots');
    http.verify();
  });

  it.each([{}, null, { id: 'new', name: 'Cacao', locationLabel: 'Chone', areaM2: -1 }])(
    'respuesta de alta incompatible %j conserva borrador y no declara éxito',
    async (body) => {
      const { component, http } = await create('FARMER');
      const draft = { name: 'Cacao', locationLabel: 'Chone', areaM2: null };
      component.form.setValue(draft);
      component.create();
      http.expectOne('/api/v1/plots').flush(body);
      expect(component.form.getRawValue()).toEqual(draft);
      expect(component.message()).toBe('');
      expect(component.uncertainCreate()).toBe(true);
      component.create();
      http.expectNone('/api/v1/plots');
      component.load(0);
      http
        .expectOne('/api/v1/plots?limit=20&offset=0')
        .flush({ items: [], total: -1, limit: 20, offset: 0 });
      expect(component.uncertainCreate()).toBe(true);
      expect(component.error()).not.toBe('');
      http.verify();
    },
  );

  it('bloquea edición durante envío y no inicia una actualización simultánea', async () => {
    const { fixture, component, http } = await create('FARMER');
    component.form.setValue({ name: 'Cacao', locationLabel: 'Chone', areaM2: null });
    component.create();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(true);
    component.load(0);
    http.expectNone('/api/v1/plots?limit=20&offset=0');
    http.expectOne('/api/v1/plots').flush({}, { status: 400, statusText: 'Bad request' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('fieldset').disabled).toBe(false);
    expect(component.uncertainCreate()).toBe(false);
    http.verify();
  });

  it.each([0, 500, 503])(
    'respuesta no confirmada %s conserva borrador y exige lectura correcta antes de otro POST',
    async (status) => {
      const { component, http } = await create('FARMER');
      const draft = { name: 'Cacao', locationLabel: 'Chone', areaM2: 123 };
      component.form.setValue(draft);
      component.create();
      const write = http.expectOne('/api/v1/plots');
      if (status === 0) write.error(new ProgressEvent('error'));
      else write.flush({}, { status, statusText: 'Unconfirmed' });
      expect(component.uncertainCreate()).toBe(true);
      expect(component.form.getRawValue()).toEqual(draft);
      component.create();
      http.expectNone('/api/v1/plots');
      component.load(0);
      http
        .expectOne('/api/v1/plots?limit=20&offset=0')
        .flush({}, { status: 503, statusText: 'Unavailable' });
      expect(component.uncertainCreate()).toBe(true);
      component.create();
      http.expectNone('/api/v1/plots');
      component.load(0);
      http
        .expectOne('/api/v1/plots?limit=20&offset=0')
        .flush({ items: [], total: 0, limit: 20, offset: 0 });
      expect(component.uncertainCreate()).toBe(false);
      expect(component.form.getRawValue()).toEqual(draft);
      http.verify();
    },
  );

  it('un timeout no deja el formulario guardando indefinidamente ni permite reenvío', async () => {
    const { component, http } = await create('FARMER');
    vi.useFakeTimers();
    try {
      component.form.setValue({ name: 'Cacao', locationLabel: 'Chone', areaM2: null });
      component.create();
      const request = http.expectOne('/api/v1/plots');
      vi.advanceTimersByTime(10001);
      expect(request.cancelled).toBe(true);
      expect(component.saving()).toBe(false);
      expect(component.uncertainCreate()).toBe(true);
      component.create();
      http.expectNone('/api/v1/plots');
      http.verify();
    } finally {
      vi.useRealTimers();
    }
  });
});
