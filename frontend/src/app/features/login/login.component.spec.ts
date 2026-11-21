import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { LoginComponent } from './login.component';

describe('Inicio de sesión', () => {
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
