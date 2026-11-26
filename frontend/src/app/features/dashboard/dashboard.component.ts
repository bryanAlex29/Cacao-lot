import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  isDevMode,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe, ViewportScroller } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, switchMap } from 'rxjs';
import type { DataSource, Page, PlotSummary, TelemetrySubscription } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { TelemetryFacade } from '../../core/telemetry/telemetry.facade';
import { SoilSensorCardComponent } from './soil-sensor-card.component';
import { SoilHistoryChartComponent } from './soil-history-chart.component';
import { DiagnosisPreviewComponent } from './diagnosis-preview.component';
import { DashboardInsightsComponent } from './dashboard-insights.component';
import { SensorThresholdsFacade } from '../../core/sensor-thresholds/sensor-thresholds.facade';
import { quantitativeSensors } from '../../core/sensor-thresholds/sensor-thresholds.types';
import type {
  ThresholdSensor,
  QuantitativeSensorCode,
  SensorRangeEditTarget,
} from '../../core/sensor-thresholds/sensor-thresholds.types';
import { SensorRangeComponent } from './sensor-range.component';
import { SensorRangeEditorComponent } from './sensor-range-editor.component';
import { SensorAssessmentComponent } from './sensor-assessment.component';
import { assessSensor } from '../../core/sensor-thresholds/sensor-assessment';
import { ThresholdHistoryFacade } from '../../core/sensor-thresholds/threshold-history.facade';
import { IrrigationHistoryComponent } from './irrigation-history.component';
import { ReportsPanelComponent } from './reports-panel.component';
import { HistoryPeriodComponent } from './history-period.component';
import { AppSidebarComponent, DashboardSection } from '../../shared/ui/app-sidebar.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { HeaderConnection, PageHeaderComponent } from '../../shared/ui/page-header.component';
import { CurrentWeatherCardComponent } from './current-weather-card.component';

interface DeviceOption {
  id: string;
  serial: string;
  source: DataSource;
  isActive: boolean;
  sensors: ThresholdSensor[];
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
    SensorRangeComponent,
    SensorRangeEditorComponent,
    SensorAssessmentComponent,
    IrrigationHistoryComponent,
    ReportsPanelComponent,
    HistoryPeriodComponent,
    AppSidebarComponent,
    IconComponent,
    PageHeaderComponent,
    CurrentWeatherCardComponent,
  ],
  providers: [TelemetryFacade, SensorThresholdsFacade, ThresholdHistoryFacade],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css', '../../shared/ui/workspace.css'],
})
export class DashboardComponent implements OnInit {
  navigateSection(section: DashboardSection): void {
    const actions: Record<DashboardSection, () => void> = {
      readings: () => this.scrollToReadings(),
      history: () => this.scrollToHistory(),
      'irrigation-history': () => this.scrollToIrrigation(),
      alerts: () => this.scrollToAlerts(),
      reports: () => this.scrollToReports(),
    };
    actions[section]();
  }
  readonly auth = inject(AuthService);
  readonly telemetry = inject(TelemetryFacade);
  readonly thresholds = inject(SensorThresholdsFacade);
  readonly thresholdHistory = inject(ThresholdHistoryFacade);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly viewportScroller = inject(ViewportScroller);
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
  readonly editing = signal<SensorRangeEditTarget | null>(null);
  readonly rangeMessage = signal('');
  readonly options = computed(() => this.devices().filter((d) => d.source === this.source()));
  readonly alertSensors = computed(
    () => this.options().find((option) => option.id === this.selected())?.sensors ?? [],
  );
  readonly alertSelection = computed<TelemetrySubscription | null>(() => {
    const plot = this.plot();
    const device = this.options().find((option) => option.id === this.selected());
    return this.auth.user() && plot && device
      ? { plotId: plot.id, deviceId: device.id, source: this.source() }
      : null;
  });
  readonly reading = computed(() => this.telemetry.snapshot()?.reading ?? null);
  readonly timestamp = computed(
    () =>
      this.reading()?.providerObservedAt ??
      this.reading()?.recordedAt ??
      this.reading()?.receivedAt ??
      null,
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
  readonly headerConnection = computed<HeaderConnection | null>(() => {
    if (!this.selected()) return null;
    const timestamp = this.timestamp();
    return {
      label:
        this.telemetry.status() === 'online' && this.stale()
          ? 'Conexión o datos sin actualizar'
          : this.telemetry.status() === 'online' && !timestamp
            ? 'Sin lecturas disponibles'
            : this.statusLabel(),
      healthy: !this.stale() && !!timestamp,
      timestamp,
      source: this.source(),
    };
  });
  readonly environmentAssessments = computed(() => {
    const reading = this.reading();
    const assess = (code: 'temperatureC' | 'airHumidityPct') =>
      assessSensor({
        code,
        value: reading?.[code] ?? null,
        quality: reading?.quality?.[code] ?? 'missing',
        stale: this.stale(),
        source: this.source(),
        range: this.thresholds.states()[code],
      });
    return { temperatureC: assess('temperatureC'), airHumidityPct: assess('airHumidityPct') };
  });
  readonly sensors = [{ code: 'soil_1', number: 1, zone: 'A' }] as const;
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
        this.thresholds.stop();
        this.thresholdHistory.stop();
        this.editing.set(null);
        void this.router.navigateByUrl('/login');
      }
    });
    effect(() => {
      if (this.auth.user()?.role !== 'ADMIN') this.editing.set(null);
    });
    effect(() => {
      if (this.telemetry.stream() === 'connected') this.thresholds.reload();
    });
    effect(() => {
      if (this.telemetry.sensorRefresh() > 0) untracked(() => this.thresholds.reload());
    });
    effect(() => {
      const device = this.options().find((option) => option.id === this.selected());
      const plot = this.plot();
      const readings = this.telemetry.history().items;
      const selection =
        plot && device ? { plotId: plot.id, deviceId: device.id, source: this.source() } : null;
      untracked(() =>
        this.thresholdHistory.load(
          selection,
          device?.sensors ?? [],
          device?.isActive ?? false,
          readings,
        ),
      );
    });
  }
  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => {
          this.telemetry.stop();
          this.thresholds.stop();
          this.thresholdHistory.stop();
          this.editing.set(null);
          this.rangeMessage.set('');
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
    this.editing.set(null);
    this.rangeMessage.set('');
    this.selected.set(id);
    this.telemetry.stop();
    this.thresholds.stop();
    this.thresholdHistory.stop();
    this.deviceControl.setValue(id, { emitEvent: false });
    const device = this.options().find((d) => d.id === id);
    if (this.plot() && device) {
      const selection = { plotId: this.plot()!.id, deviceId: id, source: this.source() };
      this.telemetry.select(selection);
      this.thresholds.select(selection, device.sensors ?? [], device.isActive);
    }
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
    this.editing.set(null);
    this.telemetry.stop();
    this.thresholds.stop();
    this.thresholdHistory.stop();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
  refresh(): void {
    this.telemetry.reload();
    this.thresholds.reload();
    this.thresholdHistory.reload();
  }
  scrollToAlerts(): void {
    // Scroll even when the URL already has this fragment (same-URL router navigation is ignored).
    this.viewportScroller.scrollToAnchor('alerts');
  }
  scrollToReadings(): void {
    this.viewportScroller.scrollToAnchor('readings');
  }
  scrollToHistory(): void {
    this.viewportScroller.scrollToAnchor('history');
  }
  scrollToIrrigation(): void {
    this.viewportScroller.scrollToAnchor('irrigation-history');
  }
  scrollToReports(): void {
    this.viewportScroller.scrollToAnchor('reports');
  }
  configureRange(code: QuantitativeSensorCode, label: string): void {
    if (this.auth.user()?.role !== 'ADMIN') return;
    const device = this.options().find((d) => d.id === this.selected());
    const sensors = device?.sensors.filter((s) => s.code === code) ?? [];
    const sensor = sensors[0];
    const state = this.thresholds.states()[code];
    const identity = quantitativeSensors[code];
    if (
      !this.plot() ||
      !device?.isActive ||
      sensors.length !== 1 ||
      !sensor.enabled ||
      sensor.unit !== identity.unit ||
      sensor.variable !== identity.variable ||
      (state.status !== 'configured' && state.status !== 'unconfigured')
    )
      return;
    this.rangeMessage.set('');
    this.editing.set({
      code,
      label,
      sensor: { ...sensor },
      range: state.range ? { ...state.range } : null,
      selection: { plotId: this.plot()!.id, deviceId: device.id, source: this.source() },
    });
  }
  rangeSaved(): void {
    this.editing.set(null);
    this.rangeMessage.set('Rango guardado correctamente.');
    this.thresholds.reloadAfterSave();
    this.thresholdHistory.reload();
  }
}
