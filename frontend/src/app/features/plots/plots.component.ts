import { Component, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Page, PlotSummary } from '@cacaosmart/contracts';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-plots',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe, RouterLink],
  templateUrl: './plots.component.html',
  styleUrl: './plots.component.css',
})
export class PlotsComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly plots = signal<PlotSummary[]>([]);
  readonly total = signal(0);
  readonly offset = signal(0);
  readonly busy = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    locationLabel: ['', [Validators.required, Validators.maxLength(200)]],
    areaM2: new FormControl<number | null>(null, [Validators.min(0.000001)]),
  });

  constructor() {
    effect(() => {
      if (!this.auth.user()) {
        this.plots.set([]);
        void this.router.navigateByUrl('/login');
      }
    });
  }

  ngOnInit(): void {
    this.load(0);
  }

  load(offset: number): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.http
      .get<Page<PlotSummary>>('/api/v1/plots', { params: { limit: 20, offset } })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (page) => {
          this.plots.set(page.items);
          this.total.set(page.total);
          this.offset.set(page.offset);
          this.busy.set(false);
        },
        error: () => {
          this.plots.set([]);
          this.total.set(0);
          this.error.set('No se pudieron consultar tus parcelas. Puedes volver a intentarlo.');
          this.busy.set(false);
        },
      });
  }

  create(): void {
    if (this.saving() || this.busy() || this.auth.user()?.role !== 'ADMIN') return;
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const value = this.form.getRawValue();
    const name = value.name.trim();
    const locationLabel = value.locationLabel.trim();
    if (!name || !locationLabel) {
      this.error.set('Nombre y ubicación son obligatorios.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    const areaM2 = value.areaM2;
    this.http
      .post<PlotSummary>('/api/v1/plots', { name, locationLabel, areaM2 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.reset();
          this.saving.set(false);
          this.load(0);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.error.set(
            error instanceof HttpErrorResponse && error.status === 400
              ? 'Revisa los campos de la parcela y su superficie.'
              : 'No se pudo crear la parcela. Revisa la conexión y vuelve a intentarlo.',
          );
        },
      });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }
}
