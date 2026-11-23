import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type { TelemetrySubscription } from '@cacaosmart/contracts';

export type ReportKind = 'readings' | 'irrigation-events';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);
  download(selection: TelemetrySubscription, kind: ReportKind, from: string, to: string) {
    return this.http
      .get(`/api/v1/plots/${encodeURIComponent(selection.plotId)}/reports/${kind}.csv`, {
        params: { deviceId: selection.deviceId, source: selection.source, from, to },
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(
        timeout(30000),
        map((response) => {
          if (
            !response.body ||
            !response.headers.get('content-type')?.toLowerCase().startsWith('text/csv')
          )
            throw new Error('Respuesta CSV incompatible');
          return response.body;
        }),
      );
  }
}
