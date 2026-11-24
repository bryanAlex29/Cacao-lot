import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'parcelas/:id/clima',
    canActivate: [authGuard],
    loadComponent: () => import('./features/weather/weather.component').then((m) => m.WeatherComponent),
  },
  {
    path: 'diagnostico-ia',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/ai-diagnosis/ai-diagnosis.component').then((m) => m.AiDiagnosisComponent),
  },
  {
    path: 'parcelas/:id/dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'estado',
    loadComponent: () =>
      import('./features/system-status/system-status.component').then(
        (m) => m.SystemStatusComponent,
      ),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'parcelas',
    canActivate: [authGuard],
    loadComponent: () => import('./features/plots/plots.component').then((m) => m.PlotsComponent),
  },
  {
    path: 'registro',
    loadComponent: () =>
      import('./features/register/register.component').then((m) => m.RegisterComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'parcelas' },
  { path: '**', redirectTo: '' },
];
