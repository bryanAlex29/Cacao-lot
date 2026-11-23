import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, map, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService),
    router = inject(Router);
  if (auth.accessToken()) return true;
  return auth.user()
    ? auth.renew().pipe(
        map(() => true),
        catchError(() => of(router.createUrlTree(['/login']))),
      )
    : router.createUrlTree(['/login']);
};
