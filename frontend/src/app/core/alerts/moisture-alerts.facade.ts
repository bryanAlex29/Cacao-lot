import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { catchError, interval, merge, of, Subject, Subscription, switchMap, timer } from 'rxjs';
import type { Page, SoilMoistureAlert, TelemetrySubscription } from '@cacaosmart/contracts';
import { MoistureAlertsApi } from './moisture-alerts-api.service';
const emptyPage = (): Page<SoilMoistureAlert> => ({ items: [], total: 0, limit: 5, offset: 0 });
@Injectable()
export class MoistureAlertsFacade {
  private readonly api = inject(MoistureAlertsApi);
  private scope = new Subscription();
  private refresh = new Subject<void>();
  private selection: TelemetrySubscription | null = null;
  private offset = 0;
  readonly page = signal(emptyPage());
  readonly busy = signal(false);
  readonly error = signal('');
  readonly writing = signal(false);
  readonly uncertain = signal(false);
  readonly message = signal('');
  readonly checkedAt = signal<string | null>(null);
  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }
  select(selection: TelemetrySubscription | null): void {
    this.stop();
    if (!selection) return;
    const selected = { ...selection };
    this.selection = selected;
    this.refresh = new Subject<void>();
    this.scope.add(
      merge(of(undefined), this.refresh, interval(15000))
        .pipe(
          switchMap(() => {
            this.busy.set(true);
            return timer(100).pipe(
              switchMap(() => this.api.list(selected, this.offset)),
              catchError(() => {
                this.error.set(
                  'No se pudieron consultar las alertas de humedad. No se inventan avisos.',
                );
                this.page.set(emptyPage());
                this.checkedAt.set(null);
                this.busy.set(false);
                return of(null);
              }),
            );
          }),
        )
        .subscribe((page) => {
          if (!page) return;
          this.page.set(page);
          this.error.set('');
          this.busy.set(false);
          this.checkedAt.set(new Date().toISOString());
          if (this.uncertain()) {
            this.uncertain.set(false);
            this.message.set('Estado de reconocimiento consultado de nuevo.');
          }
        }),
    );
  }
  reload(): void {
    if (this.selection) this.refresh.next();
  }
  changePage(offset: number): void {
    if (!this.selection || this.busy() || offset < 0 || offset >= this.page().total) return;
    this.offset = offset;
    this.reload();
  }
  acknowledge(id: string): void {
    const selection = this.selection;
    if (
      !selection ||
      this.busy() ||
      this.writing() ||
      this.uncertain() ||
      this.error() ||
      !this.page().items.some((row) => row.id === id && !row.acknowledgedAt)
    )
      return;
    this.writing.set(true);
    this.message.set('');
    this.scope.add(
      this.api.acknowledge(selection, id).subscribe({
        next: () => {
          this.writing.set(false);
          this.message.set('Alerta reconocida. Esto no significa recuperación de humedad.');
          this.reload();
        },
        error: () => {
          this.writing.set(false);
          this.uncertain.set(true);
          this.message.set(
            'No se confirmó el reconocimiento; puede haberse guardado. Actualiza antes de reintentar.',
          );
        },
      }),
    );
  }
  stop(): void {
    this.scope.unsubscribe();
    this.scope = new Subscription();
    this.selection = null;
    this.offset = 0;
    this.page.set(emptyPage());
    this.busy.set(false);
    this.error.set('');
    this.writing.set(false);
    this.uncertain.set(false);
    this.message.set('');
    this.checkedAt.set(null);
  }
}
