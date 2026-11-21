import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { RegisterComponent } from './register.component';

describe('Formulario de registro', () => {
  const valid = {
    name: ' Agricultor ',
    email: 'USER@example.test',
    password: 'Abcdefg!',
    confirmPassword: 'Abcdefg!',
  };

  async function create(register = vi.fn(() => of({}))) {
    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { register } }],
    }).compileComponents();
    const navigation = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, register, navigation };
  }

  it('no envía formulario vacío ni contraseñas diferentes', async () => {
    const { component, register, fixture } = await create();
    component.submit();
    expect(register).not.toHaveBeenCalled();
    component.form.setValue({ ...valid, confirmPassword: 'another-password' });
    component.submit();
    fixture.detectChanges();
    expect(register).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Las contraseñas deben coincidir');
  });

  it('envía solo nombre, correo y contraseña, limpia secretos y entra a parcelas', async () => {
    const { component, register, navigation } = await create();
    component.form.setValue(valid);
    component.submit();
    expect(register).toHaveBeenCalledWith({
      name: 'Agricultor',
      email: 'user@example.test',
      password: valid.password,
    });
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');
    expect(navigation).toHaveBeenCalledWith('/parcelas');
  });

  it('evita doble envío mientras está pendiente', async () => {
    const pending = new Subject<Record<string, never>>();
    const register = vi.fn(() => pending.asObservable());
    const { component } = await create(register);
    component.form.setValue(valid);
    component.submit();
    component.submit();
    expect(register).toHaveBeenCalledTimes(1);
    expect(component.busy()).toBe(true);
    pending.complete();
  });

  it.each(['Abcdef!', 'abcdefg!', 'Abcdefgh', 'Abcdefg ', 'Abcdefg1', `A${'a'.repeat(127)}!`])(
    'no envía contraseña fuera de la política',
    async (password) => {
      const { component, register } = await create();
      component.form.setValue({ ...valid, password, confirmPassword: password });
      component.submit();
      expect(register).not.toHaveBeenCalled();
      expect(component.form.controls.password.invalid).toBe(true);
    },
  );

  it.each([409, 429, 0, 400])('muestra error %s y limpia ambas contraseñas', async (status) => {
    const register = vi.fn(() => throwError(() => new HttpErrorResponse({ status })));
    const { component, navigation } = await create(register);
    component.form.setValue(valid);
    component.submit();
    expect(component.error()).not.toBe('');
    expect(component.form.controls.password.value).toBe('');
    expect(component.form.controls.confirmPassword.value).toBe('');
    expect(component.busy()).toBe(false);
    expect(navigation).not.toHaveBeenCalled();
  });
});
