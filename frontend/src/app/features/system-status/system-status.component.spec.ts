import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { HealthService } from '../../core/health/health.service';
import { SystemStatusComponent } from './system-status.component';

describe('Pantalla de base técnica', () => {
  it('muestra salud real de servicios sin afirmar conexión de sensores', async () => {
    await TestBed.configureTestingModule({
      imports: [SystemStatusComponent],
      providers: [
        { provide: HealthService, useValue: { check: () => of({ api: 'up', database: 'down' }) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.textContent).toContain('Sin datos de sensores todavía.');
    expect(element.textContent).toContain('No disponible');
    expect(element.textContent).not.toContain('Sistema en línea');
    expect(element.querySelector('h1')?.textContent).toContain('cuidar el cacao');
  });
});
