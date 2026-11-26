import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  afterNextRender,
  ElementRef,
  Injector,
  viewChild,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, Subscription, timeout } from 'rxjs';
import { checkedPlot } from '../../core/plots/plot-response';
import type { PlotSummary } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-plot-management',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  styleUrl: './management.css',
  template: `
    @if (auth.user()?.role === 'ADMIN') {
      <section
        aria-label="Gestionar parcela"
        [attr.aria-busy]="busy()"
        (keydown.escape)="dismiss($event)"
      >
        @if (!editing() && !archiving()) {
          <div class="actions">
            <button #editTrigger type="button" (click)="openPanel('edit')">
              <app-icon name="settings" /> Editar parcela
            </button>
            <button
              #archiveTrigger
              class="danger-outline"
              type="button"
              (click)="openPanel('archive')"
            >
              <app-icon name="alert" /> Archivar parcela
            </button>
          </div>
        }
        @if (editing()) {
          <h4><app-icon name="leaf" /> Editar datos de la parcela</h4>
          <p [id]="'edit-note-' + plot().id" class="help">
            No modifica dispositivos, rangos o firmware. No existe combinación automática de
            ediciones simultáneas; coordina los cambios con tus otras sesiones.
          </p>
          <form
            [formGroup]="form"
            (ngSubmit)="save()"
            [attr.aria-describedby]="'edit-note-' + plot().id"
          >
            <fieldset class="fields" [disabled]="busy()" aria-label="Datos de la parcela">
              <label
                >Nombre de la parcela<input
                  #editName
                  formControlName="name"
                  maxlength="100"
                  [attr.aria-invalid]="form.controls.name.touched && form.controls.name.invalid"
              /></label>
              <label
                >Ubicación de la parcela<input
                  formControlName="locationLabel"
                  maxlength="200"
                  [attr.aria-invalid]="
                    form.controls.locationLabel.touched && form.controls.locationLabel.invalid
                  "
              /></label>
              <label
                >Superficie de la parcela en m² (opcional)
                <input
                  type="number"
                  formControlName="areaM2"
                  min="0.000001"
                  step="any"
                  [attr.aria-invalid]="form.controls.areaM2.touched && form.controls.areaM2.invalid"
                />
              </label>
            </fieldset>
            @if (form.touched && form.invalid) {
              <p role="alert">Nombre y ubicación obligatorios; superficie positiva o vacía.</p>
            }
            <div class="actions">
              <button class="primary" type="submit" [disabled]="busy() || uncertain()">
                {{ busy() ? 'Guardando…' : 'Guardar parcela' }}
              </button>
              <button type="button" [disabled]="busy()" (click)="cancelPanel()">
                Cancelar edición
              </button>
            </div>
          </form>
        }
        @if (archiving()) {
          <div
            class="confirmation danger-panel"
            role="group"
            [attr.aria-label]="'Confirmar archivo de ' + plot().name"
          >
            <h4><app-icon name="alert" /> Confirmar archivo de {{ plot().name }}</h4>
            <p>
              Se ocultará de tus parcelas activas y dejará de estar disponible para consultas e
              ingesta. Conserva los registros, pero no hay restauración desde esta pantalla. No
              cierra la válvula física ni detiene el control local del ESP32.
            </p>
            <label
              >Escribe el nombre de la parcela para confirmar
              <input
                #archiveInput
                [formControl]="archiveName"
                [readOnly]="busy()"
                autocomplete="off"
                [attr.aria-invalid]="archiveName.touched && archiveName.value !== plot().name"
              />
            </label>
            <div class="actions">
              <button
                class="danger"
                type="button"
                [disabled]="busy() || uncertain() || archiveName.value !== plot().name"
                (click)="archive()"
              >
                Confirmar archivo de parcela
              </button>
              <button type="button" [disabled]="busy()" (click)="cancelPanel()">
                Cancelar archivo
              </button>
            </div>
          </div>
        }
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        @if (uncertain()) {
          <p>
            No se reenviará la operación. Actualiza la lista de parcelas y revisa el estado antes de
            continuar.
          </p>
        }
      </section>
    }
  `,
})
export class PlotManagementComponent {
  readonly plot = input.required<PlotSummary>();
  readonly changed = output<void>();
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private request = new Subscription();
  private readonly injector = inject(Injector);
  private readonly editTrigger = viewChild<ElementRef<HTMLButtonElement>>('editTrigger');
  private readonly archiveTrigger = viewChild<ElementRef<HTMLButtonElement>>('archiveTrigger');
  private readonly editName = viewChild<ElementRef<HTMLInputElement>>('editName');
  private readonly archiveInput = viewChild<ElementRef<HTMLInputElement>>('archiveInput');
  readonly editing = signal(false);
  readonly archiving = signal(false);
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly archiveName = new FormControl('', { nonNullable: true });
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    locationLabel: ['', [Validators.required, Validators.maxLength(200)]],
    areaM2: new FormControl<number | null>(null, [Validators.min(0.000001)]),
  });
  constructor() {
    effect(() => {
      const plot = this.plot();
      untracked(() => {
        this.request.unsubscribe();
        this.cancel();
        this.busy.set(false);
        this.uncertain.set(false);
        this.form.reset({
          name: plot.name,
          locationLabel: plot.locationLabel,
          areaM2: plot.areaM2,
        });
      });
    });
    effect(() => {
      if (this.auth.user()?.role !== 'ADMIN') {
        this.request.unsubscribe();
        this.cancel();
        this.busy.set(false);
      }
    });
    inject(DestroyRef).onDestroy(() => this.request.unsubscribe());
  }
  cancel(): void {
    this.editing.set(false);
    this.archiving.set(false);
    this.error.set('');
    this.archiveName.reset();
    // Only remounting after an explicit list refresh clears an uncertain write.
  }
  openPanel(mode: 'edit' | 'archive'): void {
    if (this.busy() || this.auth.user()?.role !== 'ADMIN') return;
    this.editing.set(mode === 'edit');
    this.archiving.set(mode === 'archive');
    afterNextRender(
      () => {
        const field = mode === 'edit' ? this.editName() : this.archiveInput();
        field?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
  cancelPanel(): void {
    if (this.busy()) return;
    const archived = this.archiving();
    this.cancel();
    afterNextRender(
      () => {
        const trigger = archived ? this.archiveTrigger() : this.editTrigger();
        trigger?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
  dismiss(event: Event): void {
    if (this.busy() || (!this.editing() && !this.archiving())) return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelPanel();
  }
  save(): void {
    if (this.busy() || this.uncertain() || !this.editing() || this.auth.user()?.role !== 'ADMIN')
      return;
    this.form.markAllAsTouched();
    const value = this.form.getRawValue();
    if (
      this.form.invalid ||
      !value.name.trim() ||
      !value.locationLabel.trim() ||
      (value.areaM2 !== null && !Number.isFinite(value.areaM2))
    ) {
      this.error.set('Nombre y ubicación obligatorios; superficie finita y positiva o vacía.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .patch(this.url(), {
        ...value,
        name: value.name.trim(),
        locationLabel: value.locationLabel.trim(),
      })
      .pipe(
        timeout(15000),
        map((response) => checkedPlot(response, this.plot().id)),
      )
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.cancel();
          this.changed.emit();
        },
        error: () => this.failed(),
      });
  }
  archive(): void {
    if (
      this.busy() ||
      this.uncertain() ||
      !this.archiving() ||
      this.archiveName.value !== this.plot().name ||
      this.auth.user()?.role !== 'ADMIN'
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.request = this.http
      .delete(this.url())
      .pipe(timeout(15000))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.cancel();
          this.changed.emit();
        },
        error: () => this.failed(),
      });
  }
  private failed(): void {
    this.busy.set(false);
    this.uncertain.set(true);
    this.error.set(
      'No se confirmó la operación. Conserva el borrador y consulta la lista antes de intentar otro cambio.',
    );
  }
  private url(): string {
    return `/api/v1/plots/${encodeURIComponent(this.plot().id)}`;
  }
}
