import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { ObservedIrrigationEvent, Page, TelemetrySubscription } from '@cacaosmart/contracts';
import { IrrigationApi } from '../../core/irrigation/irrigation-api.service';
import { IconComponent } from '../../shared/ui/icon.component';
import {
  HistoryPeriod,
  historyPeriodFromLocal,
  localDateTime,
} from '../../core/telemetry/history-period';

const emptyPage = (): Page<ObservedIrrigationEvent> => ({
  items: [],
  total: 0,
  limit: 10,
  offset: 0,
});

@Component({
  selector: 'app-irrigation-history',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, IconComponent],
  template: `<section
    tabindex="-1"
    id="irrigation-history"
    class="data-panel"
    aria-labelledby="irrigation-history-title"
    [attr.aria-busy]="busy()"
  >
    <h2 id="irrigation-history-title"><app-icon name="tap" /> Historial del riego observado</h2>
    <p>
      Compara estados informados por el dispositivo. No acredita flujo, sesiones ni duración de
      riego.
    </p>
    @if (selection()?.source === 'demo') {
      <p class="demo">DEMO · Datos simulados</p>
    }
    @if (!selection()) {
      <p>Selecciona un dispositivo.</p>
    } @else {
      <div class="filter-bar">
        <div class="period-presets" role="group" aria-label="Periodo del riego observado">
          @for (value of [1, 7, 30]; track value) {
            <button
              type="button"
              [attr.aria-pressed]="!period() && days() === value"
              (click)="setDays(value)"
            >
              {{ value === 1 ? '24 h' : value + ' días' }}
            </button>
          }
          <button type="button" [disabled]="busy()" (click)="refresh()">
            Consultar / actualizar historial
          </button>
        </div>
        <form
          [formGroup]="form"
          (ngSubmit)="applyDates()"
          aria-label="Fechas del riego observado"
          novalidate
        >
          <div class="filter-fields">
            <label
              >Desde del riego (hora local)<input
                type="datetime-local"
                step="1"
                formControlName="from"
                required
            /></label>
            <label
              >Hasta del riego (hora local)<input
                type="datetime-local"
                step="1"
                formControlName="to"
                required
            /></label>
          </div>
          <div class="filter-actions">
            <button class="primary" type="submit">Aplicar fechas al riego</button>
          </div>
        </form>
        @if (periodError()) {
          <p role="alert">{{ periodError() }}</p>
        }
      </div>
      <p class="period-status" role="status">
        @if (period(); as selected) {
          Periodo fijo: {{ selected.from | date: 'dd/MM/yyyy HH:mm:ss' }} —
          {{ selected.to | date: 'dd/MM/yyyy HH:mm:ss' }}.
        } @else {
          Periodo móvil: {{ days() === 1 ? 'últimas 24 h' : 'últimos ' + days() + ' días' }}.
        }
        Hora local del navegador ({{ timezone }}). Máximo 31 días. Solo filtra el riego observado;
        gráfico y reportes tienen filtros independientes.
      </p>
      @if (busy()) {
        <p role="status">Consultando historial…</p>
      } @else if (error()) {
        <p role="alert">
          {{ error() }} <button type="button" (click)="refresh()">Reintentar</button>
        </p>
      } @else if (!checkedAt()) {
        <p>Pulsa consultar para cargar los cambios del periodo.</p>
      } @else if (!page().items.length) {
        <p>Sin cambios observados en este periodo. Esto no confirma ausencia de riego.</p>
      }
      @if (checkedAt()) {
        <p>
          Consultado {{ checkedAt() | date: 'dd/MM/yyyy HH:mm:ss' }} · hora local del navegador.
          Tras consultar, se refresca por REST al recibir cambios de riego o reconectar el canal.
        </p>
      }
      @if (page().items.length) {
        <div
          class="table-scroll"
          tabindex="0"
          role="region"
          aria-label="Estados observados del riego"
        >
          <table>
            <caption>
              Estados informados por el dispositivo · hora local
            </caption>
            <thead>
              <tr>
                <th>Observación (hora local)</th>
                <th>Relé informado</th>
                <th>Confirmación física</th>
                <th>Evidencia</th>
              </tr>
            </thead>
            <tbody>
              @for (item of page().items; track item.id) {
                <tr [attr.data-event-id]="item.eventId">
                  <td>
                    {{ item.observedAt | date: 'dd/MM/yyyy HH:mm:ss'
                    }}<small>{{
                      item.timestampOrigin === 'server'
                        ? 'Hora de recepción'
                        : 'Hora del dispositivo'
                    }}</small>
                  </td>
                  <td>
                    {{ relay(item.valve.relayCommandedOpen)
                    }}<small
                      >Anterior:
                      {{
                        item.previousValve
                          ? relay(item.previousValve.relayCommandedOpen)
                          : 'Sin observación previa'
                      }}</small
                    >
                  </td>
                  <td>
                    {{ feedback(item.valve.feedbackOpen)
                    }}<small
                      >Anterior:
                      {{
                        item.previousValve
                          ? feedback(item.previousValve.feedbackOpen)
                          : 'Sin observación previa'
                      }}</small
                    >
                  </td>
                  <td>
                    {{ item.kind === 'initial' ? 'Primera observación' : 'Cambio observado'
                    }}<small>Recibido {{ item.receivedAt | date: 'dd/MM/yyyy HH:mm:ss' }}</small>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
      @if (checkedAt()) {
        <div class="pagination">
          <button
            type="button"
            [disabled]="busy() || page().offset === 0"
            (click)="load(page().offset - 10)"
          >
            Más recientes
          </button>
          <span>{{ page().total }} registros · página {{ page().offset / 10 + 1 }}</span>
          <button
            type="button"
            [disabled]="busy() || page().offset + 10 >= page().total"
            (click)="load(page().offset + 10)"
          >
            Más antiguos
          </button>
        </div>
      }
    }
    <details class="panel-help">
      <summary>Cómo interpretar el riego observado</summary>
      <p>
        Sin dato no significa cierre. Mensajes atrasados pueden cambiar la comparación histórica. No
        se conoce el instante físico exacto de la maniobra.
      </p>
    </details>
  </section>`,
  styleUrl: '../../shared/ui/data-panel.css',
})
export class IrrigationHistoryComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  readonly refreshRevision = input(0);
  private activated = false;
  private readonly api = inject(IrrigationApi);
  private request = new Subscription();
  private from = '';
  private to = '';
  readonly days = signal(1);
  readonly period = signal<HistoryPeriod | null>(null);
  readonly periodError = signal('');
  readonly timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ['', Validators.required],
    to: ['', Validators.required],
  });
  readonly busy = signal(false);
  readonly error = signal('');
  readonly checkedAt = signal<string | null>(null);
  readonly page = signal(emptyPage());

  constructor() {
    effect(() => {
      this.selection();
      untracked(() => this.reset());
    });
    effect(() => {
      this.refreshRevision();
      untracked(() => {
        if (this.activated && this.selection()) this.refresh();
      });
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }

  private reset(): void {
    this.days.set(1);
    this.period.set(null);
    this.periodError.set('');
    this.fillDates(1);
    this.from = '';
    this.to = '';
    this.activated = false;
    this.request.unsubscribe();
    this.page.set(emptyPage());
    this.busy.set(false);
    this.error.set('');
    this.checkedAt.set(null);
  }
  setDays(days: number): void {
    if (!this.selection() || ![1, 7, 30].includes(days)) return;
    this.days.set(days);
    this.period.set(null);
    this.periodError.set('');
    this.fillDates(days);
    this.refresh();
  }
  private fillDates(days: number): void {
    const end = new Date(Math.ceil(Date.now() / 1000) * 1000);
    this.form.setValue({
      from: localDateTime(new Date(end.getTime() - days * 86400000)),
      to: localDateTime(end),
    });
  }
  applyDates(): void {
    if (!this.selection()) return;
    const { from, to } = this.form.getRawValue();
    const period = historyPeriodFromLocal(from, to);
    if (this.form.invalid || !period) {
      this.periodError.set('Indica fechas válidas, ordenadas y un periodo de máximo 31 días.');
      return;
    }
    this.periodError.set('');
    this.period.set(period);
    this.refresh();
  }
  refresh(): void {
    if (!this.selection()) return;
    const period = this.period();
    this.to = period?.to ?? new Date().toISOString();
    this.from =
      period?.from ?? new Date(Date.parse(this.to) - this.days() * 86400000).toISOString();
    this.load(0);
  }
  load(offset: number): void {
    const selection = this.selection();
    if (!selection || offset < 0 || !this.from || !this.to) return;
    this.activated = true;
    this.request.unsubscribe();
    this.busy.set(true);
    this.error.set('');
    this.page.set(emptyPage());
    this.checkedAt.set(null);
    this.request = this.api.list(selection, this.from, this.to, offset).subscribe({
      next: (page) => {
        this.page.set(page);
        this.busy.set(false);
        this.checkedAt.set(new Date().toISOString());
      },
      error: () => {
        this.busy.set(false);
        this.error.set('No se pudo consultar el historial. No se muestran datos de ejemplo.');
      },
    });
  }
  relay(value: boolean | null): string {
    return value === null ? 'Sin dato' : value ? 'Orden de apertura' : 'Orden de cierre';
  }
  feedback(value: boolean | null): string {
    return value === null
      ? 'Sin confirmación'
      : value
        ? 'Abierta según dispositivo'
        : 'Cerrada según dispositivo';
  }
}
