import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { SensorThresholdResponse } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';
import { SensorThresholdsApi } from '../../core/sensor-thresholds/sensor-thresholds-api.service';
import {
  quantitativeSensors,
  SensorRangeEditTarget,
} from '../../core/sensor-thresholds/sensor-thresholds.types';

@Component({
  selector: 'app-sensor-range-editor',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './sensor-range-editor.component.html',
  styleUrl: './sensor-range-editor.component.css',
})
export class SensorRangeEditorComponent implements OnInit, AfterViewInit {
  readonly target = input.required<SensorRangeEditTarget>();
  readonly saved = output<SensorThresholdResponse>();
  readonly closed = output<void>();
  private readonly api = inject(SensorThresholdsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private expectedVersion = 0;
  readonly saving = signal(false);
  readonly consulting = signal(false);
  readonly blocked = signal(false);
  readonly canRecover = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly current = signal<SensorThresholdResponse | null>(null);
  readonly form = new FormGroup(
    {
      minValue: new FormControl<number | null>(null),
      maxValue: new FormControl<number | null>(null),
    },
    {
      validators: (group) => {
        const { minValue, maxValue } = group.value;
        return typeof minValue === 'number' && typeof maxValue === 'number' && minValue >= maxValue
          ? { rangeOrder: true }
          : null;
      },
    },
  );

  get unit(): string {
    return quantitativeSensors[this.target().code].unit === 'CELSIUS' ? '°C' : '%';
  }
  get lower(): number {
    return this.unit === '%' ? 0 : -50;
  }

  ngOnInit(): void {
    const validators = [
      Validators.required,
      Validators.min(this.lower),
      Validators.max(100),
      (control: AbstractControl) =>
        control.value !== null &&
        (typeof control.value !== 'number' || !Number.isFinite(control.value))
          ? { finite: true }
          : null,
    ];
    this.form.controls.minValue.setValidators(validators);
    this.form.controls.maxValue.setValidators(validators);
    this.fill(this.target().range);
  }
  ngAfterViewInit(): void {
    this.dialog().nativeElement.showModal();
  }

  private fill(range: SensorRangeEditTarget['range']): void {
    this.expectedVersion = range?.version ?? 0;
    this.form.reset({ minValue: range?.minValue ?? null, maxValue: range?.maxValue ?? null });
  }

  close(event?: Event): void {
    event?.preventDefault();
    if (!this.saving() && !this.consulting()) {
      this.dialog().nativeElement.close();
      this.closed.emit();
    }
  }

  save(): void {
    if (this.saving() || this.consulting() || this.blocked()) return;
    if (this.auth.user()?.role !== 'ADMIN') {
      this.error.set('Solo el administrador propietario puede guardar este rango.');
      return;
    }
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { minValue, maxValue } = this.form.getRawValue();
    if (minValue === null || maxValue === null) return;
    const target = this.target();
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.current.set(null);
    this.api
      .put(target.selection, target.sensor, target.code, {
        ...quantitativeSensors[target.code],
        minValue,
        maxValue,
        expectedVersion: this.expectedVersion,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.saving.set(false);
          this.dialog().nativeElement.close();
          this.saved.emit(response);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          if (status === 400) {
            this.error.set(
              'El servidor rechazó los valores. Revisa el mínimo, el máximo y sus unidades.',
            );
            return;
          }
          this.blocked.set(true);
          this.canRecover.set(status !== 401 && status !== 403 && status !== 404);
          this.error.set(
            status === 409
              ? 'Otra edición modificó este rango. Tus valores se conservan; consulta el rango actual antes de volver a guardar.'
              : status === 401 || status === 403 || status === 404
                ? 'Ya no se puede editar este sensor. Revisa tu sesión y los permisos de la parcela.'
                : 'No se pudo confirmar el guardado. Puede haberse aplicado: consulta el rango actual antes de volver a intentarlo.',
          );
        },
      });
  }

  loadCurrent(): void {
    if (!this.canRecover() || this.consulting() || this.saving()) return;
    const target = this.target();
    this.consulting.set(true);
    this.api
      .get(target.selection, target.sensor, target.code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.current.set(response);
          this.consulting.set(false);
        },
        error: () => {
          this.consulting.set(false);
          this.current.set(null);
          this.error.set(
            'No se pudo consultar el rango actual. Tus valores siguen en el formulario; no se ha reenviado el guardado.',
          );
        },
      });
  }

  useCurrent(): void {
    const response = this.current();
    if (!response || this.consulting()) return;
    this.fill(response.threshold);
    this.blocked.set(false);
    this.canRecover.set(false);
    this.error.set('');
    this.current.set(null);
    this.message.set(
      'Formulario actualizado con el rango consultado. Revisa o edita los valores antes de guardar.',
    );
  }
}
