import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, Subscription, timeout } from 'rxjs';
import type { PlotSummary } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import {
  AiDiagnosisApi,
  Diagnosis,
  DiagnosisOptions,
  DiagnosisHistoryFilters,
} from '../../core/ai-diagnosis/ai-diagnosis-api.service';
import { historyPeriodFromLocal } from '../../core/telemetry/history-period';
import { DiagnosisComparisonCardComponent } from './diagnosis-comparison-card.component';
import { AppSidebarComponent } from '../../shared/ui/app-sidebar.component';
import { IconComponent } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';

@Component({
  selector: 'app-ai-diagnosis',
  standalone: true,
  imports: [
    AppSidebarComponent,
    IconComponent,
    PageHeaderComponent,
    DatePipe,
    ReactiveFormsModule,
    DiagnosisComparisonCardComponent,
  ],
  templateUrl: './ai-diagnosis.component.html',
  styleUrls: ['./ai-diagnosis.component.css', '../../shared/ui/workspace.css'],
})
export class AiDiagnosisComponent {
  private readonly api = inject(AiDiagnosisApi);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private requests = new Subscription();
  private historyRequest = new Subscription();
  private imageRequest = new Subscription();
  private detailRequest = new Subscription();
  private uploadRequest = new Subscription();
  private currentFile: File | null = null;
  private attempt: { file: File; notes: string; requestId: string; retentionDays: number } | null =
    null;
  readonly plot = signal<PlotSummary | null>(null);
  readonly options = signal<DiagnosisOptions | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly historyError = signal('');
  readonly imageError = signal('');
  readonly preview = signal<string | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly selected = signal<Diagnosis | null>(null);
  readonly history = signal<Diagnosis[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly historyBusy = signal(false);
  readonly historyFilters = signal<DiagnosisHistoryFilters>({});
  readonly filterError = signal('');
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly historyForm = inject(FormBuilder).nonNullable.group({
    from: [''],
    to: [''],
    status: [''],
  });
  readonly deleting = signal(false);
  readonly deleteTarget = signal<Diagnosis | null>(null);
  readonly comparisonIds = signal<string[]>([]);
  readonly notes = new FormControl('', { nonNullable: true });
  readonly consent = new FormControl(false, { nonNullable: true });

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed(this.destroy))
      .subscribe((params) => {
        this.reset();
        const id = params.get('plotId');
        if (!id) {
          this.error.set('Elige una parcela desde Mis parcelas para comenzar.');
          return;
        }
        this.loading.set(true);
        this.requests.add(
          forkJoin({
            plot: this.http.get<PlotSummary>(`/api/v1/plots/${encodeURIComponent(id)}`),
            options: this.api.options(),
          })
            .pipe(timeout(8000))
            .subscribe({
              next: ({ plot, options }) => {
                this.loading.set(false);
                if (
                  plot.id !== id ||
                  !options ||
                  !(
                    (options.provider === 'openai' && options.consentVersion === 'openai-v1') ||
                    ((options.provider === 'mock' || options.provider === 'disabled') &&
                      options.consentVersion === 'demo-v1')
                  ) ||
                  options.maxImageBytes < 1 ||
                  options.maxImageBytes > 8 * 1024 * 1024 ||
                  (options.dailyLimit !== null &&
                    (!Number.isInteger(options.dailyLimit) ||
                      options.dailyLimit < 1 ||
                      options.dailyLimit > 100)) ||
                  options.retentionDays < 1 ||
                  options.retentionDays > 30
                ) {
                  this.error.set('Configuración de diagnóstico incompatible.');
                  return;
                }
                this.plot.set(plot);
                this.options.set(options);
                if (options.provider !== 'disabled') this.loadHistory(0);
              },
              error: () => {
                this.loading.set(false);
                this.error.set(
                  'No se pudo abrir el diagnóstico de esta parcela. Vuelve a Mis parcelas y reintenta.',
                );
              },
            }),
        );
      });
    effect(() => {
      if (!this.auth.user()) this.reset();
    });
    this.destroy.onDestroy(() => this.reset());
  }
  logout(): void {
    this.reset();
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
  selectFile(event: Event): void {
    if (this.busy() || this.uncertain()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.clearUpload();
    this.error.set('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size === 0 ||
      file.size > (this.options()?.maxImageBytes ?? 0)
    ) {
      this.error.set('Selecciona JPEG, PNG o WebP, no vacío y dentro del tamaño permitido.');
      return;
    }
    this.currentFile = file;
    this.preview.set(URL.createObjectURL(file));
  }
  submit(): void {
    const plot = this.plot();
    if (
      this.busy() ||
      !plot ||
      !this.currentFile ||
      !this.consent.value ||
      this.notes.value.length > 1000 ||
      !['mock', 'openai'].includes(this.options()?.provider ?? '')
    ) {
      if (!this.busy())
        this.error.set('Selecciona una foto, revisa las notas y marca el consentimiento.');
      return;
    }
    this.attempt ??= {
      file: this.currentFile,
      notes: this.notes.value,
      requestId: crypto.randomUUID(),
      retentionDays: this.options()!.retentionDays,
    };
    this.busy.set(true);
    this.error.set('');
    this.notes.disable();
    this.consent.disable();
    this.uploadRequest = this.api
      .create(
        plot.id,
        this.attempt.file,
        this.attempt.notes,
        this.attempt.requestId,
        this.attempt.retentionDays,
        this.options()!.consentVersion,
      )
      .subscribe({
        next: (record) => {
          this.busy.set(false);
          this.uncertain.set(false);
          this.clearUpload();
          this.open(record);
          this.loadHistory(0);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.uncertain.set(true);
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          this.error.set(
            status === 429
              ? 'Límite de solicitudes o cuota diaria alcanzada. Consulta el historial antes de reintentar.'
              : status === 400 || status === 413
                ? 'La imagen o los campos no son válidos. Puedes descartar este intento y elegir otra foto.'
                : status === 403 || status === 404
                  ? 'La parcela ya no está disponible para esta cuenta.'
                  : 'No se confirmó la solicitud. Consulta el historial; reintentar usa la misma clave y no duplica el análisis.',
          );
          this.loadHistory(0);
        },
      });
  }
  clearUpload(): void {
    if (this.busy()) return;
    const url = this.preview();
    if (url) URL.revokeObjectURL(url);
    this.preview.set(null);
    this.currentFile = null;
    this.attempt = null;
    this.uncertain.set(false);
    this.notes.enable();
    this.notes.reset();
    this.consent.enable();
    this.consent.reset();
  }
  applyHistoryFilters(): void {
    if (this.deleting()) return;
    const { from, to, status } = this.historyForm.getRawValue();
    const period = from || to ? historyPeriodFromLocal(from, to) : null;
    if ((from || to) && !period) {
      this.filterError.set('Indica Desde y Hasta válidos y ordenados, con un máximo de 31 días.');
      return;
    }
    if (status && !['pending', 'completed', 'failed'].includes(status)) {
      this.filterError.set('Selecciona un estado válido.');
      return;
    }
    this.filterError.set('');
    this.deleteTarget.set(null);
    this.historyFilters.set({
      ...(period ?? {}),
      ...(status ? { status: status as Diagnosis['status'] } : {}),
    });
    this.loadHistory(0);
  }
  clearHistoryFilters(): void {
    if (this.deleting()) return;
    this.historyForm.reset();
    this.historyFilters.set({});
    this.filterError.set('');
    this.deleteTarget.set(null);
    this.loadHistory(0);
  }
  loadHistory(offset: number): void {
    if (!this.plot() || !Number.isInteger(offset) || offset < 0) return;
    this.historyRequest.unsubscribe();
    this.historyBusy.set(true);
    this.historyError.set('');
    this.history.set([]);
    this.offset.set(offset);
    this.historyRequest = this.api.list(this.plot()!.id, offset, this.historyFilters()).subscribe({
      next: (page) => {
        this.history.set(page.items);
        this.total.set(page.total);
        this.historyBusy.set(false);
      },
      error: () => {
        this.total.set(0);
        this.historyBusy.set(false);
        this.historyError.set(
          'No se pudo consultar el historial. Puedes actualizarlo sin reenviar fotos.',
        );
      },
    });
  }
  open(record: Diagnosis): void {
    this.detailRequest.unsubscribe();
    this.clearImage();
    this.selected.set(record);
    if (record.hasImage) {
      this.imageRequest = this.api.image(record.id).subscribe({
        next: (blob) => this.imageUrl.set(URL.createObjectURL(blob)),
        error: () =>
          this.imageError.set(
            'No se pudo recuperar la imagen privada. El resultado sigue disponible.',
          ),
      });
    }
  }
  refreshSelected(): void {
    const record = this.selected(),
      plot = this.plot();
    if (!record || !plot) return;
    this.detailRequest.unsubscribe();
    this.detailRequest = this.api.get(record.id, plot.id).subscribe({
      next: (next) => {
        this.open(next);
        this.loadHistory(this.offset());
      },
      error: () => {
        this.clearImage();
        this.selected.set(null);
        this.error.set('El análisis ya no está disponible o no se pudo consultar.');
      },
    });
  }
  remove(): void {
    const record = this.deleteTarget();
    if (!record || this.deleting()) return;
    this.removeComparison(record.id);
    this.deleting.set(true);
    if (this.selected()?.id === record.id) {
      this.detailRequest.unsubscribe();
      this.selected.set(null);
      this.clearImage();
    }
    this.requests.add(
      this.api.remove(record.id).subscribe({
        next: () => {
          this.deleting.set(false);
          this.deleteTarget.set(null);
          if (this.selected()?.id === record.id) {
            this.selected.set(null);
            this.clearImage();
          }
          this.loadHistory(0);
        },
        error: () => {
          this.deleting.set(false);
          this.deleteTarget.set(null);
          this.error.set(
            'No se confirmó la eliminación. Actualiza el historial antes de volver a intentarlo.',
          );
          this.loadHistory(0);
        },
      }),
    );
  }
  toggleComparison(record: Diagnosis): void {
    if (this.deleting() || record.plotId !== this.plot()?.id) return;
    if (this.comparisonIds().includes(record.id)) {
      this.removeComparison(record.id);
      return;
    }
    if (this.comparisonIds().length >= 2 || !record.hasImage || record.status === 'pending') return;
    this.comparisonIds.update((ids) => [...ids, record.id]);
  }
  removeComparison(id: string): void {
    this.comparisonIds.update((ids) => ids.filter((selected) => selected !== id));
  }
  swapComparison(): void {
    if (this.comparisonIds().length === 2) this.comparisonIds.update((ids) => [...ids].reverse());
  }
  private clearImage(): void {
    this.imageRequest.unsubscribe();
    if (this.imageUrl()) URL.revokeObjectURL(this.imageUrl()!);
    this.imageUrl.set(null);
    this.imageError.set('');
  }
  private reset(): void {
    this.requests.unsubscribe();
    this.requests = new Subscription();
    this.historyRequest.unsubscribe();
    this.uploadRequest.unsubscribe();
    this.detailRequest.unsubscribe();
    this.busy.set(false);
    this.clearUpload();
    this.clearImage();
    this.selected.set(null);
    this.deleteTarget.set(null);
    this.comparisonIds.set([]);
    this.deleting.set(false);
    this.history.set([]);
    this.total.set(0);
    this.offset.set(0);
    this.plot.set(null);
    this.options.set(null);
    this.loading.set(false);
    this.historyBusy.set(false);
    this.historyForm.reset();
    this.historyFilters.set({});
    this.filterError.set('');
    this.error.set('');
    this.historyError.set('');
  }
}
