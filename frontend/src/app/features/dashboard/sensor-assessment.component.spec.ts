import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SoilSensorCardComponent } from './soil-sensor-card.component';
import type { SensorRangeState } from '../../core/sensor-thresholds/sensor-thresholds.types';

const range: SensorRangeState = {
  status: 'configured',
  unit: 'PERCENT',
  checkedAt: null,
  range: {
    id: 'range',
    minValue: 20,
    maxValue: 70,
    version: 1,
    updatedBy: 'admin',
    effectiveAt: '2026-11-21T00:00:00Z',
    hysteresis: 0,
  },
};

describe('Tarjeta: comparación, calidad y barra independientes', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    TestBed.configureTestingModule({ imports: [SoilSensorCardComponent] });
    const fixture = TestBed.createComponent(SoilSensorCardComponent);
    for (const [key, value] of Object.entries({
      code: 'soil_1',
      source: 'demo',
      number: 1,
      zone: 'A',
      value: 10,
      quality: 'uncalibrated',
      stale: false,
      range,
    }))
      fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  it('muestra texto, icono y color sin ocultar Sin calibrar o DEMO', () => {
    const fixture = setup();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.assessment')?.getAttribute('data-comparison')).toBe('low');
    expect(element.querySelector('.comparison')?.textContent).toContain('↓ Bajo');
    expect(element.textContent).toContain('Sin calibrar');
    expect(element.textContent).toContain('DEMO · Comparación simulada');
    expect(element.querySelector<HTMLElement>('.track div')?.style.width).toBe('10%');
    expect(element.querySelector('.comparison')?.classList.contains('warning')).toBe(true);
  });

  it('reacciona a lectura nueva y a cambio de rango sin recrear la tarjeta', () => {
    const fixture = setup();
    fixture.componentRef.setInput('value', 45);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.assessment').dataset.comparison).toBe('within');
    fixture.componentRef.setInput('range', { ...range, range: { ...range.range!, maxValue: 40 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.assessment').dataset.comparison).toBe('high');
    expect(fixture.nativeElement.querySelector('strong').textContent).toContain('45');
  });

  it('conserva la lectura antigua sin presentarla como En rango', () => {
    const fixture = setup();
    fixture.componentRef.setInput('value', 45);
    fixture.componentRef.setInput('stale', true);
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Desactualizado');
    expect(element.textContent).toContain('Sin calibrar');
    expect(element.querySelector('.comparison')?.classList.contains('within')).toBe(false);
    expect(element.querySelector('strong')?.textContent).toContain('45');
  });

  it('dato inválido no muestra cifra ni rellena barra con un valor engañoso', () => {
    const fixture = setup();
    fixture.componentRef.setInput('quality', 'invalid');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('strong').textContent).toContain('—');
    expect(fixture.nativeElement.textContent).toContain('Dato inválido');
    expect(fixture.nativeElement.querySelector('.track div').style.width).toBe('0%');
    expect(fixture.nativeElement.querySelector('.comparison')).toBeNull();
  });
});
