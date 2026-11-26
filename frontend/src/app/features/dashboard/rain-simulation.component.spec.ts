import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RainSimulationComponent } from './rain-simulation.component';

describe('Rain simulation: browser-only demo', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup() {
    await TestBed.configureTestingModule({
      imports: [RainSimulationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    const fixture = TestBed.createComponent(RainSimulationComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
    };
  }

  it('labels every simulated measurement and keeps missing sensors and control separate', async () => {
    const { fixture } = await setup();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('DEMO · SOLO EN ESTA PÁGINA');
    expect(element.textContent).toContain('No son lecturas de ThingSpeak');
    expect(element.textContent).toContain('Lluvia simulada');
    expect(element.textContent).toContain('No se guarda la simulación');
    expect(element.textContent).toContain('Relé y válvula');
    expect(element.textContent).toContain('Sin simular');
    expect(element.textContent).not.toContain('Zonas B y C');
    expect(element.querySelector('table caption')?.textContent).toContain('No es el histórico');
    expect(element.querySelectorAll('article h3')).toHaveLength(5);
  });

  it('changes fictional values by explicit scenes, not physical time', async () => {
    const { fixture, component } = await setup();
    const element: HTMLElement = fixture.nativeElement;
    const value = (name: string) => element.querySelector(`[data-testid="${name}"]`)?.textContent;
    expect(value('demo-temperature')).toBe('26 °C');
    expect(value('demo-air')).toBe('82 %');
    expect(value('demo-soil')).toBe('35 %');
    const advance = Array.from(element.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Avanzar'),
    )!;
    advance.click();
    fixture.detectChanges();
    expect(value('demo-temperature')).toBe('25 °C');
    expect(value('demo-air')).toBe('88 %');
    expect(value('demo-soil')).toBe('48 %');
    advance.click();
    fixture.detectChanges();
    expect(value('demo-soil')).toBe('61 %');
    expect(advance.disabled).toBe(true);
    component.advance();
    expect(component.step()).toBe(2);
    component.restart();
    fixture.detectChanges();
    expect(component.step()).toBe(0);
    expect(value('demo-soil')).toBe('35 %');
  });

  it('does not send requests or persist to browser storage, including during restart/exit', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const { fixture, component, http } = await setup();
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.advance();
    component.restart();
    const back = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Volver a datos reales'),
    )!;
    back.click();
    expect(closed).toHaveBeenCalledTimes(1);
    http.expectNone(() => true);
    http.verify();
    expect(local).not.toHaveBeenCalled();
  });

  it('discards local state on destruction and opens a clean demo next time', async () => {
    const { fixture, component } = await setup();
    component.advance();
    fixture.destroy();
    const next = TestBed.createComponent(RainSimulationComponent);
    next.detectChanges();
    expect(next.componentInstance.step()).toBe(0);
  });
});
