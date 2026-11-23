import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import type { TelemetrySubscription } from '@cacaosmart/contracts';
import { ReportsApi, ReportKind } from '../../core/reports/reports-api.service';
import { CsvDownload } from '../../core/reports/csv-download.service';

function localInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

@Component({
  selector: 'app-reports-panel',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `<section
    id="reports"
    tabindex="-1"
    aria-labelledby="reports-title"
    [attr.aria-busy]="busy()"
  >
    <h2 id="reports-title">Reportes CSV</h2>
    <p>
      Exporta únicamente el dispositivo y origen seleccionados. Máximo 31 días y 10000 registros;
      reduce el periodo si se supera el límite.
    </p>
    @if (selection()?.source === 'demo') {
      <p class="demo">DEMO · El archivo contiene datos simulados</p>
    }
    @if (!selection()) {
      <p>Selecciona un dispositivo para exportar sus datos.</p>
    } @else {
      <div class="quick" aria-label="Periodo de reportes">
        @for (days of [1, 7, 30]; track days) {
          <button type="button" [disabled]="busy()" (click)="setDays(days)">
            {{ days === 1 ? '24 h' : days + ' días' }}
          </button>
        }
      </div>
      <form [formGroup]="form" (ngSubmit)="download('readings')">
        <div class="fields">
          <label
            >Desde (hora local)<input
              type="datetime-local"
              step="1"
              formControlName="from"
              required
          /></label>
          <label
            >Hasta (hora local)<input type="datetime-local" step="1" formControlName="to" required
          /></label>
        </div>
        <div class="quick">
          <button type="submit" [disabled]="busy()">Descargar lecturas CSV</button>
          <button type="button" [disabled]="busy()" (click)="download('irrigation-events')">
            Descargar riego observado CSV
          </button>
        </div>
      </form>
    }
    @if (busy()) {
      <p role="status">Preparando archivo…</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
    <p>
      Las fechas del archivo se expresan en UTC. null significa dato ausente, no cero ni cierre. La
      calidad se conserva; no acredita calibración, duración ni volumen de riego. Un periodo vacío
      descarga solo encabezados.
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
      p {
        font-size: 12px;
        color: #526158;
        line-height: 1.6;
      }
      .quick {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0;
      }
      .fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      label {
        font-size: 12px;
        font-weight: bold;
      }
      input {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        min-height: 44px;
        padding: 8px;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        margin-top: 6px;
      }
      button {
        min-height: 40px;
        padding: 8px 12px;
        color: #17632e;
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        background: white;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .demo {
        background: #dceff7;
        color: #114f70;
        padding: 8px;
      }
      .error {
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
export class ReportsPanelComponent {
  readonly selection = input<TelemetrySubscription | null>(null);
  private readonly api = inject(ReportsApi);
  private readonly files = inject(CsvDownload);
  private request = new Subscription();
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ['', Validators.required],
    to: ['', Validators.required],
  });

  constructor() {
    effect(() => {
      this.selection();
      untracked(() => {
        this.request.unsubscribe();
        this.busy.set(false);
        this.error.set('');
        this.message.set('');
        this.setDays(1);
      });
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }
  setDays(days: number): void {
    if (this.busy() || ![1, 7, 30].includes(days)) return;
    const to = new Date(Math.ceil(Date.now() / 1000) * 1000);
    this.form.setValue({
      from: localInput(new Date(to.getTime() - days * 86400000)),
      to: localInput(to),
    });
  }
  download(kind: ReportKind): void {
    const selected = this.selection();
    if (!selected || this.busy()) return;
    this.error.set('');
    this.message.set('');
    const { from, to } = this.form.getRawValue();
    const start = new Date(from),
      end = new Date(to);
    if (
      this.form.invalid ||
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      start > end ||
      end.getTime() - start.getTime() > 31 * 86400000
    ) {
      this.error.set('Indica fechas válidas, ordenadas y un periodo de máximo 31 días.');
      return;
    }
    this.busy.set(true);
    this.request = this.api
      .download(selected, kind, start.toISOString(), end.toISOString())
      .subscribe({
        next: (blob) => {
          try {
            this.files.save(blob, `cacaosmart-${kind}-${selected.source}.csv`);
            this.message.set(
              'Archivo preparado para descargar. Revisa las descargas del navegador.',
            );
          } catch {
            this.error.set('El navegador no pudo iniciar la descarga. Inténtalo de nuevo.');
          }
          this.busy.set(false);
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 413
              ? 'El reporte supera 10000 registros. Reduce el periodo e inténtalo de nuevo.'
              : 'No se pudo descargar el reporte. Revisa fechas, sesión y conexión y vuelve a intentarlo.',
          );
        },
      });
  }
}
