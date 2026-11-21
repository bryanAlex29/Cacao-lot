import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoisturePolicyResponse } from '@cacaosmart/contracts';
import { MoisturePolicyComponent } from './moisture-policy.component';
import { MoistureAlertsApi } from '../../core/alerts/moisture-alerts-api.service';
import { AuthService } from '../../core/auth/auth.service';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
const row = (): MoisturePolicyResponse => ({
  ...selection,
  sensorId: 'sensor',
  code: 'soil_1',
  status: 'unconfigured',
  range: { minValue: 30, maxValue: 70, version: 2, effectiveAt: '2026-11-21T00:00:00Z' },
  policy: null,
});
describe('Margen de alertas por sonda sin valores agronómicos predeterminados', () => {
  const user = signal({ role: 'ADMIN' });
  let api: { policy: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    user.set({ role: 'ADMIN' });
    api = {
      policy: vi.fn(() => of(row())),
      put: vi.fn(() =>
        of({
          ...row(),
          status: 'ready',
          policy: { recoveryMarginPct: 5, version: 1, updatedAt: '2026-11-21T00:00:00Z' },
        }),
      ),
    };
    TestBed.configureTestingModule({
      imports: [MoisturePolicyComponent],
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: MoistureAlertsApi, useValue: api },
      ],
    });
  });
  afterEach(() => TestBed.resetTestingModule());
  const setup = () => {
    const fixture = TestBed.createComponent(MoisturePolicyComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.componentRef.setInput('sensorId', 'sensor');
    fixture.componentRef.setInput('label', 'Sensor 1 · Zona A');
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  };
  it('no precarga un margen inexistente y guarda versiones sin tocar rangos', () => {
    const { fixture, component } = setup();
    expect(component.margin.value).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('falta configurar el margen');
    component.margin.setValue(5);
    component.save();
    fixture.detectChanges();
    expect(api.put).toHaveBeenCalledExactlyOnceWith(selection, 'sensor', {
      recoveryMarginPct: 5,
      expectedVersion: 0,
      expectedThresholdVersion: 2,
    });
    expect(api.policy).toHaveBeenCalledTimes(1); // A save must not rerun the selection effect.
    expect(component.policy()?.policy?.version).toBe(1);
  });
  it.each([null, 0, -1, 41, NaN, Infinity])('rechaza margen %s', (margin) => {
    const { component } = setup();
    component.margin.setValue(margin);
    component.save();
    expect(api.put).not.toHaveBeenCalled();
  });
  it('FARMER consulta pero no obtiene formulario ni escritura', () => {
    user.set({ role: 'FARMER' });
    const { fixture, component } = setup();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    component.margin.setValue(5);
    component.save();
    expect(api.put).not.toHaveBeenCalled();
  });
  it('el submit del formulario realmente envía el margen', () => {
    const { fixture, component } = setup();
    component.margin.setValue(5);
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(api.put).toHaveBeenCalledTimes(1);
  });
  it('conflicto o resultado incierto obliga a consultar antes de reintentar', () => {
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const { component } = setup();
    component.margin.setValue(5);
    component.save();
    expect(component.uncertain()).toBe(true);
    expect(component.message()).toContain('Cambió el rango');
    component.save();
    expect(api.put).toHaveBeenCalledTimes(1);
    component.load();
    expect(component.uncertain()).toBe(false);
  });
  it('un cambio de sonda cancela la consulta anterior y limpia el margen', () => {
    const pending = new Subject<MoisturePolicyResponse>();
    api.policy.mockReturnValue(pending);
    const { fixture, component } = setup();
    component.margin.setValue(9);
    api.policy.mockReturnValue(of({ ...row(), sensorId: 'sensor-b', code: 'soil_2' }));
    fixture.componentRef.setInput('sensorId', 'sensor-b');
    fixture.detectChanges();
    pending.next(row());
    expect(component.policy()?.sensorId).toBe('sensor-b');
    expect(component.margin.value).toBeNull();
  });
  it('fallo de política no ofrece guardar con una versión no confirmada', () => {
    api.policy.mockReturnValue(throwError(() => new Error('offline')));
    const { component } = setup();
    expect(component.error()).not.toBe('');
    component.margin.setValue(5);
    component.save();
    expect(api.put).not.toHaveBeenCalled();
  });
});
