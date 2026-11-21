import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    password: ['', [Validators.required, Validators.maxLength(128)]],
  });

  submit(): void {
    if (this.busy()) return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set('');
    const input = this.form.getRawValue();
    this.auth
      .login(input.email, input.password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.reset();
          this.busy.set(false);
          void this.router.navigateByUrl('/parcelas');
        },
        error: (error: unknown) => {
          this.form.controls.password.reset();
          this.busy.set(false);
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 429
              ? 'Demasiados intentos. Espera un minuto y vuelve a intentarlo.'
              : error instanceof HttpErrorResponse && error.status === 401
                ? 'Correo o contraseña incorrectos.'
                : 'No se pudo iniciar sesión. Revisa los datos y la disponibilidad del servicio.',
          );
        },
      });
  }
}
