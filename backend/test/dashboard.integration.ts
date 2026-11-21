import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, Page } from 'playwright-core';
import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { DevicesService } from '../src/devices/devices.service';

describe('Navegador real: simulador → NestJS → PostgreSQL → Socket.IO → Angular', () => {
  let app: INestApplication;
  let angular: ChildProcess;
  let browser: Browser;
  let page: Page;
  let frontendUrl: string;
  let apiUrl: string;
  let directory: string;
  let deviceId: string;
  let deviceKey: string;
  let plotId: string;
  const errors: string[] = [];
  const password = 'Browser-test!';

  const text = async (locator: string, expected: string, timeout = 10000) => {
    await page.waitForFunction(
      ({ locator, expected }) => document.querySelector(locator)?.textContent?.includes(expected),
      { locator, expected },
      { timeout },
    );
  };

  beforeAll(async () => {
    const name = new URL(process.env['DATABASE_URL'] ?? '').pathname.slice(1);
    if (!/^cacaosmart_test_[a-f0-9]{16}$/.test(name) || name !== process.env['TEST_DATABASE_NAME'])
      throw new Error('Solo base temporal del runner');
    const executablePath =
      process.env['BROWSER_EXECUTABLE_PATH'] ??
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    await access(executablePath);
    const port = await new Promise<number>((resolvePort, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('Puerto no disponible');
        server.close(() => resolvePort(address.port));
      });
    });
    frontendUrl = `http://127.0.0.1:${port}`;
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    module.get(ConfigService).set('CORS_ORIGIN', frontendUrl);
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    apiUrl = await app.getUrl();
    const db = app.get(PrismaService);
    const owner = await db.user.create({
      data: {
        name: 'Prueba de navegador',
        email: 'browser@example.test',
        passwordHash: await app.get(PasswordService).hash(password),
        role: 'FARMER',
      },
    });
    plotId = (
      await db.plot.create({
        data: {
          ownerId: owner.id,
          name: 'Cacao · Prueba aislada',
          locationLabel: 'Datos de prueba, no campo real',
        },
      })
    ).id;
    const device = await app.get(DevicesService).create(plotId, owner.id, {
      serial: 'browser-demo',
      source: 'demo',
      expectedIntervalSeconds: 5,
    });
    deviceId = device.id;
    deviceKey = device.deviceKey;
    directory = await mkdtemp(
      join(
        process.env['LOCALAPPDATA']
          ? join(process.env['LOCALAPPDATA'], 'Temp', 'opencode')
          : (process.env['TEMP'] ?? '.'),
        'cacaosmart-browser-',
      ),
    );
    const proxy = join(directory, 'proxy.json');
    await writeFile(
      proxy,
      JSON.stringify({
        '/api/**': { target: apiUrl, secure: false },
        '/socket.io/**': { target: apiUrl, secure: false, ws: true },
      }),
    );
    angular = spawn(
      process.execPath,
      [
        resolve(__dirname, '../../node_modules/@angular/cli/bin/ng.js'),
        'serve',
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--proxy-config',
        proxy,
      ],
      {
        cwd: resolve(__dirname, '../../frontend'),
        env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
        stdio: 'ignore',
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 160; attempt++) {
      if (angular.exitCode !== null) throw new Error('Angular de prueba terminó antes de iniciar');
      try {
        const response = await fetch(frontendUrl, { signal: AbortSignal.timeout(1000) });
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        /* Arranque aislado en curso. */
      }
      await delay(500);
    }
    if (!ready) throw new Error('Angular de prueba no inició en 80 segundos');
    browser = await chromium.launch({ executablePath, headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', (error) => errors.push(error.message));
  }, 120000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (angular && angular.exitCode === null) angular.kill();
    if (app) await app.close();
  });

  it('login, DEMO explícita y tres tarjetas actualizadas por el simulador', async () => {
    await page.goto(`${frontendUrl}/login`);
    await page.locator('#email').fill('browser@example.test');
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.getByRole('link', { name: 'Abrir panel de monitoreo' }).click();
    await page.getByLabel('Origen de telemetría', { exact: true }).selectOption('demo');
    await text('main', 'Canal en vivo: Conectado');
    expect(await page.getByLabel('Dispositivo de telemetría', { exact: true }).inputValue()).toBe(
      deviceId,
    );
    const code = `import {validateSimulatorConfig,simulatorPayload,sendWithRetry} from './scripts/simulator-core.mjs';let raw='';for await(const chunk of process.stdin)raw+=chunk;const c=validateSimulatorConfig(JSON.parse(raw));await sendWithRetry(c,simulatorPayload(c.deviceId,'browser',0,new Date().toISOString()));`;
    const exit = await new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
        cwd: resolve(__dirname, '../..'),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      child.once('error', reject);
      child.once('exit', resolveExit);
      child.stdin.end(
        JSON.stringify({
          source: 'demo',
          endpoint: `${apiUrl}/api/v1/iot/telemetry`,
          deviceId,
          deviceKey,
        }),
      );
    });
    expect(exit).toBe(0);
    await text('app-soil-sensor-card:nth-child(1)', '25');
    await text('app-soil-sensor-card:nth-child(2)', '45');
    await text('app-soil-sensor-card:nth-child(3)', '65');
    expect(await page.locator('app-soil-history-chart path').count()).toBe(3);
    expect(
      await app.get(PrismaService).reading.count({ where: { deviceId, eventId: 'sim:browser:0' } }),
    ).toBe(1);
    await page.screenshot({ path: join(directory, 'dashboard-desktop.png'), fullPage: true });
  }, 30000);

  const send = async (eventId: string, value: number, recordedAt: string | null = null) => {
    const response = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': deviceId,
        'X-Device-Key': deviceKey,
      },
      body: JSON.stringify({
        schemaVersion: '1.2',
        deviceId,
        eventId,
        recordedAt,
        soilMoisture: { soil_1: value, soil_2: 48, soil_3: null },
        temperatureC: 28,
        airHumidityPct: 70,
        rainDetected: false,
        valve: { relayCommandedOpen: true, feedbackOpen: null },
      }),
    });
    expect(response.status).toBe(201);
  };
  it('lectura parcial conserva otras zonas, cero y feedback físico desconocido', async () => {
    await send('browser-partial', 0);
    await text('app-soil-sensor-card:nth-child(1)', '0');
    await text('app-soil-sensor-card:nth-child(2)', '48');
    await text('app-soil-sensor-card:nth-child(3)', 'Sin datos');
    await text('.irrigation', 'Orden de apertura');
    await text('.irrigation-metrics', 'No disponible');
  });
  it('lectura atrasada no desplaza última lectura de Angular', async () => {
    await send('browser-old', 99, '2026-01-01T00:00:00Z');
    await delay(700);
    expect(
      await page.locator('app-soil-sensor-card').first().locator('strong').textContent(),
    ).not.toContain('99');
  });
  it('sin red conserva datos y al reconectar recupera la lectura perdida', async () => {
    await page.context().setOffline(true);
    await send('browser-missed', 37);
    await delay(1500);
    expect(
      await page.locator('app-soil-sensor-card').first().locator('strong').textContent(),
    ).not.toContain('37');
    await page.context().setOffline(false);
    await text('app-soil-sensor-card:nth-child(1)', '37', 25000);
    await text('main', 'Canal en vivo: Conectado', 15000);
  }, 45000);
  it('móvil sin desbordamiento, navegación y etiquetas visibles', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await delay(200);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible()).toBe(
      true,
    );
    expect(await page.locator('app-soil-sensor-card').count()).toBe(3);
    await page.screenshot({ path: join(directory, 'dashboard-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
    console.log(`Capturas sintéticas de prueba: ${directory}`);
  });
});
