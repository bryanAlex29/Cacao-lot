import { Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { offlineClosure, shouldOpenOfflineAlert } from './offline-alert.rules';
import { OfflineAlertDetector } from './offline-alert.detector';
import { OfflineAlertRepository } from './offline-alert.repository';
import { OfflineAlertQueryDto } from './offline-alert.dto';
import { SourcePolicy } from '../integrations/source-policy.service';

const seen = new Date('2026-11-21T00:00:00Z');
const device = {
  isActive: true,
  lastSeenAt: seen,
  expectedIntervalSeconds: 60,
  plot: { archivedAt: null, owner: { isActive: true } },
};
const now = new Date(seen.getTime() + 300001);
const alert = { lastSeenAt: seen, expectedIntervalSeconds: 60, detectedAt: now };

describe('Reglas de desconexión: mismo criterio existente, sin reglas agronómicas', () => {
  it.each([0, 120000, 120001, 300000])('no alerta a los %s ms (incluye límite exacto)', (age) => {
    expect(shouldOpenOfflineAlert(device, new Date(seen.getTime() + age))).toBe(false);
  });
  it('abre solo después de cinco intervalos y sin depender del reloj del sensor', () => {
    expect(shouldOpenOfflineAlert(device, now)).toBe(true);
    expect(
      shouldOpenOfflineAlert(
        { ...device, expectedIntervalSeconds: 5 },
        new Date(seen.getTime() + 25001),
      ),
    ).toBe(true);
  });
  it('no inventa una desconexión sin contacto previo o con fecha futura', () => {
    expect(shouldOpenOfflineAlert({ ...device, lastSeenAt: null }, now)).toBe(false);
    expect(shouldOpenOfflineAlert(device, new Date(seen.getTime() - 1))).toBe(false);
  });
  it.each([
    { ...device, isActive: false },
    { ...device, plot: { archivedAt: now, owner: { isActive: true } } },
    { ...device, plot: { archivedAt: null, owner: { isActive: false } } },
  ])('no abre alertas para monitoreo inhabilitado %j', (disabled) => {
    expect(shouldOpenOfflineAlert(disabled, now)).toBe(false);
    expect(offlineClosure(disabled, alert, now)?.closeReason).toBe('MONITORING_STOPPED');
  });
  it('repetir la evaluación no cierra el episodio ni confunde reconocimiento con recuperación', () => {
    const acknowledged = { ...alert, acknowledgedAt: now };
    expect(offlineClosure(device, acknowledged, now)).toBeNull();
  });
  it('nuevo contacto cierra con fecha de recepción, sin afirmar salud del cultivo', () => {
    const contact = new Date(now.getTime() + 1000);
    expect(
      offlineClosure({ ...device, lastSeenAt: contact }, alert, new Date(contact.getTime() + 1000)),
    ).toEqual({ closedAt: contact, closeReason: 'CONTACT_RESTORED' });
  });
  it('cambiar el intervalo cierra por configuración, no como contacto recuperado', () => {
    expect(offlineClosure({ ...device, expectedIntervalSeconds: 120 }, alert, now)).toEqual({
      closedAt: now,
      closeReason: 'INTERVAL_CHANGED',
    });
  });
  it.each([
    {},
    { deviceId: 'serial' },
    { deviceId: 'dfb63f75-b87e-45e0-8874-d2dfeb206c04', source: 'other' },
    { deviceId: 'dfb63f75-b87e-45e0-8874-d2dfeb206c04', ownerId: 'client' },
    { deviceId: 'dfb63f75-b87e-45e0-8874-d2dfeb206c04', limit: 101 },
    { deviceId: 'dfb63f75-b87e-45e0-8874-d2dfeb206c04', offset: -1 },
  ])('rechaza identidad, origen, paginación o campos ajenos %j', async (query) => {
    expect(
      (
        await validate(plainToInstance(OfflineAlertQueryDto, query), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('Detector independiente de navegadores y reiniciable', () => {
  let repository: { candidates: jest.Mock; synchronize: jest.Mock };
  let detector: OfflineAlertDetector;
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    repository = {
      candidates: jest.fn().mockResolvedValue([{ id: 'device' }]),
      synchronize: jest.fn().mockResolvedValue(undefined),
    };
    detector = new OfflineAlertDetector(
      repository as unknown as OfflineAlertRepository,
      { allows: (source: string) => source === 'real' } as unknown as SourcePolicy,
    );
  });
  afterEach(async () => {
    await detector.onModuleDestroy();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('evalúa al arrancar y cada cinco segundos sin suscripciones Socket.IO', async () => {
    detector.onApplicationBootstrap();
    await detector.scan();
    expect(repository.candidates).toHaveBeenCalledWith(['real'], undefined);
    expect(repository.synchronize).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(5000);
    expect(repository.synchronize).toHaveBeenCalledTimes(2);
  });
  it('no solapa barridos y espera el trabajo al cerrar', async () => {
    let release!: (devices: { id: string }[]) => void;
    repository.candidates.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const run = detector.scan();
    expect(detector.scan()).toBe(run);
    const stopped = detector.onModuleDestroy();
    release([{ id: 'device' }]);
    await stopped;
    expect(repository.synchronize).not.toHaveBeenCalled();
  });
  it('un dispositivo fallido no impide evaluar los demás', async () => {
    repository.candidates.mockResolvedValue([{ id: 'broken' }, { id: 'good' }]);
    repository.synchronize.mockRejectedValueOnce(new Error('private database detail'));
    await detector.scan();
    expect(repository.synchronize).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'No se pudo evaluar un dispositivo; las demás evaluaciones continúan.',
    );
  });
  it('una base caída permite otro intento sin generar alertas ficticias ni filtrar el error', async () => {
    repository.candidates.mockRejectedValueOnce(new Error('private database detail'));
    await detector.scan();
    await detector.scan();
    expect(repository.synchronize).toHaveBeenCalledTimes(1);
    expect(Logger.prototype.warn).toHaveBeenCalledWith(
      'No se pudo evaluar la desconexión; se reintentará sin generar alertas ficticias.',
    );
  });
  it('pagina dispositivos por UUID en lotes acotados', async () => {
    const devices = Array.from({ length: 100 }, (_, i) => ({ id: String(i).padStart(3, '0') }));
    repository.candidates.mockResolvedValueOnce(devices).mockResolvedValueOnce([]);
    await detector.scan();
    expect(repository.candidates).toHaveBeenLastCalledWith(['real'], '099');
    expect(repository.synchronize).toHaveBeenCalledTimes(100);
  });
});
