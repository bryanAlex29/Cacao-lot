import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import type {
  ObservedIrrigationEvent,
  Page,
  TelemetrySubscription,
  ValveState,
} from '@cacaosmart/contracts';

@Injectable({ providedIn: 'root' })
export class IrrigationApi {
  private readonly http = inject(HttpClient);

  list(selection: TelemetrySubscription, from: string, to: string, offset: number) {
    return this.http
      .get<Page<ObservedIrrigationEvent>>(
        `/api/v1/plots/${encodeURIComponent(selection.plotId)}/irrigation-events`,
        {
          params: {
            deviceId: selection.deviceId,
            source: selection.source,
            from,
            to,
            offset,
            limit: 10,
          },
        },
      )
      .pipe(
        timeout(8000),
        map((page) => {
          const date = (v: unknown): v is string =>
            typeof v === 'string' && Number.isFinite(Date.parse(v));
          const valve = (v: unknown): v is ValveState => {
            if (!v || typeof v !== 'object') return false;
            const state = v as ValveState;
            return [state.relayCommandedOpen, state.feedbackOpen].every(
              (value) => value === null || typeof value === 'boolean',
            );
          };
          if (
            !page ||
            !Array.isArray(page.items) ||
            !Number.isInteger(page.total) ||
            page.total < 0 ||
            page.limit !== 10 ||
            page.offset !== offset ||
            page.items.length > 10 ||
            page.items.length > page.total ||
            new Set(page.items.map((item) => item?.id)).size !== page.items.length ||
            page.items.some(
              (item) =>
                !item ||
                typeof item.id !== 'string' ||
                !item.id ||
                typeof item.eventId !== 'string' ||
                item.plotId !== selection.plotId ||
                item.deviceId !== selection.deviceId ||
                item.source !== selection.source ||
                !date(item.observedAt) ||
                !date(item.receivedAt) ||
                Date.parse(item.observedAt) < Date.parse(from) ||
                Date.parse(item.observedAt) > Date.parse(to) ||
                !['device', 'server'].includes(item.timestampOrigin) ||
                !valve(item.valve) ||
                (item.kind === 'initial'
                  ? item.previousValve !== null
                  : item.kind !== 'change' || !valve(item.previousValve)),
            )
          )
            throw new Error('Historial incompatible con la selección');
          return page;
        }),
      );
  }
}
