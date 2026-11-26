import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { OfflineExportApi, validOfflineDates } from './offline-export-api.service';
import { OfflineJsonDownload } from './offline-json-download.service';

@Component({
  selector: 'app-offline-export',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './offline-export.component.html',
  styleUrl: './offline-export.component.css',
})
export class OfflineExportComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  private readonly api = inject(OfflineExportApi);
  private readonly files = inject(OfflineJsonDownload);
  private request = new Subscription();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ['', Validators.required],
    trainUntil: ['', Validators.required],
    validationUntil: ['', Validators.required],
    toExclusive: ['', Validators.required],
  });
  constructor() {
    effect(() => {
      this.selection();
      untracked(() => {
        this.request.unsubscribe();
        this.form.reset();
        this.busy.set(false);
        this.error.set('');
        this.message.set('');
      });
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }
  download(): void {
    const selection = this.selection();
    if (!selection || this.busy()) return;
    this.error.set('');
    this.message.set('');
    this.form.markAllAsTouched();
    const dates = this.form.getRawValue();
    if (this.form.invalid || !validOfflineDates(dates)) {
      this.error.set(
        'Indica días UTC válidos: Desde < Fin de entrenamiento < Fin de validación < Hasta exclusivo. Solo días completos, máximo 366 días.',
      );
      return;
    }
    this.busy.set(true);
    this.request = this.api.download(selection, dates).subscribe({
      next: ({ blob, count }) => {
        const current = this.selection();
        if (
          !current ||
          current.plotId !== selection.plotId ||
          current.deviceId !== selection.deviceId ||
          current.source !== selection.source
        )
          return;
        try {
          this.files.save(
            blob,
            `cacaosmart-offline-${selection.source}-${selection.deviceId}-${dates.from}-${dates.toExclusive}.json`,
          );
          this.message.set(
            count === 0
              ? 'Archivo vacío preparado: 0 observaciones. No hay datos en el periodo; no permite evaluar un modelo.'
              : `Archivo preparado: ${count} observaciones de suelo, incluidos retardos. Revisa las descargas; este archivo no acredita datos suficientes ni un modelo válido.`,
          );
        } catch {
          this.error.set('El navegador no pudo iniciar la descarga. Inténtalo de nuevo.');
        }
        this.busy.set(false);
      },
      error: (error: unknown) => {
        this.busy.set(false);
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        this.error.set(
          status === 413
            ? 'La exportación supera 100000 filas o 16 MB. No se descargó un archivo parcial. Reduce el periodo; una serie muy densa puede requerir otra estrategia de exportación.'
            : status === 401
              ? 'La sesión no está disponible. Vuelve a iniciar sesión antes de descargar.'
              : status === 403 || status === 404
                ? 'No se puede exportar esta selección. Comprueba los permisos, el equipo y que el origen esté habilitado.'
                : status === 400
                  ? 'El servidor rechazó las fechas o cortes. Revisa los días UTC y vuelve a intentarlo.'
                  : 'No se pudo descargar un archivo compatible. Revisa la conexión y vuelve a intentarlo; no se reintentó automáticamente.',
        );
      },
    });
  }
}
