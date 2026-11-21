import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable, of, timeout } from 'rxjs';

export interface SystemHealth {
  api: 'up' | 'down';
  database: 'up' | 'down';
}

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  check(): Observable<SystemHealth> {
    const live = this.http.get<{ status: string }>('/api/v1/health/live').pipe(
      timeout(5000),
      map((body): SystemHealth['api'] => (body.status === 'ok' ? 'up' : 'down')),
      catchError(() => of('down' as const)),
    );
    const ready = this.http.get<{ status: string; database: string }>('/api/v1/health/ready').pipe(
      timeout(5000),
      map((body): SystemHealth['database'] =>
        body.status === 'ok' && body.database === 'up' ? 'up' : 'down',
      ),
      catchError(() => of('down' as const)),
    );
    return forkJoin({ api: live, database: ready });
  }
}
