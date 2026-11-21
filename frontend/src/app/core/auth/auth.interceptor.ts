import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Solo rutas relativas de nuestra API: nunca adjuntar JWT a proveedores externos.
  const token =
    request.url.startsWith('/api/v1/') &&
    !['/api/v1/auth/login', '/api/v1/auth/register'].includes(request.url)
      ? auth.accessToken()
      : null;
  return next(
    token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request,
  ).pipe(
    tap({
      error: (error: unknown) => {
        if (
          token &&
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          auth.accessToken() === token
        ) {
          auth.logout();
          void router.navigateByUrl('/login');
        }
      },
    }),
  );
};
