import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  isDevMode,
  OnInit,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, switchMap } from 'rxjs';
import type { DataSource, Page, PlotSummary } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { TelemetryFacade } from '../../core/telemetry/telemetry.facade';
import { SoilSensorCardComponent } from './soil-sensor-card.component';
import { SoilHistoryChartComponent } from './soil-history-chart.component';
import { DiagnosisPreviewComponent } from './diagnosis-preview.component';
import { DashboardInsightsComponent } from './dashboard-insights.component';

interface DeviceOption {
  id: string;
  serial: string;
  source: DataSource;
  isActive: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    ReactiveFormsModule,
    SoilSensorCardComponent,
    SoilHistoryChartComponent,
    DiagnosisPreviewComponent,
    DashboardInsightsComponent,
  ],
  providers: [TelemetryFacade],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly telemetry = inject(TelemetryFacade);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly devMode = isDevMode();
  readonly plot = signal<PlotSummary | null>(null);
  readonly devices = signal<DeviceOption[]>([]);
  readonly deviceTotal = signal(0);
  readonly deviceOffset = signal(0);
  readonly source = signal<DataSource>('real');
  readonly selected = signal('');
  readonly deviceControl = new FormControl('', { nonNullable: true });
  readonly sourceControl = new FormControl<DataSource>('real', { nonNullable: true });
  readonly error = signal('');
  readonly loading = signal(true);
  readonly options = computed(() => this.devices().filter((d) => d.source === this.source()));
  readonly reading = computed(() => this.telemetry.snapshot()?.reading ?? null);
  readonly timestamp = computed(
    () => this.reading()?.recordedAt ?? this.reading()?.receivedAt ?? null,
  );
  readonly stale = computed(
    () =>
      this.telemetry.status() !== 'online' ||
      this.telemetry.readingStale() ||
      this.telemetry.stream() !== 'connected' ||
      !!this.telemetry.error(),
  );
  readonly statusLabel = computed(
    () =>
      ({
        online: 'Dispositivo en línea',
        stale: 'Datos desactualizados',
        offline: 'Dispositivo desconectado',
        unknown: 'Sin contacto registrado',
      })[this.telemetry.status()],
  );
  readonly sensors = [
    { code: 'soil_1', number: 1, zone: 'A' },
    { code: 'soil_2', number: 2, zone: 'B' },
    { code: 'soil_3', number: 3, zone: 'C' },
  ] as const;
  constructor() {
    this.deviceControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((id) => this.chooseDevice(id));
    this.sourceControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((source) => this.setSource(source));
    effect(() => {
      if (!this.auth.user()) {
        this.telemetry.stop();
        void this.router.navigateByUrl('/login');
      }
    });
  }
  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => {
          this.telemetry.stop();
          this.plot.set(null);
          this.devices.set([]);
          this.selected.set('');
          this.loading.set(true);
          const id = params.get('id') ?? '';
          return forkJoin({
            plot: this.http.get<PlotSummary>(`/api/v1/plots/${id}`),
            devices: this.http.get<Page<DeviceOption>>(`/api/v1/plots/${id}/devices`, {
              params: { limit: 100 },
            }),
          });
        }),
      )
      .subscribe({
        next: (result) => {
          this.plot.set(result.plot);
          this.devices.set(result.devices.items);
          this.deviceTotal.set(result.devices.total);
          this.deviceOffset.set(0);
          this.loading.set(false);
          this.chooseDefault();
        },
        error: () => {
          this.loading.set(false);
          this.error.set(
            'No se pudo acceder a esta parcela. Revisa tu sesión o vuelve a Mis parcelas.',
          );
        },
      });
  }
  setSource(value: string): void {
    if (value !== 'real' && (value !== 'demo' || !this.devMode)) return;
    this.source.set(value);
    this.chooseDefault();
    this.sourceControl.setValue(value, { emitEvent: false });
  }
  chooseDevice(id: string): void {
    this.selected.set(id);
    this.telemetry.stop();
    this.deviceControl.setValue(id, { emitEvent: false });
    if (this.plot() && this.options().some((d) => d.id === id))
      this.telemetry.select({ plotId: this.plot()!.id, deviceId: id, source: this.source() });
  }
  private chooseDefault(): void {
    this.chooseDevice(this.options().length === 1 ? this.options()[0].id : '');
  }
  loadDevices(offset: number): void {
    const plot = this.plot();
    if (!plot || this.loading() || offset < 0) return;
    this.loading.set(true);
    this.error.set('');
    this.http
      .get<Page<DeviceOption>>(`/api/v1/plots/${plot.id}/devices`, {
        params: { limit: 100, offset },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.devices.set(page.items);
          this.deviceTotal.set(page.total);
          this.deviceOffset.set(offset);
          this.loading.set(false);
          this.chooseDefault();
        },
        error: () => {
          this.loading.set(false);
          this.error.set('No se pudieron consultar los dispositivos.');
        },
      });
  }
  logout(): void {
    this.telemetry.stop();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
