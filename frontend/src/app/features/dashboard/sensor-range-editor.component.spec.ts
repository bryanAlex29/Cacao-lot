import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, Subject, throwError } from 'rxjs';
import type { SensorThresholdResponse } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { SensorThresholdsApi } from '../../core/sensor-thresholds/sensor-thresholds-api.service';
import type { SensorRangeEditTarget } from '../../core/sensor-thresholds/sensor-thresholds.types';
import { SensorRangeEditorComponent } from './sensor-range-editor.component';

const range = {
  id: 'range',
  minValue: 20,
  maxValue: 70,
  version: 1,
  updatedBy: 'admin',
  effectiveAt: '2026-11-21T00:00:00Z',
  hysteresis: 0,
};
const target: SensorRangeEditTarget = {
  code: 'soil_1',
  label: 'Sensor 1 · Zona A',
  sensor: {
    id: 'sensor',
    code: 'soil_1',
    variable: 'SOIL_MOISTURE',
    unit: 'PERCENT',
    enabled: true,
  },
  selection: { plotId: 'plot', deviceId: 'device', source: 'demo' },
  range,
};
const response = (version = 2): SensorThresholdResponse => ({
  sensorId: 'sensor',
  ...target.selection,
  variable: 'SOIL_MOISTURE',
  unit: 'PERCENT',
  threshold: { ...range, minValue: 25, version },
});

describe('Editor ADMIN de rangos', () => {
  let api: { get: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  const user = signal({ role: 'ADMIN' });
  beforeEach(() => {
    user.set({ role: 'ADMIN' });
    api = { get: vi.fn(() => of(response())), put: vi.fn(() => of(response())) };
    // jsdom has no native dialog behavior; real focus/modal behavior is checked in Edge.
    for (const method of ['showModal', 'close'] as const) {
      if (!HTMLDialogElement.prototype[method])
        Object.defineProperty(HTMLDialogElement.prototype, method, {
          configurable: true,
          writable: true,
          value() {},
        });
      vi.spyOn(HTMLDialogElement.prototype, method).mockImplementation(() => undefined);
    }
    TestBed.configureTestingModule({
      imports: [SensorRangeEditorComponent],
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: SensorThresholdsApi, useValue: api },
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(editTarget = target) {
    const fixture = TestBed.createComponent(SensorRangeEditorComponent);
    fixture.componentRef.setInput('target', editTarget);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('carga valores y unidades sin inventar defaults para un rango nuevo', () => {
    const { fixture, component } = setup({ ...target, range: null });
    expect(component.form.getRawValue()).toEqual({ minValue: null, maxValue: null });
    expect(fixture.nativeElement.textContent).toContain('DEMO · Datos simulados');
    expect(fixture.nativeElement.textContent).toContain('Solo monitoreo');
    expect(component.unit).toBe('%');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
  });

  it.each([null, range])(
    'envía solo valores, identidad técnica y versión para creación/edición %j',
    (original) => {
      const { component } = setup({ ...target, range: original });
      const saved = vi.fn();
      component.saved.subscribe(saved);
      api.put.mockReturnValue(of(response(original ? 2 : 1)));
      component.form.setValue({ minValue: 25, maxValue: 70 });
      component.save();
      expect(api.put).toHaveBeenCalledWith(target.selection, target.sensor, target.code, {
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        minValue: 25,
        maxValue: 70,
        expectedVersion: original ? 1 : 0,
      });
      expect(saved).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { minValue: null, maxValue: 70 },
    { minValue: 20, maxValue: null },
    { minValue: 70, maxValue: 70 },
    { minValue: 80, maxValue: 70 },
    { minValue: -1, maxValue: 70 },
    { minValue: 0, maxValue: 101 },
    { minValue: NaN, maxValue: 70 },
    { minValue: 0, maxValue: Infinity },
  ])('valida antes de enviar %j', (values) => {
    const { component } = setup();
    component.form.setValue(values);
    component.save();
    expect(component.form.invalid).toBe(true);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('acepta cero y temperatura negativa dentro de los límites técnicos', () => {
    const { component } = setup({
      ...target,
      code: 'temperatureC',
      sensor: { ...target.sensor, code: 'temperatureC', variable: 'TEMPERATURE', unit: 'CELSIUS' },
    });
    component.form.setValue({ minValue: -50, maxValue: 0 });
    expect(component.form.valid).toBe(true);
    expect(component.unit).toBe('°C');
    component.form.controls.minValue.setValue(-51);
    expect(component.form.invalid).toBe(true);
  });

  it('FARMER no guarda incluso si invoca save directamente', () => {
    const { component } = setup();
    user.set({ role: 'FARMER' });
    component.save();
    expect(api.put).not.toHaveBeenCalled();
    expect(component.error()).toContain('administrador propietario');
  });

  it('no duplica solicitudes ni permite cerrar mientras un guardado está pendiente', () => {
    const pending = new Subject<SensorThresholdResponse>();
    api.put.mockReturnValue(pending);
    const { component } = setup();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.save();
    component.save();
    component.close();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(component.saving()).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    pending.next(response());
    pending.complete();
  });

  it('un conflicto conserva el borrador y exige consultar y elegir explícitamente el rango actual', () => {
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    const { component } = setup();
    component.form.setValue({ minValue: 10, maxValue: 80 });
    component.save();
    expect(component.blocked()).toBe(true);
    expect(component.error()).toContain('Otra edición');
    component.save();
    expect(api.put).toHaveBeenCalledTimes(1);
    component.loadCurrent();
    expect(component.form.getRawValue()).toEqual({ minValue: 10, maxValue: 80 });
    expect(component.current()?.threshold?.version).toBe(2);
    expect(component.blocked()).toBe(true);
    component.useCurrent();
    expect(component.form.getRawValue()).toEqual({ minValue: 25, maxValue: 70 });
    expect(component.blocked()).toBe(false);
    api.put.mockReturnValue(of(response(3)));
    component.save();
    expect(api.put.mock.calls.at(-1)?.[3].expectedVersion).toBe(2);
  });

  it.each([0, 500])('no reintenta automáticamente un guardado incierto %s', (status) => {
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    const { component } = setup();
    component.save();
    component.save();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(component.blocked()).toBe(true);
    expect(component.error()).toContain('Puede haberse aplicado');
  });

  it.each([401, 403, 404])(
    'rechaza permisos perdidos sin reenvío o elevación de rol %s',
    (status) => {
      api.put.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      const { component } = setup();
      component.save();
      component.loadCurrent();
      expect(component.error()).toContain('permisos');
      expect(component.canRecover()).toBe(false);
      expect(api.get).not.toHaveBeenCalled();
    },
  );

  it('mantiene borrador y bloqueo si la recuperación también falla', () => {
    api.put.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409 })));
    api.get.mockReturnValue(throwError(() => new Error('offline')));
    const { component } = setup();
    component.save();
    component.loadCurrent();
    expect(component.blocked()).toBe(true);
    expect(component.form.getRawValue()).toEqual({ minValue: 20, maxValue: 70 });
    expect(component.error()).toContain('no se ha reenviado');
  });

  it('cancelar no envía datos y destruir cancela suscripciones pendientes', () => {
    const { fixture, component } = setup();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.close();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(api.put).not.toHaveBeenCalled();
    const pending = new Subject<SensorThresholdResponse>();
    api.put.mockReturnValue(pending);
    component.save();
    fixture.destroy();
    expect(pending.observers).toHaveLength(0);
  });
});
