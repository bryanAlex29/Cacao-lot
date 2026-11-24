import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageHeaderComponent } from './page-header.component';

describe('Encabezado compartido sin consultas ni autenticación propias', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    await TestBed.configureTestingModule({
      imports: [PageHeaderComponent],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(PageHeaderComponent);
    fixture.componentRef.setInput('title', 'Parcela de prueba');
    fixture.componentRef.setInput('subtitle', 'Chone');
    fixture.componentRef.setInput('user', { name: 'Usuario de prueba', role: 'FARMER' });
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }
  it('muestra identidad y ubicación sin fingir conexión ni crear otro h1', async () => {
    const { root } = await setup();
    expect(root.textContent).toContain('Parcela de prueba');
    expect(root.textContent).toContain('Chone');
    expect(root.textContent).toContain('Usuario de prueba');
    expect(root.textContent).toContain('Agricultor');
    expect(root.querySelector('.connection')).toBeNull();
    expect(root.querySelector('h1')).toBeNull();
    expect(root.querySelector('.change-plot')).toBeNull();
  });
  it('permite título principal solo cuando la pantalla lo solicita y enlaza el listado real', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('primaryHeading', true);
    fixture.componentRef.setInput('canChangePlot', true);
    fixture.detectChanges();
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('a')?.getAttribute('href')).toBe('/parcelas');
  });
  it('propaga salida una vez y no implementa otra sesión', async () => {
    const { fixture, root } = await setup();
    const signOut = vi.fn();
    fixture.componentInstance.signOut.subscribe(signOut);
    root.querySelector('button')!.click();
    expect(signOut).toHaveBeenCalledTimes(1);
  });
  it('sin usuario no inventa rol y deshabilita salida', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('user', null);
    fixture.detectChanges();
    expect(root.textContent).toContain('Sesión no disponible');
    expect(root.textContent).not.toContain('Agricultor');
    expect(root.querySelector('button')!.disabled).toBe(true);
  });
  it('actualiza el rol sin persistir ni exponer correo', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('user', {
      name: 'Administradora',
      role: 'ADMIN',
      email: 'private@example.test',
    });
    fixture.detectChanges();
    expect(root.textContent).toContain('Administrador');
    expect(root.textContent).not.toContain('private@example.test');
  });
  it('distingue DEMO y lectura fechada; pierde el estado saludable al degradarse', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('connection', {
      label: 'Dispositivo en línea',
      healthy: true,
      timestamp: '2026-11-24T00:00:00Z',
      source: 'demo',
    });
    fixture.detectChanges();
    expect(root.querySelector('.connection-badge.healthy')).not.toBeNull();
    expect(root.querySelector('.connection-badge')?.textContent).toContain('DEMO');
    expect(root.querySelector('.last-reading')?.textContent).toContain('Última lectura');
    fixture.componentRef.setInput('connection', {
      label: 'Sin contacto registrado',
      healthy: false,
      timestamp: null,
      source: 'real',
    });
    fixture.detectChanges();
    expect(root.querySelector('.connection-badge.healthy')).toBeNull();
    expect(root.querySelector('.connection-badge')?.textContent).toContain('REAL');
    expect(root.textContent).toContain('Sin lecturas disponibles');
  });
  it('no colorea como saludable un estado sin lectura fechada', async () => {
    const { fixture, root } = await setup();
    fixture.componentRef.setInput('connection', {
      label: 'Sin lecturas disponibles',
      healthy: true,
      timestamp: null,
      source: 'real',
    });
    fixture.detectChanges();
    expect(root.querySelector('.connection-badge.healthy')).toBeNull();
  });
});
