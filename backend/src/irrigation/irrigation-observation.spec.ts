import { irrigationObservation, valveObservationSelect } from './irrigation-observation';
import type { Reading } from '@prisma/client';

const observation = (
  override: Partial<Pick<Reading, keyof typeof valveObservationSelect>> = {},
) => ({
  id: 'reading',
  deviceId: 'device',
  eventId: 'evt',
  source: 'real' as const,
  effectiveAt: new Date('2026-01-01T00:00:00Z'),
  receivedAt: new Date('2026-01-01T00:00:01Z'),
  ingestionOrder: 2n,
  timestampOrigin: 'device',
  relayCommandedOpen: true,
  feedbackOpen: null,
  ...override,
});
describe('Proyección de riego observado en vivo', () => {
  it('primer dato desconocido es observación inicial, nunca apertura física', () => {
    const event = irrigationObservation('plot', observation({ relayCommandedOpen: null }), null);
    expect(event?.observation).toMatchObject({
      kind: 'initial',
      previousValve: null,
      valve: { relayCommandedOpen: null, feedbackOpen: null },
    });
    expect(JSON.stringify(event)).not.toMatch(/ingestionOrder|duration|liters/);
  });
  it('mismos estados no generan cambio nuevo aunque otra variable cambie', () => {
    expect(
      irrigationObservation('plot', observation(), observation({ ingestionOrder: 1n })),
    ).toBeNull();
  });
  it.each([
    { relayCommandedOpen: false },
    { relayCommandedOpen: null },
    { feedbackOpen: true },
    { feedbackOpen: false },
  ])('compara booleanos y null independientemente: %j', (state) => {
    expect(
      irrigationObservation('plot', observation(state), observation({ ingestionOrder: 1n }))
        ?.observation.kind,
    ).toBe('change');
  });
  it('tiempo anterior no sustituye actual aunque se reciba después', () => {
    expect(
      irrigationObservation(
        'plot',
        observation({ effectiveAt: new Date('2025-01-01'), relayCommandedOpen: false }),
        observation(),
      ),
    ).toBeNull();
  });
  it('desempata por recepción y después por orden de ingesta', () => {
    const previous = observation({ ingestionOrder: 1n, relayCommandedOpen: false });
    expect(irrigationObservation('plot', observation(), previous)).not.toBeNull();
    expect(irrigationObservation('plot', observation({ ingestionOrder: 0n }), previous)).toBeNull();
    expect(
      irrigationObservation(
        'plot',
        observation({ receivedAt: new Date('2026-01-01T00:00:00Z') }),
        previous,
      ),
    ).toBeNull();
  });
});
