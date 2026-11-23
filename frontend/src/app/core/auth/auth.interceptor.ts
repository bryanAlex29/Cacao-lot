import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { switchMap, tap } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // Solo rutas relativas de nuestra API: nunca adjuntar JWT a proveedores externos.
  const protectedApi =
    request.url.startsWith('/api/v1/') &&
    ![
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/health/live',
      '/api/v1/health/ready',
    ].includes(request.url);
  const token = protectedApi ? auth.accessToken() : null;
  const expire = () => {
    auth.clearSession();
    void router.navigateByUrl('/login');
  };
  const previousUser = auth.user()?.id;
  let renewedToken: string | undefined;
  if (protectedApi && !token && auth.user())
    return auth.renew().pipe(
      switchMap((session) => {
        renewedToken = session.accessToken;
        return next(
          request.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } }),
        );
      }),
      tap({
        error: (error: unknown) => {
          if (
            error instanceof HttpErrorResponse &&
            error.status === 401 &&
            (renewedToken
              ? auth.accessToken() === renewedToken
              : auth.user()?.id === previousUser && !auth.accessToken())
          )
            expire();
        },
      }),
    );
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
          expire();
        }
      },
    }),
  );
};
