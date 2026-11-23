import type { Reading } from '@prisma/client';
import type { IrrigationUpdatedEvent } from '@cacaosmart/contracts';

export const valveObservationSelect = {
  id: true,
  deviceId: true,
  eventId: true,
  source: true,
  effectiveAt: true,
  receivedAt: true,
  ingestionOrder: true,
  timestampOrigin: true,
  relayCommandedOpen: true,
  feedbackOpen: true,
} as const;

type Observation = Pick<Reading, keyof typeof valveObservationSelect>;

/** Called under the device lock. The raw reading is the durable evidence. */
export function irrigationObservation(
  plotId: string,
  current: Observation,
  previous: Observation | null,
): IrrigationUpdatedEvent | null {
  if (previous) {
    const effective = current.effectiveAt.getTime() - previous.effectiveAt.getTime();
    const received = current.receivedAt.getTime() - previous.receivedAt.getTime();
    const newer =
      effective > 0 ||
      (effective === 0 &&
        (received > 0 || (received === 0 && current.ingestionOrder > previous.ingestionOrder)));
    if (
      !newer ||
      (current.relayCommandedOpen === previous.relayCommandedOpen &&
        current.feedbackOpen === previous.feedbackOpen)
    )
      return null;
  }
  return {
    schemaVersion: '1.0',
    plotId,
    observation: {
      plotId,
      deviceId: current.deviceId,
      source: current.source,
      id: current.id,
      eventId: current.eventId,
      observedAt: current.effectiveAt.toISOString(),
      receivedAt: current.receivedAt.toISOString(),
      timestampOrigin: current.timestampOrigin === 'device' ? 'device' : 'server',
      kind: previous ? 'change' : 'initial',
      valve: { relayCommandedOpen: current.relayCommandedOpen, feedbackOpen: current.feedbackOpen },
      previousValve: previous
        ? { relayCommandedOpen: previous.relayCommandedOpen, feedbackOpen: previous.feedbackOpen }
        : null,
    },
  };
}
