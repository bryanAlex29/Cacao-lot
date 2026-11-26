import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterLink } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppSidebarComponent } from './app-sidebar.component';
import { IconComponent } from './icon.component';

describe('Navegación visual compartida', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(
    active: 'dashboard' | 'plots' | 'diagnosis' | 'weather' = 'plots',
    plotId: string | null = null,
  ) {
    await TestBed.configureTestingModule({
      imports: [AppSidebarComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppSidebarComponent);
    fixture.componentRef.setInput('active', active);
    fixture.componentRef.setInput('plotId', plotId);
    fixture.detectChanges();
    return fixture;
  }

  it('no genera rutas de parcela vacías ni funciones operativas ficticias', async () => {
    const fixture = await setup();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('a[href*="/dashboard"]')).toBeNull();
    expect(root.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
    expect(root.querySelector('nav a.active')?.textContent).toContain('Parcelas');
    expect(root.querySelector('.pending')?.textContent).toContain('No disponible');
    expect(root.querySelectorAll('svg').length).toBeGreaterThan(3);
    expect(root.querySelector('a[href="/estado"]')).not.toBeNull();
  });

  it.each(['dashboard', 'diagnosis', 'weather'] as const)(
    'marca una única sección activa en %s',
    async (active) => {
      const fixture = await setup(active, 'plot-1');
      const root: HTMLElement = fixture.nativeElement;
      expect(root.querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
      expect(root.querySelector('a[href="/parcelas/plot-1/clima"]')).not.toBeNull();
      expect(root.querySelector('a[href="/diagnostico-ia?plotId=plot-1"]')).not.toBeNull();
    },
  );

  it('expande el menú y lo cierra al seleccionar una sección conservando el evento', async () => {
    const fixture = await setup('dashboard', 'plot-1');
    const selected = vi.fn();
    fixture.componentInstance.sectionSelected.subscribe(selected);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-toggle');
    button.click();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('nav.expanded')).not.toBeNull();
    fixture.componentInstance.selectSection('alerts');
    fixture.detectChanges();
    expect(selected).toHaveBeenCalledWith('alerts');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('conserva anclas y parámetros dentro del dashboard', async () => {
    const fixture = await setup('dashboard', 'plot-1');
    const links = fixture.debugElement.queryAll(By.directive(RouterLink));
    for (const fragment of ['readings', 'history', 'irrigation-history', 'alerts', 'reports']) {
      const link = links.find((element) => element.injector.get(RouterLink).fragment === fragment)!;
      const directive = link.injector.get(RouterLink);
      expect(directive.queryParamsHandling).toBe('preserve');
      expect(directive.href).toContain('#' + fragment);
    }
  });

  it('los iconos decorativos no añaden nombres accesibles duplicados', async () => {
    const fixture = await setup();
    const icon = fixture.debugElement.query(By.directive(IconComponent));
    expect(icon.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(icon.nativeElement.querySelector('svg').getAttribute('focusable')).toBe('false');
  });

  it('Escape cierra el menú expandido, devuelve foco y no emite una sección', async () => {
    const fixture = await setup('dashboard', 'plot-1');
    const selected = vi.fn();
    fixture.componentInstance.sectionSelected.subscribe(selected);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.menu-toggle');
    button.click();
    fixture.detectChanges();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('nav').dispatchEvent(event);
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(button);
    expect(event.defaultPrevented).toBe(true);
    expect(selected).not.toHaveBeenCalled();
  });

  it('Escape no se intercepta cuando el menú ya está cerrado', async () => {
    const fixture = await setup();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('aside').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('un clic en contenido de un enlace cierra el menú sin alterar rutas ni disparar sección', async () => {
    const fixture = await setup('dashboard', 'plot-1');
    const selected = vi.fn();
    fixture.componentInstance.sectionSelected.subscribe(selected);
    fixture.componentInstance.expanded.set(true);
    fixture.detectChanges();
    const anchor: HTMLAnchorElement = fixture.nativeElement.querySelector('nav a');
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const content = anchor.querySelector('app-icon')!;
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    // Avoid router navigation in this unit test, while preserving the bubbling target.
    anchor.addEventListener('click', (click) => click.preventDefault(), { once: true });
    content.dispatchEvent(event);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.componentInstance.expanded()).toBe(false);
    expect(selected).not.toHaveBeenCalled();
    expect(anchor.getAttribute('href')).toBe('/parcelas/plot-1/dashboard');
  });
});
