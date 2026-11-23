import { csvCell, csvDocument } from './csv';
import { ReportsService } from './reports.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryRepository } from '../telemetry/telemetry.repository';
import { SourcePolicy } from '../integrations/source-policy.service';
import { RealtimeService } from '../realtime/realtime.service';

describe('CSV seguro y exportación acotada', () => {
  it.each(['=1+1', '+SUM(A1)', '-cmd', '@formula', '  =HYPERLINK("x")', '\t=1', '\rmalicious'])(
    'neutraliza texto de fórmula %j',
    (value) => {
      expect(csvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );
  it('escapa comas, comillas y saltos; diferencia null de false/cero y temperatura negativa', () => {
    expect(csvCell('texto,"a"\nb')).toBe('"texto,""a""\nb"');
    expect([null, false, 0, -5].map(csvCell)).toEqual(['"null"', '"false"', '"0"', '"-5"']);
    expect(csvDocument(['zona'], [])).toBe('\uFEFF"zona"\r\n');
  });
  it.each(['exportReadings', 'exportIrrigation'] as const)(
    '%s rechaza exceso sin devolver reporte parcial',
    async (method) => {
      const repository = {
        ownedDevices: jest.fn().mockResolvedValue([{ id: 'device' }]),
        history: jest.fn().mockResolvedValue({ items: Array(10001).fill(null) }),
        irrigationHistory: jest.fn().mockResolvedValue({ items: Array(10001).fill(null) }),
      };
      const telemetry = new TelemetryService(
        repository as unknown as TelemetryRepository,
        { require: jest.fn() } as unknown as SourcePolicy,
        {} as RealtimeService,
      );
      await expect(
        telemetry[method]('plot', 'owner', {
          source: 'real',
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-02T00:00:00Z',
        }),
      ).rejects.toMatchObject({ status: 413 });
    },
  );
  it('solo encabezados cuando no hay lecturas, no inventa datos', async () => {
    const reports = new ReportsService({
      exportReadings: jest.fn().mockResolvedValue([]),
    } as unknown as TelemetryService);
    const csv = await reports.readings('plot', 'owner', {
      source: 'real',
      from: '2026-01-01T00:00:00Z',
      to: '2026-01-02T00:00:00Z',
    });
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('quality_soil_1');
    expect(csv).not.toContain('liters');
  });
});
