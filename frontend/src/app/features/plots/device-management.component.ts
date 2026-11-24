import {
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  isDevMode,
  output,
  signal,
  untracked,
  afterNextRender,
  ElementRef,
  Injector,
  viewChild,
} from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subscription, timeout } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import type { RegisteredDevice } from '../../core/devices/devices-api.service';
import { IconComponent } from '../../shared/ui/icon.component';

@Component({
  selector: 'app-device-management',
  standalone: true,
  imports: [ReactiveFormsModule, IconComponent],
  template: `
    @if (auth.user()?.role === 'ADMIN') {
      <section aria-label="Gestión de dispositivos" [attr.aria-busy]="busy()">
        <h4><app-icon name="settings" /> Administración de equipos</h4>
        <p class="help">
          Solo ADMIN propietario. No asigna equipos a otras cuentas ni modifica firmware.
        </p>
        @if (credential(); as key) {
          <div
            role="group"
            aria-label="Credencial privada del equipo nuevo"
            aria-live="off"
            class="credential"
          >
            <h5 #credentialTitle tabindex="-1">Equipo registrado · Guarda su clave ahora</h5>
            <p role="status">
              La clave se muestra una sola vez. No se puede recuperar al cerrar o salir.
            </p>
            <p>
              Identificador (X-Device-Id): <code>{{ key.id }}</code>
            </p>
            <label
              >Clave privada (X-Device-Key)
              <textarea
                readonly
                autocomplete="off"
                spellcheck="false"
                autocapitalize="off"
                rows="3"
                [value]="key.deviceKey"
                aria-label="Clave privada del dispositivo"
              ></textarea>
            </label>
            <p>
              No la compartas por chat ni la guardes en Git. Registrar el equipo no confirma su
              instalación.
            </p>
            <button class="primary" type="button" (click)="dismissKey()">
              Ya guardé la clave · Ocultar
            </button>
          </div>
        } @else {
          <details class="registration">
            <summary #registrationToggle>
              <app-icon name="monitor" /> Registrar equipo en esta parcela
            </summary>
            <form [formGroup]="form" (ngSubmit)="create()">
              <div class="fields">
                <label
                  >Serie del equipo
                  <input
                    formControlName="serial"
                    maxlength="100"
                    autocomplete="off"
                    [attr.aria-invalid]="
                      form.controls.serial.touched && form.controls.serial.invalid
                    "
                  />
                </label>
                <label
                  >Origen del equipo
                  <select formControlName="source" aria-label="Origen del equipo">
                    <option value="real">REAL · Datos reales</option>
                    @if (demoAllowed) {
                      <option value="demo">DEMO · Demostración</option>
                    }
                  </select>
                </label>
                <label
                  >Intervalo esperado en segundos
                  <input
                    type="number"
                    formControlName="expectedIntervalSeconds"
                    min="1"
                    max="86400"
                    step="1"
                    [attr.aria-invalid]="
                      form.controls.expectedIntervalSeconds.touched &&
                      form.controls.expectedIntervalSeconds.invalid
                    "
                  />
                </label>
              </div>
              <p class="help">
                Serie de 3–100 caracteres: letras, números, punto, guion, guion bajo o dos puntos.
                Intervalo entero de 1 a 86400 segundos. El origen no se cambia después del alta.
              </p>
              <label class="check"
                ><input type="checkbox" formControlName="confirmed" />
                Confirmo la parcela y el origen; guardaré la clave en un lugar seguro.
              </label>
              @if (form.touched && form.invalid) {
                <p role="alert">Revisa la serie, el intervalo y la confirmación.</p>
              }
              <div class="actions">
                <button class="primary" type="submit" [disabled]="busy() || uncertain()">
                  {{ busy() ? 'Procesando…' : 'Registrar dispositivo' }}
                </button>
              </div>
            </form>
          </details>
        }
        @if (uncertain()) {
          <p role="alert">
            No se confirmó el alta. No se reenviará automáticamente. Actualiza el inventario y
            comprueba la serie antes de intentar otra alta. Si el equipo existe y perdiste la clave,
            no puede recuperarse desde esta pantalla.
          </p>
          <button type="button" (click)="reviewed()" [disabled]="busy()">
            Revisé el inventario · Desbloquear formulario
          </button>
        }
        @if (error()) {
          <p role="alert">{{ error() }}</p>
        }
        @if (message()) {
          <p role="status">{{ message() }}</p>
        }
        <h4 class="subheading"><app-icon name="monitor" /> Habilitación para recibir datos</h4>
        <p class="help">
          Deshabilitar rechaza nuevos mensajes IoT. No cierra la válvula ni cambia el control local.
          No elimina lecturas, sensores o alertas. Actualiza el inventario antes de cambiar un
          estado.
        </p>
        <ul class="enable-list">
          @for (device of devices(); track device.id) {
            <li>
              <div>
                <strong>{{ device.serial }}</strong><span class="state-chip">{{
                  device.isActive ? 'Habilitado' : 'Deshabilitado'
                }}</span>
              </div>
              <button type="button" [disabled]="busy()" (click)="openTarget(device, $event)">
                {{ device.isActive ? 'Deshabilitar' : 'Habilitar' }} {{ device.serial }}
              </button>
            </li>
          } @empty {
            <li class="help">
              No hay equipos en esta página para cambiar habilitación. Consulta el inventario.
            </li>
          }
        </ul>
        @if (target(); as device) {
          <div
            class="confirmation"
            role="group"
            aria-label="Confirmar habilitación"
            (keydown.escape)="cancelTarget($event)"
          >
            <p>
              ¿{{ device.isActive ? 'Deshabilitar' : 'Habilitar' }} la recepción de
              {{ device.serial }}? No es una orden de riego.
            </p>
            <div class="actions">
              <button class="primary" type="button" [disabled]="busy()" (click)="setActive()">
                Confirmar cambio de habilitación
              </button>
              <button #cancelToggle type="button" [disabled]="busy()" (click)="cancelTarget()">
                Cancelar cambio
              </button>
            </div>
          </div>
        }
      </section>
    }
  `,
  styleUrl: './management.css',
})
export class DeviceManagementComponent {
  readonly plotId = input.required<string>();
  readonly devices = input<RegisteredDevice[]>([]);
  readonly changed = output<void>();
  readonly auth = inject(AuthService);
  readonly demoAllowed = isDevMode();
  private readonly http = inject(HttpClient);
  private request = new Subscription();
  private readonly injector = inject(Injector);
  private readonly credentialTitle = viewChild<ElementRef<HTMLElement>>('credentialTitle');
  private readonly registrationToggle = viewChild<ElementRef<HTMLElement>>('registrationToggle');
  private readonly cancelToggle = viewChild<ElementRef<HTMLButtonElement>>('cancelToggle');
  private targetTrigger: HTMLElement | null = null;
  readonly busy = signal(false);
  readonly uncertain = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly credential = signal<{ id: string; deviceKey: string } | null>(null);
  readonly target = signal<RegisteredDevice | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    serial: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9._:-]{3,100}$/)]],
    source: ['real'],
    expectedIntervalSeconds: [
      60,
      [Validators.required, Validators.min(1), Validators.max(86400), Validators.pattern(/^\d+$/)],
    ],
    confirmed: [false, Validators.requiredTrue],
  });

  constructor() {
    effect(() => {
      this.plotId();
      untracked(() => {
        this.request.unsubscribe();
        this.busy.set(false);
        this.credential.set(null);
        this.target.set(null);
        this.targetTrigger = null;
        this.error.set('');
        this.message.set('');
        this.uncertain.set(false);
        this.form.reset();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.request.unsubscribe();
      this.credential.set(null);
    });
    effect(() => {
      if (this.auth.user()?.role !== 'ADMIN') {
        this.request.unsubscribe();
        this.credential.set(null);
        this.target.set(null);
        this.targetTrigger = null;
        this.busy.set(false);
      }
    });
    effect(() => {
      if (!this.credential()) return;
      afterNextRender(
        () => {
          if (this.credential()) this.credentialTitle()?.nativeElement.focus();
        },
        { injector: this.injector },
      );
    });
  }

  create(): void {
    if (this.busy() || this.uncertain() || this.credential() || this.auth.user()?.role !== 'ADMIN')
      return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const { serial, source, expectedIntervalSeconds } = this.form.getRawValue();
    if (!['real', ...(this.demoAllowed ? ['demo'] : [])].includes(source)) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.request = this.http
      .post<unknown>(this.url(), { serial, source, expectedIntervalSeconds })
      .pipe(timeout(15000))
      .subscribe({
        next: (response) => {
          this.busy.set(false);
          if (
            !response ||
            typeof response !== 'object' ||
            !('id' in response) ||
            typeof response.id !== 'string' ||
            !response.id ||
            !('plotId' in response) ||
            response.plotId !== this.plotId() ||
            !('deviceKey' in response) ||
            typeof response.deviceKey !== 'string' ||
            !/^[a-f0-9]{64}$/.test(response.deviceKey)
          ) {
            this.uncertain.set(true);
            this.changed.emit();
            return;
          }
          this.credential.set({ id: response.id, deviceKey: response.deviceKey });
          this.form.reset();
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          const status = error instanceof HttpErrorResponse ? error.status : 0;
          this.uncertain.set(![400, 401, 403, 404, 409, 429].includes(status));
          this.error.set(
            status === 409
              ? 'La serie ya está registrada. Revisa el inventario.'
              : status === 403
                ? 'No tienes permiso o el origen DEMO no está habilitado.'
                : status === 400
                  ? 'Revisa la serie, origen e intervalo.'
                  : 'No se pudo confirmar el registro. No se ha reintentado.',
          );
        },
      });
  }
  dismissKey(): void {
    this.credential.set(null);
    afterNextRender(() => this.registrationToggle()?.nativeElement.focus(), {
      injector: this.injector,
    });
  }
  openTarget(device: RegisteredDevice, event: Event): void {
    if (this.busy() || this.auth.user()?.role !== 'ADMIN' || device.plotId !== this.plotId())
      return;
    this.targetTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.target.set(device);
    afterNextRender(
      () => {
        if (this.target()?.id === device.id) this.cancelToggle()?.nativeElement.focus();
      },
      { injector: this.injector },
    );
  }
  cancelTarget(event?: Event): void {
    if (this.busy()) return;
    event?.preventDefault();
    event?.stopPropagation();
    const trigger = this.targetTrigger;
    this.targetTrigger = null;
    this.target.set(null);
    afterNextRender(
      () => {
        if (trigger?.isConnected) trigger.focus();
      },
      { injector: this.injector },
    );
  }
  reviewed(): void {
    this.uncertain.set(false);
    this.error.set('');
  }
  setActive(): void {
    const device = this.target();
    if (
      !device ||
      device.plotId !== this.plotId() ||
      this.busy() ||
      this.auth.user()?.role !== 'ADMIN'
    )
      return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.request = this.http
      .patch(this.url() + '/' + encodeURIComponent(device.id), { isActive: !device.isActive })
      .pipe(timeout(15000))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.target.set(null);
          this.message.set('Habilitación actualizada. No se envió ninguna orden a la válvula.');
          this.changed.emit();
        },
        error: () => {
          this.busy.set(false);
          this.target.set(null);
          this.error.set(
            'No se confirmó el cambio. Consulta el inventario antes de volver a intentarlo; no se reenvió.',
          );
          this.changed.emit();
        },
      });
  }
  private url(): string {
    return `/api/v1/plots/${encodeURIComponent(this.plotId())}/devices`;
  }
}
