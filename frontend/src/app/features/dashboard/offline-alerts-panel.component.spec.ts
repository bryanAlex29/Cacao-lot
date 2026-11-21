import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeviceOfflineAlert, Page } from '@cacaosmart/contracts';
import { OfflineAlertsFacade } from '../../core/alerts/offline-alerts.facade';
import { OfflineAlertsPanelComponent } from './offline-alerts-panel.component';

const selection = { deviceId: 'device', plotId: 'plot', source: 'demo' as const };
const alert: DeviceOfflineAlert = {
  ...selection,
  id: 'alert',
  type: 'DEVICE_OFFLINE',
  severity: 'warning',
  lastSeenAt: '2026-11-21T00:00:00Z',
  expectedIntervalSeconds: 5,
  detectedAt: '2026-11-21T00:00:26Z',
  closedAt: null,
  closeReason: null,
  acknowledgedAt: null,
};

describe('Panel: condición y reconocimiento separados, sin alterar otras tarjetas', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const facade = {
      select: vi.fn(),
      reload: vi.fn(),
      acknowledge: vi.fn(),
      changePage: vi.fn(),
      page: signal<Page<DeviceOfflineAlert>>({ items: [alert], total: 1, limit: 5, offset: 0 }),
      busy: signal(false),
      error: signal(''),
      writing: signal(false),
      uncertain: signal(false),
      message: signal(''),
      checkedAt: signal<string | null>('2026-11-21T00:00:30Z'),
    };
    TestBed.configureTestingModule({ imports: [OfflineAlertsPanelComponent] }).overrideComponent(
      OfflineAlertsPanelComponent,
      { set: { providers: [{ provide: OfflineAlertsFacade, useValue: facade }] } },
    );
    const fixture = TestBed.createComponent(OfflineAlertsPanelComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    return { fixture, facade, element: fixture.nativeElement as HTMLElement };
  }
  it('muestra DEMO, fecha, evidencia, condición y acción explícita', () => {
    const { facade, element } = setup();
    expect(facade.select).toHaveBeenCalledWith(selection);
    expect(element.textContent).toContain('DEMO · Alertas de demostración');
    expect(element.textContent).toContain('Desconexión detectada · condición activa');
    expect(element.textContent).toContain('25 s (5 intervalos');
    expect(element.textContent).toContain('Pendiente de reconocimiento');
    Array.from(element.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reconocer alerta'))
      ?.click();
    expect(facade.acknowledge).toHaveBeenCalledWith('alert');
  });
  it('reconocida no implica contacto restablecido ni desaparece la condición activa', () => {
    const { fixture, facade, element } = setup();
    facade.page.set({
      ...facade.page(),
      items: [{ ...alert, acknowledgedAt: '2026-11-21T00:00:28Z' }],
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Reconocida');
    expect(element.textContent).toContain('condición activa');
    expect(element.textContent).not.toContain('Contacto restablecido');
    expect(
      Array.from(element.querySelectorAll('button')).some((b) =>
        b.textContent?.includes('Reconocer alerta'),
      ),
    ).toBe(false);
  });
  it('recuperación de contacto y cierre por deshabilitación tienen etiquetas diferentes', () => {
    const { fixture, facade, element } = setup();
    facade.page.set({
      ...facade.page(),
      items: [{ ...alert, closedAt: '2026-11-21T00:00:29Z', closeReason: 'CONTACT_RESTORED' }],
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Contacto restablecido');
    facade.page.set({
      ...facade.page(),
      items: [{ ...alert, closedAt: '2026-11-21T00:00:29Z', closeReason: 'MONITORING_STOPPED' }],
    });
    fixture.detectChanges();
    expect(element.textContent).toContain('Cerrada al deshabilitar monitoreo');
    expect(element.textContent).not.toContain('Contacto restablecido');
  });
  it('error no se presenta como ausencia de alertas; permite reintentar', () => {
    const { fixture, facade, element } = setup();
    facade.error.set('No se pudieron consultar las alertas');
    facade.page.set({ ...facade.page(), items: [], total: 0 });
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No se pudieron');
    expect(element.textContent).not.toContain('Sin alertas de desconexión registradas');
    element.querySelector('button')?.click();
    expect(facade.reload).toHaveBeenCalledTimes(1);
  });
  it('sin selección no ofrece reconocimiento ni consulta de otro equipo', () => {
    const { fixture, facade, element } = setup();
    fixture.componentRef.setInput('selection', null);
    fixture.detectChanges();
    expect(facade.select).toHaveBeenLastCalledWith(null);
    expect(element.textContent).toContain('Selecciona un dispositivo');
    expect(element.querySelector('button')).toBeNull();
  });
});
