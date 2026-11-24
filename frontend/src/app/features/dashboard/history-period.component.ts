import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import {
  HistoryPeriod,
  historyPeriodFromLocal,
  localDateTime,
} from '../../core/telemetry/history-period';

@Component({
  selector: 'app-history-period',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  template: `<div class="filter-bar">
      <div class="period-presets" role="group" aria-label="Intervalo histórico">
        @for (value of [1, 7, 30]; track value) {
          <button
            type="button"
            [attr.aria-pressed]="!period() && days() === value"
            [disabled]="!selection()"
            (click)="chooseDays(value)"
          >
            {{ value === 1 ? '24 h' : value + ' días' }}
          </button>
        }
      </div>
      <form [formGroup]="form" (ngSubmit)="apply()" aria-label="Fechas del historial" novalidate>
        <div class="filter-fields">
          <label
            >Desde del historial (hora local)<input
              type="datetime-local"
              step="1"
              formControlName="from"
              required
          /></label>
          <label
            >Hasta del historial (hora local)<input
              type="datetime-local"
              step="1"
              formControlName="to"
              required
          /></label>
        </div>
        <div class="filter-actions">
          <button class="primary" type="submit" [disabled]="!selection()">
            Aplicar fechas al historial
          </button>
        </div>
      </form>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </div>
    <p class="period-status" role="status">
      @if (period(); as selected) {
        Periodo fijo: {{ selected.from | date: 'dd/MM/yyyy HH:mm:ss' }} —
        {{ selected.to | date: 'dd/MM/yyyy HH:mm:ss' }}.
      } @else {
        Periodo móvil: {{ days() === 1 ? 'últimas 24 h' : 'últimos ' + days() + ' días' }}.
      }
      Hora local del navegador ({{ timezone }}). Máximo 31 días. Solo filtra el gráfico y su tabla;
      las tarjetas muestran la última medición. Reportes y riego tienen filtros independientes.
    </p>`,
  styleUrl: '../../shared/ui/data-panel.css',
})
export class HistoryPeriodComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  readonly days = input(1);
  readonly period = input<HistoryPeriod | null>(null);
  readonly preset = output<number>();
  readonly custom = output<HistoryPeriod>();
  readonly error = signal('');
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ['', Validators.required],
    to: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      this.selection();
      const period = this.period(),
        days = this.days();
      untracked(() => {
        const end = period ? new Date(period.to) : new Date(Math.ceil(Date.now() / 1000) * 1000);
        const start = period ? new Date(period.from) : new Date(end.getTime() - days * 86400000);
        this.form.setValue({ from: localDateTime(start), to: localDateTime(end) });
        this.error.set('');
      });
    });
  }
  apply(): void {
    if (!this.selection()) return;
    const { from, to } = this.form.getRawValue();
    const period = historyPeriodFromLocal(from, to);
    if (this.form.invalid || !period) {
      this.error.set('Indica fechas válidas, ordenadas y un periodo de máximo 31 días.');
      return;
    }
    this.error.set('');
    this.custom.emit(period);
  }
  chooseDays(days: number): void {
    if (!this.selection() || ![1, 7, 30].includes(days)) return;
    const end = new Date(Math.ceil(Date.now() / 1000) * 1000);
    this.form.setValue({
      from: localDateTime(new Date(end.getTime() - days * 86400000)),
      to: localDateTime(end),
    });
    this.error.set('');
    this.preset.emit(days);
  }
}
