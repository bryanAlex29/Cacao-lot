import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaterConsumptionExampleComponent } from './water-consumption-example.component';

const selection: TelemetrySubscription = { plotId: 'plot', deviceId: 'device', source: 'real' };

describe('Inline water consumption example, not real water metrics', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [WaterConsumptionExampleComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(WaterConsumptionExampleComponent);
    fixture.componentRef.setInput('selection', selection);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      http: TestBed.inject(HttpTestingController),
    };
  }

  it('starts with actual consumption unavailable, without a fictitious result', async () => {
    const { element } = await setup();
    expect(element.textContent).toContain('No disponible');
    expect(element.textContent).toContain('No calculable');
    expect(element.textContent).not.toContain('20 %');
    expect(element.querySelector('button')?.textContent?.trim()).toBe('Ver ejemplo');
    expect(element.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the labeled 100/80/20L/20% example in the same card without navigation', async () => {
    const { element, fixture } = await setup();
    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.demo-badge')?.textContent).toContain('DEMO · Ejemplo ficticio');
    expect(element.textContent).toContain(
      'No representa el consumo ni el ahorro real de esta parcela',
    );
    expect(
      Array.from(element.querySelectorAll('dd')).map((node) => node.textContent?.trim()),
    ).toEqual(['100 L', '80 L', '20 L · 20 %']);
    expect(element.textContent).toContain('no calculada con el relé');
    expect(element.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('button')?.textContent?.trim()).toBe('Cerrar ejemplo');
    expect(element.querySelector('a, dialog, iframe')).toBeNull();
  });

  it('closing removes fictitious numbers and restores unavailable actual metrics', async () => {
    const { element, fixture } = await setup();
    element.querySelector('button')!.click();
    fixture.detectChanges();
    element.querySelector('button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.example')).toBeNull();
    expect(element.textContent).toContain('No calculable');
    expect(element.textContent).not.toContain('100 L');
    expect(element.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not issue any requests or persist anything in browser storage', async () => {
    const save = vi.spyOn(Storage.prototype, 'setItem');
    const remove = vi.spyOn(Storage.prototype, 'removeItem');
    const { fixture, component, http } = await setup();
    component.toggleExample();
    fixture.detectChanges();
    component.toggleExample();
    fixture.detectChanges();
    http.expectNone(() => true);
    http.verify();
    expect(save).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([
    { ...selection, plotId: 'another-plot' },
    { ...selection, deviceId: 'another-device' },
    { ...selection, source: 'demo' as const },
    null,
  ])('discards preview when the actual selection changes (%j)', async (next) => {
    const { fixture, component } = await setup();
    component.toggleExample();
    fixture.detectChanges();
    fixture.componentRef.setInput('selection', next);
    fixture.detectChanges();
    expect(component.exampleOpen()).toBe(false);
  });

  it('does not close or change context when the same selection object is refreshed', async () => {
    const { fixture, component } = await setup();
    component.toggleExample();
    fixture.detectChanges();
    fixture.componentRef.setInput('selection', { ...selection });
    fixture.detectChanges();
    expect(component.exampleOpen()).toBe(true);
    expect(component.selection()).toEqual(selection);
    expect(component.savedLiters).toBe(20);
    expect(component.savedPercent).toBe(20);
  });

  it('discards state on destruction rather than saving it for the next visit', async () => {
    const { fixture, component } = await setup();
    component.toggleExample();
    fixture.detectChanges();
    fixture.destroy();
    const fresh = TestBed.createComponent(WaterConsumptionExampleComponent);
    fresh.detectChanges();
    expect(fresh.componentInstance.exampleOpen()).toBe(false);
  });
});
