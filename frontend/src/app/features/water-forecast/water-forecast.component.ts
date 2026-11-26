import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Subscription, timeout } from 'rxjs';
import type {
  PlotSummary,
  PredictionAvailability,
  TelemetrySubscription,
} from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { DevicesApi, RegisteredDevice } from '../../core/devices/devices-api.service';
import { AppSidebarComponent } from '../../shared/ui/app-sidebar.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { PredictionApi } from './prediction-api.service';
import { OfflineExportComponent } from './offline-export.component';
import { ExperimentalForecastComponent } from './experimental-forecast.component';
import { RegressionForecastComponent } from './regression-forecast.component';

@Component({
  selector: 'app-water-forecast',
  standalone: true,
  imports: [
    DatePipe,
    AppSidebarComponent,
    PageHeaderComponent,
    OfflineExportComponent,
    ExperimentalForecastComponent,
    RegressionForecastComponent,
  ],
  templateUrl: './water-forecast.component.html',
  styleUrls: ['./water-forecast.component.css', '../../shared/ui/workspace.css'],
})
export class WaterForecastComponent {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly inventory = inject(DevicesApi);
  private readonly api = inject(PredictionApi);
  private readonly router = inject(Router);
  private request = new Subscription();
  private id = '';
  readonly plot = signal<PlotSummary | null>(null);
  readonly devices = signal<RegisteredDevice[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly selectedId = signal('');
  readonly snapshot = signal<PredictionAvailability | null>(null);
  readonly exportSelection = computed<TelemetrySubscription | null>(() => {
    const data = this.snapshot();
    return data?.device && data.device.id === this.selectedId()
      ? { plotId: data.plotId, deviceId: data.device.id, source: data.source }
      : null;
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly zoneNames = { soil_1: 'Zona A', soil_2: 'Zona B', soil_3: 'Zona C' };
  constructor() {
    const destroy = inject(DestroyRef);
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed(destroy))
      .subscribe((params) => {
        this.reset();
        this.id = params.get('id') ?? '';
        if (this.id) this.loadDevices(0);
      });
    effect(() => {
      if (!this.auth.user()) this.reset();
    });
    destroy.onDestroy(() => this.request.unsubscribe());
  }
  private reset() {
    this.request.unsubscribe();
    this.plot.set(null);
    this.devices.set([]);
    this.total.set(0);
    this.offset.set(0);
    this.selectedId.set('');
    this.snapshot.set(null);
    this.error.set('');
    this.busy.set(false);
  }
  loadDevices(offset = 0) {
    if (!this.id) return;
    this.reset();
    this.busy.set(true);
    this.request = forkJoin({
      plot: this.http.get<PlotSummary>(`/api/v1/plots/${encodeURIComponent(this.id)}`),
      page: this.inventory.list(this.id, offset),
    })
      .pipe(timeout(10000))
      .subscribe({
        next: ({ plot, page }) => {
          if (plot.id !== this.id) {
            this.error.set('La respuesta no coincide con la parcela.');
          } else {
            this.plot.set(plot);
            this.devices.set(page.items);
            this.total.set(page.total);
            this.offset.set(offset);
          }
          this.busy.set(false);
        },
        error: () => {
          this.busy.set(false);
          this.error.set(
            'No se pudo consultar la parcela y sus equipos. Reintenta actualizar equipos.',
          );
        },
      });
  }
  choose(id: string) {
    this.request.unsubscribe();
    this.snapshot.set(null);
    this.error.set('');
    this.selectedId.set(id);
    const device = this.devices().find((item) => item.id === id);
    if (!device || !this.plot()) {
      this.selectedId.set('');
      this.busy.set(false);
      return;
    }
    this.busy.set(true);
    this.request = this.api.get(this.id, device.id, device.source).subscribe({
      next: (value) => {
        this.snapshot.set(value);
        this.busy.set(false);
      },
      error: () => {
        this.busy.set(false);
        this.error.set(
          'No se pudo comprobar la cobertura. El origen debe estar habilitado y el equipo debe seguir perteneciendo a esta parcela. Reintenta sin generar datos.',
        );
      },
    });
  }
  logout() {
    this.reset();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
