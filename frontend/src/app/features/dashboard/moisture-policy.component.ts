import { Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';
import type { MoisturePolicyResponse, TelemetrySubscription } from '@cacaosmart/contracts';
import { MoistureAlertsApi } from '../../core/alerts/moisture-alerts-api.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-moisture-policy',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `<div class="policy">
    <h4>{{ label() }}</h4>
    @if (busy()) {
      <p role="status">Consultando política…</p>
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (policy(); as row) {
      <p>{{ statusLabel(row) }}</p>
      @if (row.range) {
        <p>
          Rango {{ row.range.minValue }}–{{ row.range.maxValue }} % · versión
          {{ row.range.version }}
        </p>
      }
      <p>
        Margen de recuperación:
        {{ row.policy ? row.policy.recoveryMarginPct + ' puntos porcentuales' : 'Sin configurar' }}
      </p>
      @if (auth.user()?.role === 'ADMIN' && row.range && row.status !== 'disabled') {
        <form [formGroup]="form" (ngSubmit)="save()">
          <label [for]="'margin-' + sensorId()"
            >Margen de {{ label() }} (puntos porcentuales)</label
          >
          <input
            [id]="'margin-' + sensorId()"
            type="number"
            min="0"
            max="100"
            step="any"
            [formControl]="margin"
          />
          <p>
            Mínimo + margen ≤ máximo; margen mayor que cero. No es calibración ni control de riego.
          </p>
          <button
            type="submit"
            [disabled]="busy() || writing() || uncertain() || !!error() || margin.invalid"
          >
            Guardar margen
          </button>
        </form>
      }
    }
    <button type="button" [disabled]="busy() || writing()" (click)="load()">
      Consultar política
    </button>
    @if (message()) {
      <p role="status">{{ message() }}</p>
    }
  </div>`,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .policy {
        border: 1px solid #d9e2db;
        border-radius: 10px;
        padding: 10px;
        margin: 10px 0;
      }
      h4 {
        margin: 0;
      }
      p,
      label {
        font-size: 12px;
        line-height: 1.6;
        overflow-wrap: anywhere;
      }
      label {
        display: block;
      }
      input {
        box-sizing: border-box;
        max-width: 100%;
        width: 110px;
        padding: 8px;
      }
      button {
        border: 1px solid #a9c7ae;
        border-radius: 8px;
        background: white;
        color: #17632e;
        min-height: 36px;
        padding: 8px;
        margin: 5px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: default;
      }
      :is(button, input):focus-visible {
        outline: 3px solid #1263bd;
        outline-offset: 2px;
      }
    `,
  ],
})
export class MoisturePolicyComponent {
  readonly selection = input.required<TelemetrySubscription>();
  readonly sensorId = input.required<string>();
  readonly label = input.required<string>();
  readonly auth = inject(AuthService);
  private readonly api = inject(MoistureAlertsApi);
  private scope = new Subscription();
  readonly policy = signal<MoisturePolicyResponse | null>(null);
  readonly busy = signal(false);
  readonly writing = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly margin = new FormControl<number | null>(null, [
    Validators.required,
    Validators.min(Number.MIN_VALUE),
    Validators.max(100),
  ]);
  readonly form = new FormGroup({ margin: this.margin });
  constructor() {
    effect(() => {
      this.selection();
      this.sensorId();
      untracked(() => {
        this.scope.unsubscribe();
        this.scope = new Subscription();
        this.policy.set(null);
        this.message.set('');
        this.writing.set(false);
        this.uncertain.set(false);
        this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => this.scope.unsubscribe());
  }
  load(): void {
    if (this.writing()) return;
    this.scope.unsubscribe();
    this.scope = new Subscription();
    this.busy.set(true);
    this.error.set('');
    this.scope.add(
      this.api.policy(this.selection(), this.sensorId()).subscribe({
        next: (row) => {
          this.policy.set(row);
          this.margin.setValue(row.policy?.recoveryMarginPct ?? null);
          this.uncertain.set(false);
          this.busy.set(false);
        },
        error: () => {
          this.policy.set(null);
          this.error.set(
            'No se pudo consultar la política. Reintenta sin modificar la telemetría.',
          );
          this.busy.set(false);
        },
      }),
    );
  }
  save(): void {
    const row = this.policy(),
      value = this.margin.value;
    if (
      this.auth.user()?.role !== 'ADMIN' ||
      !row?.range ||
      this.writing() ||
      this.busy() ||
      this.uncertain() ||
      this.error()
    )
      return;
    if (
      value === null ||
      !Number.isFinite(value) ||
      value <= 0 ||
      row.range.minValue + value > row.range.maxValue
    ) {
      this.message.set('El margen debe ser positivo y mínimo + margen no puede superar el máximo.');
      return;
    }
    this.writing.set(true);
    this.message.set('');
    this.scope.add(
      this.api
        .put(this.selection(), this.sensorId(), {
          recoveryMarginPct: value,
          expectedVersion: row.policy?.version ?? 0,
          expectedThresholdVersion: row.range.version,
        })
        .subscribe({
          next: (saved) => {
            this.policy.set(saved);
            this.writing.set(false);
            this.message.set(
              'Margen guardado. Las confirmaciones comienzan con lecturas posteriores al cambio.',
            );
          },
          error: (error: unknown) => {
            this.writing.set(false);
            this.uncertain.set(true);
            this.message.set(
              error instanceof HttpErrorResponse && error.status === 409
                ? 'Cambió el rango o margen. Consulta la política y revisa los valores antes de guardar de nuevo.'
                : 'No se confirmó el guardado; puede haberse aplicado. Consulta la política antes de reintentar.',
            );
          },
        }),
    );
  }
  statusLabel(row: MoisturePolicyResponse): string {
    return {
      unconfigured: 'Inhabilitada: falta configurar el margen.',
      no_range: 'Inhabilitada: falta configurar el rango.',
      incompatible_margin: 'Inhabilitada: el margen ya no cabe en el rango actual.',
      disabled: 'Monitoreo deshabilitado.',
      real_uncalibrated: 'Inhabilitada: no hay evidencia de una lectura real calibrada válida.',
      ready: 'Política configurada; solo cuentan lecturas nuevas, recientes y de calidad admitida.',
    }[row.status];
  }
}
