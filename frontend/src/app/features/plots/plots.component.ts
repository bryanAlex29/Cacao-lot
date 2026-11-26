import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map, timeout } from 'rxjs';
import { checkedPlot, checkedPlotPage } from '../../core/plots/plot-response';
import type { Page, PlotSummary } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { DeviceInventoryComponent } from './device-inventory.component';
import { PlotManagementComponent } from './plot-management.component';
import { AppSidebarComponent } from '../../shared/ui/app-sidebar.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-plots',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DecimalPipe,
    RouterLink,
    DeviceInventoryComponent,
    PlotManagementComponent,
    AppSidebarComponent,
    PageHeaderComponent,
    IconComponent,
  ],
  templateUrl: './plots.component.html',
  styleUrls: ['./plots.component.css', '../../shared/ui/workspace.css'],
})
export class PlotsComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly canCreate = computed(() => {
    const role = this.auth.user()?.role;
    return role === 'ADMIN' || role === 'FARMER';
  });
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly plots = signal<PlotSummary[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly uncertainCreate = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly inventoryPlotId = signal<string | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)]],
    locationLabel: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(200)]],
    areaM2: new FormControl<number | null>(null, [Validators.min(0.000001)]),
  });

  constructor() {
    effect(() => {
      if (!this.auth.user()) {
        this.plots.set([]);
        void this.router.navigateByUrl('/login');
      }
    });
  }

  ngOnInit(): void {
    this.load(0);
  }

  load(offset: number): void {
    if (this.busy() || this.saving()) return;
    this.inventoryPlotId.set(null);
    this.busy.set(true);
    this.error.set('');
    this.http
      .get<Page<PlotSummary>>('/api/v1/plots', { params: { limit: 20, offset } })
      .pipe(
        timeout(10000),
        map((page) => checkedPlotPage(page, offset)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (page) => {
          this.plots.set(page.items);
          this.total.set(page.total);
          this.offset.set(page.offset);
          this.uncertainCreate.set(false);
          this.busy.set(false);
        },
        error: () => {
          this.plots.set([]);
          this.total.set(0);
          this.error.set('No se pudieron consultar tus parcelas. Puedes volver a intentarlo.');
          this.busy.set(false);
        },
      });
  }

  create(): void {
    if (this.saving() || this.busy() || this.uncertainCreate() || !this.canCreate()) return;
    this.message.set('');
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const locationLabel = value.locationLabel.trim();
    if (!name || !locationLabel || (value.areaM2 !== null && !Number.isFinite(value.areaM2))) {
      this.error.set('Nombre y ubicación son obligatorios.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const areaM2 = value.areaM2;
    this.http
      .post<PlotSummary>('/api/v1/plots', { name, locationLabel, areaM2 })
      .pipe(
        timeout(10000),
        map((response) => checkedPlot(response)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.form.reset();
          this.saving.set(false);
          this.message.set('Parcela creada. No contiene dispositivos ni mediciones todavía.');
          this.load(0);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const rejected =
            error instanceof HttpErrorResponse &&
            [400, 401, 403, 404, 409, 413, 429].includes(error.status);
          this.uncertainCreate.set(!rejected);
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 400
              ? 'Revisa los campos de la parcela y su superficie.'
              : rejected
                ? 'La creación fue rechazada. Revisa los datos, permisos o límite de solicitudes.'
                : 'No se confirmó la creación. No vuelvas a enviarla todavía: actualiza la lista y comprueba si la parcela ya aparece.',
          );
        },
      });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
