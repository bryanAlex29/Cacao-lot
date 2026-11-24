import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon.component';

export function matchingPasswords(control: AbstractControl): ValidationErrors | null {
  return control.get('password')?.value === control.get('confirmPassword')?.value
    ? null
    : { passwordMismatch: true };
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, IconComponent],
  templateUrl: './register.component.html',
  styleUrls: ['../login/login.component.css', './register.component.css'],
})
export class RegisterComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]],
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(128),
          Validators.pattern(/\p{Lu}/u),
          Validators.pattern(/[\p{P}\p{S}]/u),
        ],
      ],
      confirmPassword: ['', [Validators.required, Validators.maxLength(128)]],
    },
    { validators: matchingPasswords },
  );

  constructor() {
    this.destroyRef.onDestroy(() => this.form.reset());
  }

  submit(): void {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { name, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.auth
      .register({ name: name.trim(), email: email.trim().toLowerCase(), password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.reset();
          this.busy.set(false);
          void this.router.navigateByUrl('/parcelas');
        },
        error: (error: unknown) => {
          this.form.controls.password.reset();
          this.form.controls.confirmPassword.reset();
          this.busy.set(false);
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 429
              ? 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.'
              : error instanceof HttpErrorResponse && error.status === 409
                ? 'No se pudo crear esa cuenta. Si ya tienes una, inicia sesión.'
                : error instanceof HttpErrorResponse && error.status === 400
                  ? 'Revisa los datos. La contraseña debe tener entre 8 y 128 caracteres, una mayúscula y un símbolo.'
                  : 'No se pudo completar el registro. Revisa la conexión y vuelve a intentarlo.',
          );
        },
      });
  }
}
