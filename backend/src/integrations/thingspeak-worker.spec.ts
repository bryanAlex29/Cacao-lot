import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { ThingSpeakImportService } from './thingspeak-import.service';
import { ThingSpeakClient } from './thingspeak.client';
import { PrismaService } from '../database/prisma.service';
import { TelemetryService } from '../telemetry/telemetry.service';

jest.mock('node:fs/promises', () => ({ readFile: jest.fn() }));

const binding = {
  channelId: 3554501,
  ownerId: randomUUID(),
  plotId: randomUUID(),
  deviceId: randomUUID(),
  pollIntervalSeconds: 20,
};

describe('ThingSpeak worker scheduling', () => {
  const saved = { ...process.env };
  let worker: ThingSpeakImportService;
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.THINGSPEAK_IMPORT_ENABLED = 'true';
    jest.mocked(fs.readFile).mockResolvedValue(JSON.stringify(binding));
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    worker = new ThingSpeakImportService(
      {} as PrismaService,
      {} as TelemetryService,
      {} as ThingSpeakClient,
    );
  });
  afterEach(async () => {
    await worker?.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = { ...saved };
  });
  it('does not start if disabled', async () => {
    process.env.THINGSPEAK_IMPORT_ENABLED = 'false';
    const run = jest.spyOn(worker, 'runOnce');
    await worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).not.toHaveBeenCalled();
  });
  it('queries at 20s intervals and cancels on shutdown', async () => {
    const run = jest
      .spyOn(worker, 'runOnce')
      .mockResolvedValue({ status: 'duplicate', entryId: 1 });
    await worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(19999);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it('backs off after provider failure and resumes normally after recovery', async () => {
    const run = jest
      .spyOn(worker, 'runOnce')
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValue({ status: 'empty' });
    await worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(20000);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(20000);
    expect(run).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(20000);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('does not overlap a pending import and waits for it on shutdown', async () => {
    let complete!: (value: { status: 'empty' }) => void;
    const pending = new Promise<{ status: 'empty' }>((resolve) => {
      complete = resolve;
    });
    const run = jest.spyOn(worker, 'runOnce').mockReturnValue(pending);
    await worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).toHaveBeenCalledTimes(1);
    const stopped = worker.onModuleDestroy();
    complete({ status: 'empty' });
    await stopped;
    await jest.advanceTimersByTimeAsync(120000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
