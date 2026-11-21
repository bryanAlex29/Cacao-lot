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

  it('muestra vacío sin fabricar parcelas y oculta escritura para FARMER', async () => {
    const { fixture, http } = await create('FARMER');
    expect(fixture.nativeElement.textContent).toContain('No tienes parcelas registradas');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.verify();
  });

  it('crea sin ownerId del cliente y mantiene área opcional como null', async () => {
    const { component, http } = await create('ADMIN');
    component.form.setValue({ name: ' Parcela ', locationLabel: ' Chone ', areaM2: null });
    component.create();
    const request = http.expectOne('/api/v1/plots');
    expect(request.request.body).toEqual({ name: 'Parcela', locationLabel: 'Chone', areaM2: null });
    request.flush({});
    http
      .expectOne('/api/v1/plots?limit=20&offset=0')
      .flush({ items: [], total: 0, limit: 20, offset: 0 });
    expect(component.saving()).toBe(false);
    http.verify();
  });
});
