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
  template: ` <div class="quick" aria-label="Intervalo histórico">
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
      <div class="fields">
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
      <button type="submit" [disabled]="!selection()">Aplicar fechas al historial</button>
    </form>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    <p class="note" role="status">
      @if (period(); as selected) {
        Periodo fijo: {{ selected.from | date: 'dd/MM/yyyy HH:mm:ss' }} —
        {{ selected.to | date: 'dd/MM/yyyy HH:mm:ss' }}.
      } @else {
        Periodo móvil: {{ days() === 1 ? 'últimas 24 h' : 'últimos ' + days() + ' días' }}.
      }
      Hora local del navegador ({{ timezone }}). Máximo 31 días. Solo filtra el gráfico y su tabla;
      las tarjetas muestran la última medición. Reportes y riego tienen filtros independientes.
    </p>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        margin-bottom: 16px;
      }
      .quick {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      label {
        font-size: 12px;
        font-weight: bold;
        min-width: 0;
      }
      input {
        display: block;
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
        min-height: 44px;
        margin: 6px 0 12px;
        padding: 8px;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
      }
      button {
        min-height: 40px;
        padding: 8px 12px;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        color: #17632e;
        background: white;
        cursor: pointer;
      }
      button[aria-pressed='true'] {
        background: #e8f7e6;
        font-weight: bold;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      button:focus-visible,
      input:focus-visible {
        outline: 3px solid #1263bd;
        outline-offset: 2px;
      }
      p {
        font-size: 12px;
        line-height: 1.6;
      }
      .note {
        color: #526158;
      }
      [role='alert'] {
        color: #8b2020;
      }
      @media (max-width: 620px) {
        .fields {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
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
