import type {
  IrrigationUpdatedEvent,
  TelemetrySubscription,
  ValveState,
} from '@cacaosmart/contracts';

export function matchesIrrigationEvent(
  value: unknown,
  selection: TelemetrySubscription,
): value is IrrigationUpdatedEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as IrrigationUpdatedEvent;
  const item = event.observation;
  const date = (v: unknown) =>
    typeof v === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
  const valve = (v: unknown): v is ValveState => {
    if (!v || typeof v !== 'object') return false;
    const state = v as ValveState;
    return [state.relayCommandedOpen, state.feedbackOpen].every(
      (v) => v === null || typeof v === 'boolean',
    );
  };
  return (
    event.schemaVersion === '1.0' &&
    event.plotId === selection.plotId &&
    !!item &&
    item.plotId === selection.plotId &&
    item.deviceId === selection.deviceId &&
    item.source === selection.source &&
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.eventId === 'string' &&
    item.eventId.length > 0 &&
    date(item.observedAt) &&
    date(item.receivedAt) &&
    ['device', 'server'].includes(item.timestampOrigin) &&
    valve(item.valve) &&
    (item.kind === 'initial'
      ? item.previousValve === null
      : item.kind === 'change' &&
        valve(item.previousValve) &&
        (item.valve.relayCommandedOpen !== item.previousValve.relayCommandedOpen ||
          item.valve.feedbackOpen !== item.previousValve.feedbackOpen))
  );
}
