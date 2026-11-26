import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeviceManagementComponent } from './device-management.component';
import { AuthService } from '../../core/auth/auth.service';
import type { RegisteredDevice } from '../../core/devices/devices-api.service';

describe('Gestión segura de dispositivos propios', () => {
  const url = '/api/v1/plots/plot/devices';
  const device: RegisteredDevice = {
    id: 'device',
    plotId: 'plot',
    serial: 'esp32-001',
    source: 'real',
    status: 'UNKNOWN',
    isActive: true,
    expectedIntervalSeconds: 60,
    lastSeenAt: null,
    createdAt: '2026-11-23T00:00:00Z',
    sensors: [],
  };
  async function setup(role: 'ADMIN' | 'FARMER' = 'ADMIN') {
    const user = signal<{ role: string } | null>({ role });
    await TestBed.configureTestingModule({
      imports: [DeviceManagementComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DeviceManagementComponent);
    fixture.componentRef.setInput('plotId', 'plot');
    fixture.componentRef.setInput('devices', [device]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.form.setValue({
      serial: 'esp32-001',
      source: 'real',
      expectedIntervalSeconds: 60,
      confirmed: true,
    });
    return { fixture, component, http: TestBed.inject(HttpTestingController), user };
  }
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });
  it('FARMER no ve acciones ni puede enviar escrituras por métodos', async () => {
    const { fixture, component, http } = await setup('FARMER');
    component.create();
    component.target.set(device);
    component.setActive();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    http.expectNone(() => true);
  });
  it('el alta permanece plegada y abrirla no registra equipos', async () => {
    const { fixture, http } = await setup();
    const details: HTMLDetailsElement = fixture.nativeElement.querySelector('.registration');
    expect(details.open).toBe(false);
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    http.expectNone(() => true);
  });
  it.each([
    { serial: 'x' },
    { serial: '<script>' },
    { expectedIntervalSeconds: 0 },
    { expectedIntervalSeconds: 86401 },
    { expectedIntervalSeconds: 1.5 },
    { confirmed: false },
  ])('valida campos antes de enviar %j', async (value) => {
    const { component, http } = await setup();
    component.form.patchValue(value);
    component.create();
    http.expectNone(url);
  });
  it('envía solo contrato público, bloquea duplicado y expone clave solo en memoria', async () => {
    const { fixture, component, http } = await setup();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    component.create();
    const request = http.expectOne(url);
    expect(request.request.body).toEqual({
      serial: 'esp32-001',
      source: 'real',
      expectedIntervalSeconds: 60,
    });
    request.flush({ ...device, deviceKey: 'a'.repeat(64), credentialHash: 'never-render' });
    fixture.detectChanges();
    expect(component.credential()).toEqual({ id: 'device', deviceKey: 'a'.repeat(64) });
    expect(fixture.nativeElement.textContent).not.toContain('never-render');
    expect((fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement).value).toBe(
      'a'.repeat(64),
    );
    component.create();
    http.expectNone(url);
    component.dismissKey();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
  it.each([0, 503])('alta incierta %s no se reintenta ni duplica', async (status) => {
    const { component, http } = await setup();
    component.create();
    const req = http.expectOne(url);
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush({}, { status, statusText: 'Unavailable' });
    expect(component.uncertain()).toBe(true);
    component.create();
    http.expectNone(url);
    component.reviewed();
    expect(component.form.controls.serial.value).toBe('esp32-001');
  });
  it('respuesta incompatible se trata como alta incierta y no muestra secretos', async () => {
    const { component, http } = await setup();
    component.create();
    http.expectOne(url).flush({ ...device, plotId: 'other', deviceKey: 'a'.repeat(64) });
    expect(component.credential()).toBeNull();
    expect(component.uncertain()).toBe(true);
  });
  it('conflicto conserva borrador y no reintenta', async () => {
    const { component, http } = await setup();
    component.create();
    http.expectOne(url).flush({}, { status: 409, statusText: 'Conflict' });
    expect(component.error()).toContain('serie');
    expect(component.uncertain()).toBe(false);
    expect(component.form.controls.serial.value).toBe('esp32-001');
  });
  it('confirmación de habilitación envía solo isActive y no orden de válvula', async () => {
    const { fixture, component, http } = await setup();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((button) => button.textContent?.includes('Deshabilitar esp32'))!.click();
    http.expectNone(() => true);
    fixture.detectChanges();
    component.setActive();
    component.setActive();
    const req = http.expectOne(url + '/device');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ ...device, isActive: false });
    expect(component.target()).toBeNull();
  });
  it('habilitación incierta obliga a consultar sin reenvío automático', async () => {
    const { component, http } = await setup();
    component.target.set(device);
    component.setActive();
    http.expectOne(url + '/device').flush({}, { status: 503, statusText: 'Unavailable' });
    component.setActive();
    http.expectNone(() => true);
    expect(component.error()).toContain('No se confirmó');
  });
  it('no permite alta durante lectura de inventario anterior al guardado', async () => {
    const { fixture, component, http } = await setup();
    fixture.componentRef.setInput('inventoryBusy', true);
    fixture.detectChanges();
    component.create();
    http.expectNone(url);
    expect(component.busy()).toBe(false);
  });
  it.each([{}, null, { ...device, id: 'other' }, device])(
    'habilitación incompatible %j exige inventario nuevo antes de reabrir',
    async (body) => {
      const { fixture, component, http } = await setup();
      component.target.set(device);
      component.setActive();
      http.expectOne(url + '/device').flush(body);
      expect(component.uncertainToggle()).toBe(true);
      component.openTarget(device, new Event('click'));
      expect(component.target()).toBeNull();
      component.target.set(device);
      component.setActive();
      http.expectNone(() => true);
      fixture.componentRef.setInput('inventoryRevision', 1);
      fixture.detectChanges();
      expect(component.uncertainToggle()).toBe(false);
    },
  );
  it('timeout de habilitación conserva bloqueo y no reenvía PATCH', async () => {
    const { component, http } = await setup();
    vi.useFakeTimers();
    try {
      component.target.set(device);
      component.setActive();
      const request = http.expectOne(url + '/device');
      vi.advanceTimersByTime(15001);
      expect(request.cancelled).toBe(true);
      expect(component.busy()).toBe(false);
      expect(component.uncertainToggle()).toBe(true);
      component.openTarget(device, new Event('click'));
      expect(component.target()).toBeNull();
      component.setActive();
      http.expectNone(() => true);
    } finally {
      vi.useRealTimers();
    }
  });
  it('cambio de parcela cancela solicitud y elimina secretos y confirmación', async () => {
    const { fixture, component, http } = await setup();
    component.create();
    const req = http.expectOne(url);
    fixture.componentRef.setInput('plotId', 'other');
    fixture.detectChanges();
    expect(req.cancelled).toBe(true);
    expect(component.credential()).toBeNull();
    expect(component.form.controls.confirmed.value).toBe(false);
  });
  it('logout borra clave y cancela acciones', async () => {
    const { fixture, component, http, user } = await setup();
    component.create();
    http.expectOne(url).flush({ ...device, deviceKey: 'a'.repeat(64) });
    user.set(null);
    fixture.detectChanges();
    expect(component.credential()).toBeNull();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
  it('clave fuera del desplegable, notificación sin secreto y foco al ocultarla', async () => {
    const { fixture, component, http } = await setup();
    component.create();
    http.expectOne(url).flush({ ...device, deviceKey: 'a'.repeat(64) });
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const field = root.querySelector('textarea')!;
    expect(field.closest('details')).toBeNull();
    expect(field.closest('[aria-live="off"]')).not.toBeNull();
    expect(root.querySelector('[role="status"]')?.textContent).not.toContain('a'.repeat(64));
    expect(field.getAttribute('autocomplete')).toBe('off');
    expect(document.activeElement).toBe(root.querySelector('h5'));
    component.dismissKey();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('textarea')).toBeNull();
    expect(root.querySelector<HTMLDetailsElement>('.registration')?.open).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('.registration summary'));
  });
  it('confirmación enfoca cancelar y Escape devuelve foco sin cambiar recepción', async () => {
    const { fixture, component, http } = await setup();
    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>('.enable-list button')!;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.textContent).toContain('Cancelar cambio');
    root
      .querySelector('.confirmation')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.target()).toBeNull();
    expect(document.activeElement).toBe(trigger);
    http.expectNone(() => true);
  });
  it('Escape durante habilitación pendiente no cancela solicitud ni permite duplicarla', async () => {
    const { component, http } = await setup();
    component.target.set(device);
    component.setActive();
    const request = http.expectOne(url + '/device');
    component.cancelTarget(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(component.target()).toEqual(device);
    expect(request.cancelled).toBe(false);
    component.setActive();
    http.expectNone(url + '/device');
    request.flush({ ...device, isActive: false });
  });
});
