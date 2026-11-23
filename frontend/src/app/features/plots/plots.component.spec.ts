import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
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
      request.flush({});
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
    req.flush({});
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
});
