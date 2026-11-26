import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlotManagementComponent } from './plot-management.component';
import { AuthService } from '../../core/auth/auth.service';

describe('Edición y archivo de parcelas propias', () => {
  const plot = { id: 'plot', name: 'Cacao', locationLabel: 'Chone', areaM2: 100 };
  async function setup(role = 'ADMIN') {
    await TestBed.configureTestingModule({
      imports: [PlotManagementComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user: signal({ role }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlotManagementComponent);
    fixture.componentRef.setInput('plot', plot);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
    };
  }
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });
  it('FARMER no tiene controles ni escrituras', async () => {
    const { fixture, component, http } = await setup('FARMER');
    component.editing.set(true);
    component.save();
    component.archiving.set(true);
    component.archiveName.setValue(plot.name);
    component.archive();
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    http.expectNone(() => true);
  });
  it('edita por submit DOM sin ownerId y permite quitar superficie', async () => {
    const { fixture, component, http } = await setup();
    component.editing.set(true);
    component.form.setValue({ name: ' Cacao nuevo ', locationLabel: ' Manabí ', areaM2: null });
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    component.save();
    const req = http.expectOne('/api/v1/plots/plot');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      name: 'Cacao nuevo',
      locationLabel: 'Manabí',
      areaM2: null,
    });
    req.flush({ ...plot, name: 'Cacao nuevo', locationLabel: 'Manabí', areaM2: null });
    expect(component.editing()).toBe(false);
  });
  it.each([{ name: ' ' }, { areaM2: -1 }, { areaM2: Infinity }, { locationLabel: '' }])(
    'valida %j',
    async (value) => {
      const { component, http } = await setup();
      component.editing.set(true);
      component.form.patchValue(value);
      component.save();
      http.expectNone(() => true);
    },
  );
  it('archivo exige nombre y confirmación explícita; no elimina físicamente', async () => {
    const { component, http } = await setup();
    component.archiving.set(true);
    component.archive();
    http.expectNone(() => true);
    component.archiveName.setValue(plot.name);
    component.archive();
    component.archive();
    const req = http.expectOne('/api/v1/plots/plot');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(component.archiving()).toBe(false);
  });
  it('cancelar archivo no envía nada', async () => {
    const { component, http } = await setup();
    component.archiving.set(true);
    component.archiveName.setValue(plot.name);
    component.cancel();
    component.archive();
    http.expectNone(() => true);
    expect(component.archiveName.value).toBe('');
  });
  it('edición con teclado enfoca el nombre y Escape vuelve al activador sin escribir', async () => {
    const { fixture, component, http } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const name = root.querySelector<HTMLInputElement>('input[formControlName="name"]')!;
    expect(document.activeElement).toBe(name);
    name.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.editing()).toBe(false);
    expect(document.activeElement?.textContent).toContain('Editar parcela');
    http.expectNone(() => true);
  });
  it('archivo tiene confirmación diferenciada y Escape no conserva el nombre ni escribe', async () => {
    const { fixture, component, http } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    root.querySelector<HTMLButtonElement>('.danger-outline')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('.confirmation input'));
    component.archiveName.setValue(plot.name);
    root
      .querySelector('.confirmation input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('.confirmation')).toBeNull();
    expect(component.archiveName.value).toBe('');
    expect(document.activeElement?.textContent).toContain('Archivar parcela');
    http.expectNone(() => true);
  });
  it('Escape no cancela una operación pendiente ni desbloquea escritura incierta', async () => {
    const { fixture, component, http } = await setup();
    component.openPanel('edit');
    component.save();
    const request = http.expectOne('/api/v1/plots/plot');
    component.dismiss(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.editing()).toBe(true);
    expect(request.cancelled).toBe(false);
    request.flush({}, { status: 503, statusText: 'Unavailable' });
    component.cancelPanel();
    fixture.detectChanges();
    component.openPanel('edit');
    component.save();
    expect(component.uncertain()).toBe(true);
    http.expectNone(() => true);
  });
  it('error conserva borrador y bloquea reenvío hasta consultar lista nueva', async () => {
    const { fixture, component, http } = await setup();
    component.editing.set(true);
    component.form.controls.name.setValue('Borrador');
    component.save();
    http.expectOne('/api/v1/plots/plot').flush({}, { status: 503, statusText: 'Unavailable' });
    component.save();
    http.expectNone(() => true);
    expect(component.form.controls.name.value).toBe('Borrador');
    expect(component.uncertain()).toBe(true);
    fixture.componentRef.setInput('plot', { ...plot });
    fixture.detectChanges();
    expect(component.uncertain()).toBe(false);
  });
  it.each([{}, null, { ...plot, id: 'foreign' }])(
    'PATCH incompatible %j no confirma guardado ni permite otro envío',
    async (body) => {
      const { component, http } = await setup();
      component.editing.set(true);
      component.form.controls.name.setValue('Borrador');
      const changed = vi.fn();
      component.changed.subscribe(changed);
      component.save();
      http.expectOne('/api/v1/plots/plot').flush(body);
      expect(component.uncertain()).toBe(true);
      expect(component.form.controls.name.value).toBe('Borrador');
      expect(changed).not.toHaveBeenCalled();
      component.save();
      http.expectNone(() => true);
    },
  );
  it('cambio de parcela cancela operación anterior y limpia confirmación', async () => {
    const { fixture, component, http } = await setup();
    component.editing.set(true);
    component.save();
    const req = http.expectOne('/api/v1/plots/plot');
    fixture.componentRef.setInput('plot', { ...plot, id: 'other', name: 'Otra' });
    fixture.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(component.form.controls.name.value).toBe('Otra');
    expect(component.archiving()).toBe(false);
  });
});
