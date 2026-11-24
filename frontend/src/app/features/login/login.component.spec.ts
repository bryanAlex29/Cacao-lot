import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('Inicio de sesión', () => {
  it('explica renovación y expone ayuda enlazada solo cuando existe, sin iniciar sesión', async () => {
    const login = vi.fn();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('.privacy')?.textContent).toContain('hasta 8 horas');
    expect(root.querySelector('.privacy')?.textContent).not.toContain('15 minutos');
    expect(root.querySelector('input[type="password"]')?.getAttribute('autocomplete')).toBe(
      'current-password',
    );
    const details = root.querySelector<HTMLDetailsElement>('details')!;
    expect(details.open).toBe(false);
    details.querySelector('summary')!.click();
    expect(details.open).toBe(true);
    fixture.componentInstance.submit();
    fixture.detectChanges();
    for (const input of Array.from(root.querySelectorAll('input[aria-describedby]'))) {
      expect(root.querySelector('#' + input.getAttribute('aria-describedby'))).not.toBeNull();
    }
    expect(root.querySelector('#login-password-error')?.textContent).toContain(
      'Ingresa tu contraseña',
    );
    expect(login).not.toHaveBeenCalled();
  });
  it('valida antes de enviar y limpia contraseña ante un fallo', async () => {
    const login = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 401 })));
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { login } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    component.submit();
    expect(login).not.toHaveBeenCalled();
    component.form.setValue({ email: 'test@example.test', password: 'wrong-password' });
    component.submit();
    fixture.detectChanges();
    expect(component.error()).toBe('Correo o contraseña incorrectos.');
    expect(component.form.controls.password.value).toBe('');
    expect(fixture.nativeElement.querySelector('input[type="password"]')).not.toBeNull();
    expect(component.busy()).toBe(false);
  });
});
