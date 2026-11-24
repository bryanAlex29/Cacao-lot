import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AiDiagnosisApi, Diagnosis } from '../../core/ai-diagnosis/ai-diagnosis-api.service';

@Component({
  selector: 'app-diagnosis-comparison-card',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './diagnosis-comparison-card.component.html',
  styleUrl: './diagnosis-comparison-card.component.css',
})
export class DiagnosisComparisonCardComponent {
  readonly plotId = input.required<string>();
  readonly diagnosisId = input.required<string>();
  readonly label = input.required<string>();
  private readonly api = inject(AiDiagnosisApi);
  private request = new Subscription();
  private expiryTimer?: ReturnType<typeof setTimeout>;
  readonly diagnosis = signal<Diagnosis | null>(null);
  readonly imageUrl = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    effect(() => {
      const id = this.diagnosisId(),
        plotId = this.plotId();
      untracked(() => this.load(id, plotId));
    });
    inject(DestroyRef).onDestroy(() => this.dispose());
  }
  load(id = this.diagnosisId(), plotId = this.plotId()): void {
    this.dispose();
    this.request = new Subscription();
    this.diagnosis.set(null);
    this.error.set('');
    this.busy.set(true);
    this.request.add(
      this.api.get(id, plotId).subscribe({
        next: (record) => {
          if (
            record.id !== id ||
            record.plotId !== plotId ||
            Date.parse(record.expiresAt) <= Date.now()
          ) {
            this.unavailable();
            return;
          }
          this.diagnosis.set(record);
          this.scheduleExpiry(record.expiresAt);
          if (!record.hasImage || record.status === 'pending') {
            this.busy.set(false);
            this.error.set(
              'Esta fotografía no está disponible para comparar. Selecciona otra del historial.',
            );
            return;
          }
          this.request.add(
            this.api.image(id).subscribe({
              next: (image) => {
                if (Date.parse(record.expiresAt) <= Date.now()) {
                  this.unavailable();
                  return;
                }
                this.busy.set(false);
                if (image.type !== 'image/jpeg' || !image.size) {
                  this.error.set('No se recibió una fotografía JPEG privada válida.');
                  return;
                }
                this.imageUrl.set(URL.createObjectURL(image));
              },
              error: () => {
                this.busy.set(false);
                this.error.set(
                  'No se pudo recuperar la fotografía privada. Puede haber vencido, sido eliminada o fallado la conexión.',
                );
              },
            }),
          );
        },
        error: () => this.unavailable(),
      }),
    );
  }
  imageFailed(): void {
    this.releaseImage();
    this.error.set(
      'El navegador no pudo mostrar esta fotografía. Puedes actualizarla o elegir otra.',
    );
  }
  private unavailable(): void {
    this.dispose();
    this.diagnosis.set(null);
    this.busy.set(false);
    this.error.set(
      'Diagnóstico no disponible: pudo vencer, eliminarse o perderse el acceso. No se muestra una copia anterior.',
    );
  }
  private scheduleExpiry(expiresAt: string): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) {
      this.unavailable();
      return;
    }
    this.expiryTimer = setTimeout(
      () => this.scheduleExpiry(expiresAt),
      Math.min(remaining, 2147483647),
    );
  }
  private releaseImage(): void {
    const url = this.imageUrl();
    if (url) URL.revokeObjectURL(url);
    this.imageUrl.set(null);
  }
  private dispose(): void {
    this.request.unsubscribe();
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = undefined;
    this.releaseImage();
  }
}
