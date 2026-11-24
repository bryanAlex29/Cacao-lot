import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Page, SoilMoistureAlert } from '@cacaosmart/contracts';
import { MoistureAlertsFacade } from '../../core/alerts/moisture-alerts.facade';
import { MoistureAlertsPanelComponent } from './moisture-alerts-panel.component';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
const alert: SoilMoistureAlert = {
  ...selection,
  id: 'moisture-alert',
  sensorId: 'sensor',
  code: 'soil_1',
  type: 'LOW_SOIL_MOISTURE',
  minValue: 30,
  maxValue: 70,
  recoveryMarginPct: 5,
  thresholdVersion: 2,
  policyVersion: 1,
  firstLowAt: '2026-11-24T00:00:00Z',
  confirmedAt: '2026-11-24T00:00:10Z',
  detectedAt: '2026-11-24T00:00:11Z',
  triggerValue: 20,
  closedAt: null,
  closeReason: null,
  acknowledgedAt: null,
};

describe('Alertas de humedad: resumen y evidencia separados', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const facade = {
      select: vi.fn(),
      reload: vi.fn(),
      acknowledge: vi.fn(),
      changePage: vi.fn(),
      page: signal<Page<SoilMoistureAlert>>({ items: [alert], total: 1, limit: 5, offset: 0 }),
      busy: signal(false),
      writing: signal(false),
      uncertain: signal(false),
      error: signal(''),
      message: signal(''),
      checkedAt: signal<string | null>('2026-11-24T00:00:12Z'),
    };
    TestBed.configureTestingModule({ imports: [MoistureAlertsPanelComponent] }).overrideComponent(
      MoistureAlertsPanelComponent,
      {
        set: { providers: [{ provide: MoistureAlertsFacade, useValue: facade }] },
      },
    );
    const fixture = TestBed.createComponent(MoistureAlertsPanelComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    return { fixture, facade, element: fixture.nativeElement as HTMLElement };
  }
  it('muestra zona, condición, fecha, origen y reconocimiento sin abrir desplegables', () => {
    const { element, facade } = setup();
    const row = element.querySelector('li')!;
    expect(facade.select).toHaveBeenCalledWith(selection);
    expect(row.querySelector('strong')?.textContent).toContain('Sensor 1 · Zona A');
    expect(row.querySelector('strong')?.textContent).toContain('condición activa');
    expect(row.querySelector('.alert-time')?.closest('details')).toBeNull();
    expect(row.querySelector('button')?.closest('details')).toBeNull();
    expect(element.textContent).toContain('DEMO · Alertas de demostración');
    row.querySelector('button')!.click();
    expect(facade.acknowledge).toHaveBeenCalledWith(alert.id);
  });
  it('despliega umbral, margen y versión sin nuevas consultas ni escrituras', () => {
    const { element, facade } = setup();
    const details = element.querySelector<HTMLDetailsElement>('.alert-evidence')!;
    expect(details.open).toBe(false);
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    expect(details.textContent).toContain('mínimo 30 %');
    expect(details.textContent).toContain('recuperación ≥ 35 %');
    expect(details.textContent).toContain('Rango v2');
    expect(facade.reload).not.toHaveBeenCalled();
    expect(facade.acknowledge).not.toHaveBeenCalled();
  });
  it('reconocimiento no oculta condición activa ni aparenta recuperación', () => {
    const { fixture, element, facade } = setup();
    facade.page.set({ ...facade.page(), items: [{ ...alert, acknowledgedAt: alert.detectedAt }] });
    fixture.detectChanges();
    expect(element.querySelector('li')?.textContent).toContain('condición activa');
    expect(element.querySelector('li')?.textContent).toContain('Reconocida');
    expect(element.querySelector('li button')).toBeNull();
    expect(element.textContent).toContain('Reconocer no significa recuperación');
  });
  it('error visible no equivale a ausencia de alertas y conserva reintento', () => {
    const { fixture, element, facade } = setup();
    facade.error.set('No se pudieron consultar las alertas de humedad');
    facade.page.set({ ...facade.page(), items: [], total: 0 });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.closest('details')).toBeNull();
    expect(element.textContent).not.toContain('Sin alertas de baja humedad registradas');
    element.querySelector('button')!.click();
    expect(facade.reload).toHaveBeenCalledTimes(1);
  });
  it('sin selección retira episodios y acciones sin inventar normalidad', () => {
    const { fixture, element } = setup();
    fixture.componentRef.setInput('selection', null);
    fixture.detectChanges();
    expect(element.querySelector('li')).toBeNull();
    expect(element.querySelector('button')).toBeNull();
    expect(element.textContent).toContain('Selecciona un dispositivo');
  });
});
