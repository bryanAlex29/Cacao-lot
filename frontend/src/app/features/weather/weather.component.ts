import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Subscription, timeout } from 'rxjs';
import type {
  PlotSummary,
  WeatherSnapshot,
  WeatherObservationSummary,
  WeatherVariable,
} from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { AppSidebarComponent } from '../../shared/ui/app-sidebar.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { IconComponent } from '../../shared/ui/icon.component';

const variables: WeatherVariable[] = [
  'temperature_2m',
  'relative_humidity_2m',
  'precipitation',
  'et0_fao_evapotranspiration',
];
export function checkedWeather(snapshot: WeatherSnapshot): WeatherSnapshot {
  if (
    !snapshot ||
    !['disabled', 'open-meteo'].includes(snapshot.provider) ||
    !Array.isArray(snapshot.items) ||
    snapshot.items.length > 28
  )
    throw new Error('Respuesta meteorológica incompatible');
  const profile = snapshot.profile;
  if (
    profile &&
    (!Number.isFinite(profile.latitude) ||
      Math.abs(profile.latitude) > 90 ||
      !Number.isFinite(profile.longitude) ||
      Math.abs(profile.longitude) > 180 ||
      !['America/Guayaquil', 'Pacific/Galapagos'].includes(profile.timezone) ||
      !Number.isInteger(profile.version) ||
      profile.version < 1 ||
      typeof profile.enabled !== 'boolean')
  )
    throw new Error('Ubicación incompatible');
  const seen = new Set<string>();
  for (const item of snapshot.items) {
    const index = variables.indexOf(item.variable),
      key = item.date + ':' + item.variable;
    if (
      index < 0 ||
      item.unit !== ['°C', '%', 'mm', 'mm'][index] ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(Date.parse(item.date)) ||
      !['modeled', 'missing'].includes(item.quality) ||
      seen.has(key) ||
      (item.quality === 'missing'
        ? item.value !== null
        : typeof item.value !== 'number' || !Number.isFinite(item.value))
    )
      throw new Error('Datos meteorológicos incompatibles');
    seen.add(key);
  }
  if (
    snapshot.items.length &&
    (!profile ||
      !snapshot.provenance ||
      snapshot.provenance.dataset !== 'ERA5' ||
      snapshot.provenance.provider !== 'Open-Meteo' ||
      snapshot.provenance.model !== 'era5' ||
      !Number.isFinite(Date.parse(snapshot.provenance.fetchedAt)) ||
      snapshot.provenance.requestedLatitude !== profile.latitude ||
      snapshot.provenance.requestedLongitude !== profile.longitude ||
      snapshot.provenance.timezone !== profile.timezone)
  )
    throw new Error('Procedencia incompatible');
  return snapshot;
}

@Component({
  selector: 'app-weather',
  standalone: true,
  imports: [
    AppSidebarComponent,
    PageHeaderComponent,
    IconComponent,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
  ],
  templateUrl: './weather.component.html',
  styleUrls: ['./weather.component.css', '../../shared/ui/workspace.css'],
})
export class WeatherComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private request = new Subscription();
  private id = '';
  readonly plot = signal<PlotSummary | null>(null);
  readonly snapshot = signal<WeatherSnapshot | null>(null);
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly variableFilter = new FormControl<WeatherVariable | ''>('', { nonNullable: true });
  readonly form = inject(FormBuilder).nonNullable.group({
    latitude: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(-90),
      Validators.max(90),
    ]),
    longitude: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(-180),
      Validators.max(180),
    ]),
    timezone: ['America/Guayaquil', Validators.required],
    enabled: [false],
  });
  readonly names: Record<WeatherVariable, string> = {
    temperature_2m: 'Temperatura media a 2 m',
    relative_humidity_2m: 'Humedad relativa media a 2 m',
    precipitation: 'Precipitación acumulada',
    et0_fao_evapotranspiration: 'ET₀ de referencia',
  };
  constructor() {
    const destroy = inject(DestroyRef);
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(destroy))
      .subscribe((params) => {
        this.reset();
        this.id = params.get('id') ?? '';
        if (this.id) this.load();
      });
    effect(() => {
      if (!this.auth.user()) this.reset();
    });
    destroy.onDestroy(() => this.request.unsubscribe());
  }
  logout(): void {
    this.reset();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
  private url(): string {
    return `/api/v1/plots/${encodeURIComponent(this.id)}/weather`;
  }
  private begin() {
    this.request.unsubscribe();
    this.request = new Subscription();
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
  }
  load(): void {
    if (!this.id || this.busy()) return;
    this.begin();
    this.snapshot.set(null);
    this.plot.set(null);
    this.request.add(
      forkJoin({
        plot: this.http.get<PlotSummary>(`/api/v1/plots/${encodeURIComponent(this.id)}`),
        weather: this.http.get<WeatherSnapshot>(this.url()),
      })
        .pipe(timeout(10000))
        .subscribe({
          next: ({ plot, weather }) => {
            try {
              if (plot.id !== this.id) throw new Error('Parcela incompatible');
              this.accept(weather);
              this.plot.set(plot);
              this.uncertain.set(false);
            } catch {
              this.error.set('La respuesta no coincide con la parcela o procedencia esperadas.');
            }
            this.busy.set(false);
          },
          error: () => {
            this.busy.set(false);
            this.error.set('No se pudo consultar el clima privado. Actualiza para reintentar.');
          },
        }),
    );
  }
  private accept(value: WeatherSnapshot) {
    const snapshot = checkedWeather(value);
    this.snapshot.set(snapshot);
    this.form.reset({
      latitude: snapshot.profile?.latitude ?? null,
      longitude: snapshot.profile?.longitude ?? null,
      timezone: snapshot.profile?.timezone ?? 'America/Guayaquil',
      enabled: snapshot.profile?.enabled ?? false,
    });
  }
  save(): void {
    if (this.busy() || this.uncertain() || this.auth.user()?.role !== 'ADMIN') return;
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(
        'Indica coordenadas válidas; hasta cinco decimales. No se deducen de la ubicación escrita.',
      );
      return;
    }
    const value = this.form.getRawValue();
    if (
      [value.latitude!, value.longitude!].some(
        (v) => !Number.isFinite(v) || Math.abs(v * 100000 - Math.round(v * 100000)) > 0.000001,
      )
    ) {
      this.error.set('Usa un máximo de cinco decimales en las coordenadas.');
      return;
    }
    this.begin();
    this.request.add(
      this.http
        .put<WeatherSnapshot>(this.url() + '/profile', {
          ...value,
          expectedVersion: this.snapshot()?.profile?.version ?? 0,
        })
        .pipe(timeout(10000))
        .subscribe({
          next: (snapshot) => {
            try {
              this.accept(snapshot);
              this.message.set(
                'Ubicación y autorización guardadas. Guardar no consulta al proveedor.',
              );
            } catch {
              this.uncertain.set(true);
              this.error.set('Respuesta incompatible. Actualiza antes de continuar.');
            }
            this.busy.set(false);
          },
          error: (error: unknown) => {
            this.busy.set(false);
            this.uncertain.set(true);
            this.error.set(
              error instanceof HttpErrorResponse && error.status === 409
                ? 'La configuración cambió en otra sesión. Se conserva el borrador; actualiza y revisa antes de guardar.'
                : 'No se confirmó el guardado. No se reenvía automáticamente; actualiza y revisa el estado.',
            );
          },
        }),
    );
  }
  sync(): void {
    const snapshot = this.snapshot();
    if (
      this.busy() ||
      this.uncertain() ||
      this.auth.user()?.role !== 'ADMIN' ||
      snapshot?.provider !== 'open-meteo' ||
      !snapshot.profile?.enabled
    )
      return;
    this.begin();
    this.request.add(
      this.http
        .post<WeatherSnapshot & { status: string }>(this.url() + '/sync', {})
        .pipe(timeout(30000))
        .subscribe({
          next: (value) => {
            try {
              if (!['updated', 'cooldown'].includes(value.status))
                throw new Error('Estado de sincronización incompatible');
              this.accept(value);
              this.message.set(
                value.status === 'cooldown'
                  ? 'Sin consulta nueva: espera al próximo intento permitido (15 minutos entre intentos).'
                  : 'Clima histórico sincronizado. No es un pronóstico ni una medición de tus sensores.',
              );
            } catch {
              this.uncertain.set(true);
              this.error.set('Respuesta meteorológica incompatible; actualiza para verificar.');
            }
            this.busy.set(false);
          },
          error: () => {
            this.busy.set(false);
            this.uncertain.set(true);
            this.error.set(
              'No se confirmó la sincronización. Actualiza el estado; no se reenvía automáticamente ni se inventan valores.',
            );
          },
        }),
    );
  }
  isStale(): boolean {
    const date = this.snapshot()?.provenance?.fetchedAt;
    return !!date && Date.now() - Date.parse(date) > 36 * 3600000;
  }
  track(item: WeatherObservationSummary) {
    return item.date + item.variable;
  }
  private reset() {
    this.request.unsubscribe();
    this.request = new Subscription();
    this.id = '';
    this.plot.set(null);
    this.snapshot.set(null);
    this.form.reset();
    this.busy.set(false);
    this.uncertain.set(false);
    this.error.set('');
    this.message.set('');
    this.variableFilter.reset();
  }
}
