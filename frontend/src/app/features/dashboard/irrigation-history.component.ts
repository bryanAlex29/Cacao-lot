import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import type { ObservedIrrigationEvent, Page, TelemetrySubscription } from '@cacaosmart/contracts';
import { IrrigationApi } from '../../core/irrigation/irrigation-api.service';

const emptyPage = (): Page<ObservedIrrigationEvent> => ({
  items: [],
  total: 0,
  limit: 10,
  offset: 0,
});

@Component({
  selector: 'app-irrigation-history',
  standalone: true,
  imports: [DatePipe],
  template: `<section
    tabindex="-1"
    id="irrigation-history"
    aria-labelledby="irrigation-history-title"
    [attr.aria-busy]="busy()"
  >
    <h2 id="irrigation-history-title">Historial del riego observado</h2>
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
      <div class="controls">
        @for (value of [1, 7, 30]; track value) {
          <button type="button" [attr.aria-pressed]="days() === value" (click)="setDays(value)">
            {{ value === 1 ? '24 h' : value + ' días' }}
          </button>
        }
        <button type="button" [disabled]="busy()" (click)="refresh()">
          Consultar / actualizar historial
        </button>
      </div>
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
        <div class="controls">
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
    <p>
      Sin dato no significa cierre. Mensajes atrasados pueden cambiar la comparación histórica. No
      se conoce el instante físico exacto de la maniobra.
    </p>
  </section>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
        margin-top: 16px;
      }
      section {
        background: white;
        border: 1px solid #e2e7e2;
        border-radius: 16px;
        padding: 16px;
      }
      h2 {
        color: #174b2d;
        font-size: 20px;
      }
      p,
      table,
      .controls {
        font-size: 12px;
        line-height: 1.6;
      }
      p {
        color: #526158;
      }
      .controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      button {
        background: white;
        border: 1px solid #a9c7ae;
        color: #17632e;
        border-radius: 8px;
        padding: 8px;
        min-height: 36px;
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
      .table-scroll:focus-visible {
        outline: 3px solid #1263bd;
        outline-offset: 2px;
      }
      .table-scroll {
        overflow-x: auto;
        margin: 12px 0;
      }
      table {
        width: 100%;
        min-width: 620px;
        border-collapse: collapse;
        text-align: left;
      }
      th,
      td {
        padding: 10px;
        border-bottom: 1px solid #e2e7e2;
        vertical-align: top;
      }
      small {
        display: block;
        color: #526158;
      }
      .demo {
        background: #dceff7;
        color: #114f70;
        padding: 8px;
      }
    `,
  ],
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
  readonly busy = signal(false);
  readonly error = signal('');
  readonly checkedAt = signal<string | null>(null);
  readonly page = signal(emptyPage());

  constructor() {
    effect(() => {
      this.selection();
      this.reset();
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
    this.activated = false;
    this.request.unsubscribe();
    this.page.set(emptyPage());
    this.busy.set(false);
    this.error.set('');
    this.checkedAt.set(null);
  }
  setDays(days: number): void {
    if (![1, 7, 30].includes(days)) return;
    this.days.set(days);
    this.refresh();
  }
  refresh(): void {
    this.to = new Date().toISOString();
    this.from = new Date(Date.parse(this.to) - this.days() * 86400000).toISOString();
    this.load(0);
  }
  load(offset: number): void {
    const selection = this.selection();
    if (!selection || offset < 0) return;
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
