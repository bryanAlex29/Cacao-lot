import { describe, expect, it } from 'vitest';
import { matchesIrrigationEvent } from './irrigation-event';
import type { IrrigationUpdatedEvent } from '@cacaosmart/contracts';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' } as const;
const event: IrrigationUpdatedEvent = {
  schemaVersion: '1.0',
  plotId: selection.plotId,
  observation: {
    ...selection,
    id: 'id',
    eventId: 'evt',
    observedAt: '2026-01-01T00:00:00Z',
    receivedAt: '2026-01-01T00:00:01Z',
    timestampOrigin: 'device',
    kind: 'change',
    valve: { relayCommandedOpen: false, feedbackOpen: null },
    previousValve: { relayCommandedOpen: true, feedbackOpen: null },
  },
};
describe('Contrato irrigation.updated', () => {
  it('acepta cambio de relé sin convertirlo en feedback físico', () => {
    expect(matchesIrrigationEvent(event, selection)).toBe(true);
    expect(event.observation.valve.feedbackOpen).toBeNull();
  });
  it.each([
    null,
    {},
    { ...event, schemaVersion: '1.2' },
    { ...event, plotId: 'other' },
    { ...event, observation: { ...event.observation, source: 'real' } },
    { ...event, observation: { ...event.observation, deviceId: 'other' } },
    { ...event, observation: { ...event.observation, observedAt: 'bad' } },
    {
      ...event,
      observation: {
        ...event.observation,
        valve: { relayCommandedOpen: 'true', feedbackOpen: null },
      },
    },
    { ...event, observation: { ...event.observation, previousValve: event.observation.valve } },
  ])('ignora evento incompatible o de otro origen: %j', (value) => {
    expect(matchesIrrigationEvent(value, selection)).toBe(false);
  });
});
