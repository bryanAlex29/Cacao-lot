import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { HealthService, SystemHealth } from '../../core/health/health.service';

@Component({
  selector: 'app-system-status',
  standalone: true,
  imports: [DatePipe, RouterLink],
  templateUrl: './system-status.component.html',
  styleUrl: './system-status.component.css',
})
export class SystemStatusComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly health = inject(HealthService);
  private readonly destroyRef = inject(DestroyRef);
  readonly checking = signal(false);
  readonly status = signal<SystemHealth | null>(null);
  readonly checkedAt = signal<Date | null>(null);

  ngOnInit(): void {
    this.refresh();
  }

  refresh(): void {
    if (this.checking()) return;
    this.checking.set(true);
    this.health
      .check()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((status) => {
        this.status.set(status);
        this.checkedAt.set(new Date());
        this.checking.set(false);
      });
  }
}
