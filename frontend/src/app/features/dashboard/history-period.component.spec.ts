import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryPeriodComponent } from './history-period.component';
import { localDateTime } from '../../core/telemetry/history-period';

describe('Formulario de fechas del histórico', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(selected = true) {
    const fixture = TestBed.createComponent(HistoryPeriodComponent);
    fixture.componentRef.setInput(
      'selection',
      selected ? { plotId: 'p', deviceId: 'd', source: 'demo' } : null,
    );
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }
  it('submit DOM aplica fechas en UTC sin consulta al editar y muestra zona/alcance', () => {
    const { fixture, component } = setup();
    const emit = vi.spyOn(component.custom, 'emit');
    const start = new Date(2026, 10, 20, 10, 30),
      end = new Date(2026, 10, 21, 12, 30);
    component.form.setValue({ from: localDateTime(start), to: localDateTime(end) });
    expect(emit).not.toHaveBeenCalled();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(emit).toHaveBeenCalledWith({ from: start.toISOString(), to: end.toISOString() });
    expect(fixture.nativeElement.textContent).toContain('las tarjetas muestran la última medición');
    expect(fixture.nativeElement.textContent).toContain(component.timezone);
  });
  it.each([
    { from: '', to: '' },
    { from: '2026-11-22T12:00', to: '2026-11-21T12:00' },
    { from: '2026-09-01T12:00', to: '2026-11-22T12:00' },
  ])('rechaza periodo inválido sin emitir ni cambiar filtro aplicado: %j', (value) => {
    const { fixture, component } = setup();
    const emit = vi.spyOn(component.custom, 'emit');
    component.form.setValue(value);
    component.apply();
    fixture.detectChanges();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'máximo 31 días',
    );
  });
  it('selección nueva limpia borrador/error; sin selección no aplica', () => {
    const { fixture, component } = setup();
    const emit = vi.spyOn(component.custom, 'emit');
    component.form.setValue({ from: '', to: '' });
    component.apply();
    fixture.componentRef.setInput('selection', null);
    fixture.detectChanges();
    expect(component.error()).toBe('');
    expect(component.form.controls.from.value).not.toBe('');
    component.apply();
    expect(emit).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('button[type="submit"]').disabled).toBe(true);
  });
  it('periodo fijo indica aplicación y desmarca presets; botón rápido emite elección', () => {
    const { fixture, component } = setup();
    fixture.componentRef.setInput('period', {
      from: '2026-11-20T12:00:00.000Z',
      to: '2026-11-21T12:00:00.000Z',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Periodo fijo:');
    expect(fixture.nativeElement.querySelectorAll('button[aria-pressed="true"]').length).toBe(0);
    const preset = vi.spyOn(component.preset, 'emit');
    fixture.nativeElement.querySelector('.period-presets button').click();
    expect(preset).toHaveBeenCalledWith(1);
  });
});
