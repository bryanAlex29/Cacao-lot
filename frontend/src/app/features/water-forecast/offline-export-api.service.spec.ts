import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkedOfflineFile,
  OfflineExportApi,
  validOfflineDates,
  type OfflineDates,
} from './offline-export-api.service';

const selection = { plotId: 'plot', deviceId: 'device', source: 'demo' as const };
const dates: OfflineDates = {
  from: '2026-01-03',
  trainUntil: '2026-01-05',
  validationUntil: '2026-01-07',
  toExclusive: '2026-01-09',
};
function fixture() {
  return {
    schemaVersion: '1.0',
    ...selection,
    ...dates,
    asOf: '2026-01-10T00:00:00.000Z',
    sensors: [{ id: 'sensor', code: 'soil_1' }],
    observations: [
      {
        ...selection,
        sensorId: 'sensor',
        code: 'soil_1',
        eventId: 'event',
        ingestionOrder: '1',
        recordedAt: null,
        receivedAt: '2026-01-01T12:00:00.000Z',
        moisturePct: 0,
        quality: 'valid',
      },
    ],
  };
}
// jsdom's Blob lacks text(); preserve actual Blob size/type and supply only
// this standard browser method, so the production contract checks still run.
const textBlob = (text: string, type = 'application/json') =>
  Object.assign(new Blob([text], { type }), { text: async () => text });
const blob = (value: unknown) => textBlob(JSON.stringify(value));
describe('Contrato de descarga offline privada', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('conserva cero y dos días de retardo sin modificar el archivo', async () => {
    const file = blob(fixture());
    expect(await checkedOfflineFile(file, selection, dates)).toEqual({ blob: file, count: 1 });
  });
  it('acepta archivo vacío y null/calidad explícita', async () => {
    const value = fixture();
    expect(
      (await checkedOfflineFile(blob({ ...value, observations: [] }), selection, dates)).count,
    ).toBe(0);
    const invalid = { ...value.observations[0], moisturePct: null, quality: 'invalid' };
    expect(
      (await checkedOfflineFile(blob({ ...value, observations: [invalid] }), selection, dates))
        .count,
    ).toBe(1);
  });
  it.each([
    'plotId',
    'deviceId',
    'source',
    'schemaVersion',
    'from',
    'trainUntil',
    'validationUntil',
    'toExclusive',
  ])('rechaza archivo con identidad/cortes alterados %s', async (key) => {
    await expect(
      checkedOfflineFile(blob({ ...fixture(), [key]: 'other' }), selection, dates),
    ).rejects.toThrow();
  });
  it('rechaza claves no previstas, inventario duplicado y archivos malformados', async () => {
    const value = fixture();
    for (const changed of [
      { ...value, accessToken: 'not-a-real-token' },
      { ...value, sensors: [value.sensors[0], value.sensors[0]] },
      { ...value, observations: [{ ...value.observations[0], passwordHash: 'not-a-real-hash' }] },
    ])
      await expect(checkedOfflineFile(blob(changed), selection, dates)).rejects.toThrow();
    await expect(checkedOfflineFile(textBlob('not json'), selection, dates)).rejects.toThrow(
      SyntaxError,
    );
    await expect(
      checkedOfflineFile(textBlob('<html>error</html>', 'text/html'), selection, dates),
    ).rejects.toThrow();
  });
  it.each([
    { deviceId: 'foreign' },
    { source: 'real' },
    { sensorId: 'foreign' },
    { moisturePct: 101 },
    { quality: 'invented' },
    { ingestionOrder: '0' },
    { ingestionOrder: '9223372036854775808' },
    { receivedAt: '2026-01-11T00:00:00.000Z' },
    { receivedAt: '2026-01-09T00:00:00.000Z' },
    { receivedAt: '2025-12-31T23:59:59.999Z' },
  ])('rechaza observación incompatible %j', async (extra) => {
    const value = fixture();
    await expect(
      checkedOfflineFile(
        blob({
          ...value,
          observations: [{ ...value.observations[0], ...extra }],
        }),
        selection,
        dates,
      ),
    ).rejects.toThrow();
  });
  it('rechaza duplicados y límites de filas/bytes', async () => {
    const value = fixture();
    await expect(
      checkedOfflineFile(
        blob({
          ...value,
          observations: [value.observations[0], value.observations[0]],
        }),
        selection,
        dates,
      ),
    ).rejects.toThrow();
    await expect(
      checkedOfflineFile(
        blob({
          ...value,
          observations: new Array(100001).fill(null),
        }),
        selection,
        dates,
      ),
    ).rejects.toThrow();
    const huge = new Blob([new Uint8Array(16 * 1024 * 1024 + 1)], { type: 'application/json' });
    await expect(checkedOfflineFile(huge, selection, dates)).rejects.toThrow();
  });
  it.each([
    { from: '' },
    { from: '2026-02-30' },
    { trainUntil: '2026-01-03' },
    { validationUntil: '2026-01-09' },
    { toExclusive: '2999-01-01' },
    { from: '2020-01-01' },
    { from: '2026-01-03T00:00:00Z' },
  ])('valida días UTC antes de consultar, sin reinterpretación local %j', (change) => {
    expect(validOfflineDates({ ...dates, ...change })).toBe(false);
  });
  it('permite finalizar hoy UTC, excluyendo el día en curso y acepta año bisiesto', () => {
    expect(validOfflineDates(dates, Date.parse('2026-01-09T00:00:00Z'))).toBe(true);
    expect(
      validOfflineDates({
        from: '2024-02-28',
        trainUntil: '2024-02-29',
        validationUntil: '2024-03-01',
        toExclusive: '2024-03-02',
      }),
    ).toBe(true);
  });
  it('API usa GET autenticable con parámetros explícitos, blob y no reintenta fallos', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const api = TestBed.inject(OfflineExportApi),
      http = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(api.download(selection, dates));
    const req = http.expectOne(
      (r) => r.url === '/api/v1/plots/plot/predictions/offline-input.json',
    );
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    for (const [key, value] of Object.entries({ ...dates, deviceId: 'device', source: 'demo' }))
      expect(req.request.params.get(key)).toBe(value);
    req.flush(blob(fixture()));
    expect((await result).count).toBe(1);
    const failed = firstValueFrom(api.download(selection, dates));
    http
      .expectOne((r) => r.url.endsWith('offline-input.json'))
      .flush(new Blob(), { status: 413, statusText: 'Too large' });
    await expect(failed).rejects.toMatchObject({ status: 413 });
    http.verify();
  });
});
