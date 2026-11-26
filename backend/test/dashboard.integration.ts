import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, Page } from 'playwright-core';
import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, access, readFile, rm } from 'node:fs/promises';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { PrismaService } from '../src/database/prisma.service';
import { PasswordService } from '../src/auth/password.service';
import { DevicesService } from '../src/devices/devices.service';
import { ThresholdService } from '../src/sensor-thresholds/threshold.service';
import { getOptionsToken } from '@nestjs/throttler';
import { OfflineAlertRepository } from '../src/alerts/offline-alert.repository';
import { SourcePolicy } from '../src/integrations/source-policy.service';
import { PrivateImageStore } from '../src/ai-diagnostics/private-image.store';
import { MoistureRepository } from '../src/alerts/moisture/moisture.repository';
import type { SensorStatusEvent } from '@cacaosmart/contracts';
import { parsePersistenceInput } from '../src/prediction/offline/persistence-input';
import { syntheticRegressionRun } from './fixtures/regression-run';
import { publicationsFromRun } from '../src/prediction/regression-artifact';
import { registerRegressionPublication } from '../src/prediction/regression-registration';
import { createHash } from 'node:crypto';

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
  let soilSensorId: string;
  let adminPage: Page;
  let adminId: string;
  let adminSoilId: string;
  let adminDeviceId: string;
  let adminDeviceKey: string;
  const errors: string[] = [];
  const sensorListeners = new Set<(event: SensorStatusEvent) => void>();
  const waitForSensor = (predicate: (event: SensorStatusEvent) => boolean) =>
    new Promise<SensorStatusEvent>((resolve, reject) => {
      const timer = setTimeout(() => {
        sensorListeners.delete(listener);
        reject(new Error('El navegador no recibió sensor.status esperado'));
      }, 12000);
      const listener = (event: SensorStatusEvent) => {
        if (!predicate(event)) return;
        clearTimeout(timer);
        sensorListeners.delete(listener);
        resolve(event);
      };
      sensorListeners.add(listener);
    });
  const unexpectedRateLimits: string[] = [];
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
    directory = await mkdtemp(
      join(
        process.env['LOCALAPPDATA']
          ? join(process.env['LOCALAPPDATA'], 'Temp', 'opencode')
          : (process.env['TEMP'] ?? '.'),
        'cacaosmart-browser-',
      ),
    );
    process.env['IMAGE_STORAGE_PATH'] = join(directory, 'private-ai-images');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      // Only this isolated browser matrix needs a larger budget. The APP_GUARD useClass binding
      // is not replaced by overrideGuard(ThrottlerGuard); override its options provider instead.
      // Production settings and security.integration rate-limit assertions remain unchanged.
      .overrideProvider(getOptionsToken())
      .useValue([{ name: 'default', ttl: 60000, limit: 10000 }])
      .compile();
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
        role: 'ADMIN',
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
    // Synthetic ranges configured while the fixture owner is ADMIN. Browser logs in as FARMER.
    const thresholds = app.get(ThresholdService);
    for (const sensor of device.sensors) {
      if (sensor.code === 'soil_1') soilSensorId = sensor.id;
      if (sensor.code === 'soil_3' || sensor.code === 'rainDetected') continue;
      if (sensor.variable === 'TEMPERATURE') {
        await thresholds.put(sensor.id, owner.id, {
          variable: 'TEMPERATURE',
          unit: 'CELSIUS',
          minValue: 18,
          maxValue: 34,
          expectedVersion: 0,
        });
      } else {
        await thresholds.put(sensor.id, owner.id, {
          variable: sensor.variable === 'AIR_HUMIDITY' ? 'AIR_HUMIDITY' : 'SOIL_MOISTURE',
          unit: 'PERCENT',
          minValue: sensor.code === 'soil_1' ? 0 : 30,
          maxValue: 75,
          expectedVersion: 0,
        });
      }
    }
    await db.user.update({ where: { id: owner.id }, data: { role: 'FARMER' } });
    const admin = await db.user.create({
      data: {
        name: 'Editor de rangos',
        email: 'range-editor@example.test',
        passwordHash: await app.get(PasswordService).hash(password),
        role: 'ADMIN',
      },
    });
    adminId = admin.id;
    const adminPlot = await db.plot.create({
      data: { ownerId: admin.id, name: 'Rangos · Prueba aislada', locationLabel: 'DEMO de prueba' },
    });
    const adminDevice = await app.get(DevicesService).create(adminPlot.id, admin.id, {
      serial: 'browser-editor-demo',
      source: 'demo',
      expectedIntervalSeconds: 5,
    });
    adminSoilId = adminDevice.sensors.find((sensor) => sensor.code === 'soil_1')!.id;
    adminDeviceId = adminDevice.id;
    adminDeviceKey = adminDevice.deviceKey;
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
    const mainContext = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
    page = await mainContext.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() === 429) unexpectedRateLimits.push(new URL(response.url()).pathname);
    });
  }, 120000);
  afterAll(async () => {
    if (browser) await browser.close();
    if (angular && angular.exitCode === null) angular.kill();
    if (app) await app.close();
    if (directory) await rm(join(directory, 'private-ai-images'), { recursive: true, force: true });
    delete process.env['IMAGE_STORAGE_PATH'];
  });

  it('login y sensor 1 visible; contrato DEMO conserva las tres sondas del simulador', async () => {
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
    expect(await page.locator('app-soil-sensor-card').count()).toBe(1);
    expect(await page.locator('app-soil-history-chart path').count()).toBe(1);
    const stored = await app.get(PrismaService).soilReading.findMany({
      where: { reading: { deviceId, eventId: 'sim:browser:0' } },
      select: { moisturePct: true, sensor: { select: { code: true } } },
      orderBy: { sensor: { code: 'asc' } },
    });
    expect(stored.map((row) => [row.sensor.code, row.moisturePct])).toEqual([
      ['soil_1', 25],
      ['soil_2', 45],
      ['soil_3', 65],
    ]);
    await page.locator('app-page-header .connection-badge.healthy').waitFor();
    expect(await page.locator('app-page-header .connection-badge').textContent()).toContain('DEMO');
    expect(
      await app.get(PrismaService).reading.count({ where: { deviceId, eventId: 'sim:browser:0' } }),
    ).toBe(1);
    await page.screenshot({ path: join(directory, 'dashboard-desktop.png'), fullPage: true });
  }, 30000);

  it('FARMER descarga CSV DEMO con filtros, conserva sesión y recupera errores de exportación', async () => {
    const path = new URL(page.url()).pathname;
    await page.getByRole('link', { name: 'Reportes', exact: true }).click();
    await page.waitForURL((url) => url.pathname === path && url.hash === '#reports');
    const panel = page.locator('app-reports-panel');
    await panel.getByRole('button', { name: '24 h', exact: true }).click();
    for (const [button, kind] of [
      ['Descargar lecturas CSV', 'readings'],
      ['Descargar riego observado CSV', 'irrigation-events'],
    ] as const) {
      const pending = page.waitForEvent('download');
      await panel.getByRole('button', { name: button, exact: true }).click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe(`cacaosmart-${kind}-demo.csv`);
      const target = join(directory, `${kind}-demo.csv`);
      await download.saveAs(target);
      const csv = await readFile(target, 'utf8');
      expect(csv).toContain('"demo"');
      expect(csv).toContain('sim:browser:0');
      expect(csv).toContain('"null"');
      expect(csv).not.toMatch(/credentialHash|passwordHash|liters|duration/);
    }
    await page.route('**/reports/readings.csv?*', (route) =>
      route.fulfill({ status: 413, body: '{}' }),
    );
    await panel.getByRole('button', { name: 'Descargar lecturas CSV', exact: true }).click();
    await text('app-reports-panel [role="alert"]', 'Reduce el periodo');
    await page.unroute('**/reports/readings.csv?*');
    await panel.getByLabel('Desde (hora local)', { exact: true }).fill('2026-01-01T00:00');
    await panel.getByLabel('Hasta (hora local)', { exact: true }).fill('2026-01-02T00:00');
    const emptyDownload = page.waitForEvent('download');
    await panel.getByRole('button', { name: 'Descargar lecturas CSV', exact: true }).click();
    const empty = await emptyDownload;
    await empty.saveAs(join(directory, 'readings-empty.csv'));
    expect(
      (await readFile(join(directory, 'readings-empty.csv'), 'utf8')).split('\r\n'),
    ).toHaveLength(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: join(directory, 'reports-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
    expect(await page.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
  }, 30000);

  it('consulta historial observado DEMO sin control remoto, recupera errores y conserva sesión al abrir Riego', async () => {
    const initial = new URL(page.url()).pathname;
    await page.getByRole('link', { name: 'Riego', exact: true }).click();
    await page.waitForURL((url) => url.pathname === initial && url.hash === '#irrigation-history');
    const panel = page.locator('app-irrigation-history');
    await text('app-irrigation-history', 'DEMO');
    await panel
      .getByRole('button', { name: 'Consultar / actualizar historial', exact: true })
      .click();
    await text('app-irrigation-history tbody', 'Primera observación');
    await text('app-irrigation-history tbody', 'Orden de apertura');
    await text('app-irrigation-history tbody', 'Sin confirmación');
    const fail = '**/irrigation-events?*';
    await page.route(fail, (route) => route.fulfill({ status: 503, body: '{}' }));
    await panel
      .getByRole('button', { name: 'Consultar / actualizar historial', exact: true })
      .click();
    await text('app-irrigation-history', 'No se pudo consultar');
    expect(await panel.locator('tbody').count()).toBe(0);
    await page.unroute(fail);
    await panel.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await text('app-irrigation-history tbody', 'Primera observación');
    await panel.getByRole('button', { name: '7 días', exact: true }).click();
    await text('app-irrigation-history tbody', 'Primera observación');
    expect(await page.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: join(directory, 'irrigation-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
  }, 30000);

  it('historial consultado recibe cambios en vivo y recupera por REST una observación perdida al reconectar', async () => {
    const publish = async (eventId: string, relayCommandedOpen: boolean) => {
      const result = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
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
          recordedAt: null,
          soilMoisture: { soil_1: 25, soil_2: 45, soil_3: 65 },
          temperatureC: 26,
          airHumidityPct: 70,
          rainDetected: false,
          valve: { relayCommandedOpen, feedbackOpen: null },
        }),
      });
      expect(result.status).toBe(201);
    };
    await text('main', 'Canal en vivo: Conectado');
    const refreshed = page.waitForResponse(
      (r) => r.url().includes('/irrigation-events?') && r.status() === 200,
    );
    await publish('browser-irrigation-live-close', false);
    await refreshed;
    const close = page.locator('[data-event-id="browser-irrigation-live-close"]');
    await close.waitFor();
    expect(await close.textContent()).toContain('Orden de cierre');
    expect(await close.textContent()).toContain('Sin confirmación');
    await page.context().setOffline(true);
    try {
      await delay(500);
      await publish('browser-irrigation-missed-open', true);
      await delay(500);
      expect(await page.locator('[data-event-id="browser-irrigation-missed-open"]').count()).toBe(
        0,
      );
    } finally {
      await page.context().setOffline(false);
    }
    await text('main', 'Canal en vivo: Conectado', 25000);
    await page
      .locator('[data-event-id="browser-irrigation-missed-open"]')
      .waitFor({ timeout: 25000 });
    await text('.irrigation-body', 'Orden de apertura');
    await page.screenshot({ path: join(directory, 'irrigation-realtime.png'), fullPage: true });
    expect(errors).toEqual([]);
  }, 45000);

  it.each([
    ['Alertas', 'alerts'],
    ['Monitoreo', 'readings'],
    ['Historial', 'history'],
  ])(
    'abrir %s conserva sesión, parcela y dispositivo sin navegación de documento, incluso al repetir el clic',
    async (label, fragment) => {
      const initial = new URL(page.url());
      const selectedDevice = await page
        .getByLabel('Dispositivo de telemetría', { exact: true })
        .inputValue();
      const documentRequests: string[] = [];
      const listener = (req: import('playwright-core').Request) => {
        if (req.isNavigationRequest() && req.frame() === page.mainFrame())
          documentRequests.push(req.url());
      };
      page.on('request', listener);
      try {
        await page.getByRole('link', { name: label, exact: true }).click();
        await page.waitForURL(
          (url) => url.pathname === initial.pathname && url.hash === `#${fragment}`,
        );
        expect(new URL(page.url()).search).toBe(initial.search);
        await page.waitForFunction((id) => {
          const panel = document.getElementById(id);
          return (
            panel &&
            document.activeElement === panel &&
            panel.getBoundingClientRect().top < innerHeight
          );
        }, fragment);
        expect(await page.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
        expect(await page.locator('#email').count()).toBe(0);
        expect(
          await page.getByLabel('Dispositivo de telemetría', { exact: true }).inputValue(),
        ).toBe(selectedDevice);
        expect(await page.getByLabel('Origen de telemetría', { exact: true }).inputValue()).toBe(
          'demo',
        );
        const response = page.waitForResponse(
          (res) => res.url().includes(`/plots/${plotId}/alerts?`) && res.status() === 200,
        );
        await page
          .locator('app-offline-alerts-panel')
          .getByRole('button', { name: 'Actualizar alertas', exact: true })
          .click();
        await response;
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await page.getByRole('link', { name: label, exact: true }).click();
        await page.waitForFunction(
          (id) => document.activeElement === document.getElementById(id),
          fragment,
        );
        expect(new URL(page.url()).pathname).toBe(initial.pathname);
        expect(documentRequests).toEqual([]);
      } finally {
        page.off('request', listener);
      }
    },
  );

  it('FARMER ve rangos DEMO independientes, unidades y ausencia explícita sin formulario', async () => {
    await text('app-soil-sensor-card:nth-child(1) app-sensor-range', 'Mín. 0 %');
    await text('.environment app-sensor-range', 'Mín. 18 °C');
    expect(await page.locator('app-sensor-range').count()).toBe(3);
    expect(await page.locator('.rain app-sensor-range').count()).toBe(0);
    expect(
      await page.locator('app-sensor-range input, app-sensor-range-editor input').count(),
    ).toBe(0);
    expect(await page.getByRole('button', { name: 'Configurar rango', exact: true }).count()).toBe(
      0,
    );
    expect(await page.locator('app-soil-sensor-card').first().textContent()).toContain(
      'Sin calibrar',
    );
    expect(await page.locator('main').textContent()).toContain('DEMO · Datos simulados');
  });

  it('fallo de un rango no oculta mediciones ni otros rangos y permite reintentar', async () => {
    const pattern = `**/api/v1/sensors/${soilSensorId}/thresholds`;
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    try {
      await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
      await text(
        'app-soil-sensor-card:nth-child(1) app-sensor-range',
        'No se pudo consultar el rango',
      );
      expect(
        await page.locator('app-soil-sensor-card').first().locator('strong').textContent(),
      ).toContain('25');
      await text('.environment app-sensor-range', 'Mín. 18 °C');
    } finally {
      await page.unroute(pattern);
    }
    await page.getByRole('button', { name: 'Reintentar rangos', exact: true }).click();
    await text('app-soil-sensor-card:nth-child(1) app-sensor-range', 'Mín. 0 %');
    expect(await page.getByRole('button', { name: 'Reintentar rangos', exact: true }).count()).toBe(
      0,
    );
  });

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
    expect(await page.locator('app-soil-sensor-card').count()).toBe(1);
    const stored = await app.get(PrismaService).soilReading.findMany({
      where: { reading: { deviceId, eventId: 'browser-partial' } },
      select: { moisturePct: true, sensor: { select: { code: true } } },
      orderBy: { sensor: { code: 'asc' } },
    });
    expect(stored.map((row) => [row.sensor.code, row.moisturePct])).toEqual([
      ['soil_1', 0],
      ['soil_2', 48],
      ['soil_3', null],
    ]);
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
    const menu = page.getByRole('button', { name: 'Menú', exact: true });
    expect(await menu.getAttribute('aria-expanded')).toBe('false');
    await menu.click();
    await page.locator('.menu-toggle[aria-expanded="true"]').waitFor();
    expect(await menu.getAttribute('aria-expanded')).toBe('true');
    expect(await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible()).toBe(
      true,
    );
    await menu.click();
    await page
      .getByRole('navigation', { name: 'Navegación principal' })
      .waitFor({ state: 'hidden' });
    expect(await page.getByRole('navigation', { name: 'Navegación principal' }).isVisible()).toBe(
      false,
    );
    expect(await page.locator('app-soil-sensor-card').count()).toBe(1);
    await page.screenshot({ path: join(directory, 'dashboard-mobile.png'), fullPage: true });
    expect(errors).toEqual([]);
    console.log(`Capturas sintéticas de prueba: ${directory}`);
  });

  it('ADMIN propietario crea un rango desde móvil, valida y actualiza la tarjeta y auditoría', async () => {
    adminPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    adminPage.on('websocket', (socket) =>
      socket.on('framereceived', ({ payload }) => {
        const frame = payload.toString();
        if (!frame.startsWith('42/telemetry,')) return;
        const [name, value] = JSON.parse(frame.slice(frame.indexOf('['))) as [
          string,
          SensorStatusEvent,
        ];
        if (name === 'sensor.status') for (const listener of sensorListeners) listener(value);
      }),
    );
    adminPage.on('pageerror', (error) => errors.push(error.message));
    adminPage.on('response', (response) => {
      if (response.status() === 429) unexpectedRateLimits.push(new URL(response.url()).pathname);
    });
    await adminPage.goto(`${frontendUrl}/login`);
    await adminPage.locator('#email').fill('range-editor@example.test');
    await adminPage.locator('#password').fill(password);
    await adminPage.getByRole('button', { name: 'Iniciar sesión' }).click();
    await adminPage.getByRole('link', { name: 'Abrir panel de monitoreo' }).click();
    await adminPage.getByLabel('Origen de telemetría', { exact: true }).selectOption('demo');
    const button = adminPage
      .locator('app-soil-sensor-card')
      .first()
      .getByRole('button', { name: 'Configurar rango' });
    await button.click();
    const dialog = adminPage.getByRole('dialog');
    await dialog.waitFor({ state: 'visible' });
    expect(await adminPage.getByLabel('Mínimo (%)', { exact: true }).inputValue()).toBe('');
    await adminPage.getByLabel('Mínimo (%)', { exact: true }).fill('70');
    await adminPage.getByLabel('Máximo (%)', { exact: true }).fill('20');
    await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).click();
    expect(await dialog.getByRole('alert').textContent()).toContain('mínimo debe ser menor');
    expect(
      await app.get(PrismaService).sensorThreshold.count({ where: { sensorId: adminSoilId } }),
    ).toBe(0);
    await adminPage.getByLabel('Mínimo (%)', { exact: true }).fill('0');
    await adminPage.getByLabel('Máximo (%)', { exact: true }).fill('100');
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await adminPage.screenshot({
      path: join(directory, 'range-editor-mobile.png'),
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await adminPage
      .locator('app-soil-sensor-card')
      .first()
      .getByText('Máx. 100 %', { exact: false })
      .waitFor();
    const stored = await app
      .get(PrismaService)
      .sensorThreshold.findFirstOrThrow({ where: { sensorId: adminSoilId } });
    expect(stored).toMatchObject({ minValue: 0, maxValue: 100, version: 1, updatedBy: adminId });
    expect(
      await app.get(PrismaService).sensorThresholdAudit.count({ where: { sensorId: adminSoilId } }),
    ).toBe(1);
  }, 30000);

  it('una edición concurrente conserva el borrador, exige revisión y usa la nueva versión', async () => {
    await adminPage.setViewportSize({ width: 1440, height: 1050 });
    await adminPage
      .locator('app-soil-sensor-card')
      .first()
      .getByRole('button', { name: 'Configurar rango' })
      .click();
    const dialog = adminPage.getByRole('dialog');
    await adminPage.getByLabel('Mínimo (%)', { exact: true }).fill('3');
    await adminPage.getByLabel('Máximo (%)', { exact: true }).fill('70');
    await app.get(ThresholdService).put(adminSoilId, adminId, {
      variable: 'SOIL_MOISTURE',
      unit: 'PERCENT',
      minValue: 12,
      maxValue: 80,
      expectedVersion: 1,
    });
    await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).click();
    await dialog.getByText('Otra edición modificó este rango.', { exact: false }).waitFor();
    expect(await adminPage.getByLabel('Mínimo (%)', { exact: true }).inputValue()).toBe('3');
    expect(
      await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).isDisabled(),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Consultar rango actual', exact: true }).click();
    await dialog.getByRole('region', { name: 'Rango actual del servidor' }).waitFor();
    expect(await adminPage.getByLabel('Mínimo (%)', { exact: true }).inputValue()).toBe('3');
    await adminPage.screenshot({
      path: join(directory, 'range-editor-conflict.png'),
      fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Usar rango actual en el formulario' }).click();
    expect(await adminPage.getByLabel('Mínimo (%)', { exact: true }).inputValue()).toBe('12');
    await adminPage.getByLabel('Mínimo (%)', { exact: true }).fill('15');
    await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await adminPage
      .locator('app-soil-sensor-card')
      .first()
      .getByText('Mín. 15 %', { exact: false })
      .waitFor();
    const db = app.get(PrismaService);
    const audits = await db.sensorThresholdAudit.findMany({
      where: { sensorId: adminSoilId },
      orderBy: { version: 'asc' },
    });
    expect(audits.map((audit) => audit.version)).toEqual([1, 2, 3]);
    expect(audits[2].oldValue).toEqual(audits[1].newValue);
    expect(await db.sensorThreshold.findFirst({ where: { sensorId: adminSoilId } })).toMatchObject({
      minValue: 15,
      maxValue: 80,
      version: 3,
    });
  });

  it('un guardado sin confirmación no se reenvía y Cancelar no modifica el rango', async () => {
    const pattern = `**/api/v1/sensors/${adminSoilId}/thresholds`;
    let writes = 0;
    await adminPage.route(pattern, async (route) => {
      if (route.request().method() === 'PUT') {
        writes++;
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      } else await route.continue();
    });
    try {
      await adminPage
        .locator('app-soil-sensor-card')
        .first()
        .getByRole('button', { name: 'Configurar rango' })
        .click();
      const dialog = adminPage.getByRole('dialog');
      await adminPage.getByLabel('Mínimo (%)', { exact: true }).fill('25');
      await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).click();
      await dialog.getByText('Puede haberse aplicado', { exact: false }).waitFor();
      expect(writes).toBe(1);
      expect(
        await dialog.getByRole('button', { name: 'Guardar rango', exact: true }).isDisabled(),
      ).toBe(true);
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await dialog.waitFor({ state: 'detached' });
      expect(
        await app
          .get(PrismaService)
          .sensorThreshold.findFirst({ where: { sensorId: adminSoilId } }),
      ).toMatchObject({ minValue: 15, version: 3 });
      expect(
        await app
          .get(PrismaService)
          .sensorThresholdAudit.count({ where: { sensorId: adminSoilId } }),
      ).toBe(3);
    } finally {
      await adminPage.unroute(pattern);
    }
  });

  it('Socket.IO actualiza sensor 1 y ambiente sin inferir calibración', async () => {
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
        eventId: 'classification-five',
        recordedAt: null,
        soilMoisture: { soil_1: 90, soil_2: 5, soil_3: 50 },
        temperatureC: 35,
        airHumidityPct: 0,
        rainDetected: false,
        valve: { relayCommandedOpen: false, feedbackOpen: null },
      }),
    });
    expect(response.status).toBe(201);
    await page
      .locator('app-soil-sensor-card:nth-child(1) .assessment[data-comparison="high"]')
      .waitFor();
    expect(await page.locator('app-soil-sensor-card').count()).toBe(1);
    await page
      .locator('.environment app-sensor-assessment')
      .nth(0)
      .locator('[data-comparison="high"]')
      .waitFor();
    await page
      .locator('.environment app-sensor-assessment')
      .nth(1)
      .locator('[data-comparison="low"]')
      .waitFor();
    expect(await page.locator('app-soil-sensor-card').first().textContent()).toContain(
      'Sin calibrar',
    );
    expect(await page.locator('app-soil-sensor-card').first().textContent()).toContain(
      'DEMO · Comparación simulada',
    );
    expect(await page.locator('.environment strong').nth(1).textContent()).toContain('0');
    expect(await page.locator('.rain app-sensor-assessment').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: join(directory, 'classification-mobile.png'), fullPage: true });
  });

  // Includes several serialized SQL/REST round trips when PostgreSQL is remote.
  it('guardar un rango reclasifica la lectura actual sin crear otra lectura ni tocar el histórico', async () => {
    const response = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': adminDeviceId,
        'X-Device-Key': adminDeviceKey,
      },
      body: JSON.stringify({
        schemaVersion: '1.2',
        deviceId: adminDeviceId,
        eventId: 'classification-range-edit',
        recordedAt: null,
        soilMoisture: { soil_1: 50, soil_2: null, soil_3: null },
        temperatureC: null,
        airHumidityPct: null,
        rainDetected: null,
        valve: { relayCommandedOpen: null, feedbackOpen: null },
      }),
    });
    expect(response.status).toBe(201);
    const first = adminPage.locator('app-soil-sensor-card').first();
    await first.locator('[data-comparison="within"]').waitFor();
    const db = app.get(PrismaService);
    const before = await db.reading.count({ where: { deviceId: adminDeviceId } });
    await first.getByRole('button', { name: 'Configurar rango' }).click();
    await adminPage.getByLabel('Máximo (%)', { exact: true }).fill('45');
    await adminPage
      .getByRole('dialog')
      .getByRole('button', { name: 'Guardar rango', exact: true })
      .click();
    await first.locator('[data-comparison="high"]').waitFor();
    expect(await first.locator('strong').textContent()).toContain('50');
    expect(await first.textContent()).toContain('Sin calibrar');
    expect(await db.reading.count({ where: { deviceId: adminDeviceId } })).toBe(before);
    expect(await adminPage.locator('app-soil-history-chart line[stroke="red"]').count()).toBe(0);
    await adminPage.screenshot({
      path: join(directory, 'classification-desktop.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  }, 60000);

  it('el gráfico conserva el rango vigente al medir y añade otra vigencia solo al llegar datos posteriores', async () => {
    const chart = adminPage.locator('app-soil-history-chart');
    await chart
      .locator('line[data-sensor="soil_1"][data-version="3"][data-bound="max"]')
      .waitFor({ state: 'attached' });
    expect(await chart.locator('line[data-version="4"]').count()).toBe(0);
    expect(await chart.locator('line[data-version="3"][data-bound="max"]').getAttribute('y1')).toBe(
      '66',
    ); // 80%, not today's 45%.
    const before = await app
      .get(PrismaService)
      .reading.count({ where: { deviceId: adminDeviceId } });
    const response = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': adminDeviceId,
        'X-Device-Key': adminDeviceKey,
      },
      body: JSON.stringify({
        schemaVersion: '1.2',
        deviceId: adminDeviceId,
        eventId: 'history-after-range-edit',
        recordedAt: null,
        soilMoisture: { soil_1: 40, soil_2: 55, soil_3: null },
        temperatureC: null,
        airHumidityPct: null,
        rainDetected: null,
        valve: { relayCommandedOpen: null, feedbackOpen: null },
      }),
    });
    expect(response.status).toBe(201);
    await chart.locator('line[data-version="4"][data-bound="max"]').waitFor({ state: 'attached' });
    expect(await chart.locator('line[data-version="3"][data-bound="max"]').getAttribute('y1')).toBe(
      '66',
    );
    expect(await chart.locator('line[data-version="4"][data-bound="max"]').getAttribute('y1')).toBe(
      '129',
    ); // 45%.
    const endOld = Number(
      await chart.locator('line[data-version="3"][data-bound="max"]').getAttribute('x2'),
    );
    const startNew = Number(
      await chart.locator('line[data-version="4"][data-bound="max"]').getAttribute('x1'),
    );
    expect(endOld).toBeCloseTo(startNew, 5);
    expect(startNew).toBeGreaterThan(45);
    expect(startNew).toBeLessThan(665);
    expect(await chart.locator('svg path').count()).toBe(1);
    expect(await app.get(PrismaService).reading.count({ where: { deviceId: adminDeviceId } })).toBe(
      before + 1,
    );
    await chart.getByText('Ver vigencia y límites históricos', { exact: true }).click();
    expect(await chart.locator('.threshold-table table').textContent()).toContain(
      'Sin rango configurado',
    );
    for (const name of ['7 días', '30 días', '24 h']) {
      const refreshed = adminPage.waitForResponse(
        (response) =>
          response.url().includes(`/sensors/${adminSoilId}/thresholds/history?`) &&
          response.status() === 200,
      );
      await adminPage
        .getByLabel('Intervalo histórico')
        .getByRole('button', { name, exact: true })
        .click();
      await refreshed;
      await chart.locator('line[data-version="4"]').first().waitFor({ state: 'attached' });
    }
    await chart
      .locator('.range-status')
      .getByText('Zona A · Rangos por vigencia', { exact: true })
      .waitFor();
    await adminPage.screenshot({
      path: join(directory, 'historical-thresholds-desktop.png'),
      fullPage: true,
    });
  });

  it('fallo del historial no oculta mediciones, permite reintento y mantiene móvil sin desbordamiento', async () => {
    const chart = adminPage.locator('app-soil-history-chart');
    const pattern = `**/api/v1/sensors/${adminSoilId}/thresholds/history?*`;
    await adminPage.route(pattern, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    try {
      await adminPage.getByRole('button', { name: 'Actualizar', exact: true }).click();
      await chart
        .getByText('Zona A · Rangos históricos no disponibles', { exact: false })
        .waitFor();
      expect(await chart.locator('line[data-sensor="soil_1"]').count()).toBe(0);
      expect(await chart.locator('svg path').count()).toBe(1);
      expect(
        await adminPage.locator('app-soil-sensor-card').first().locator('strong').textContent(),
      ).toContain('40');
    } finally {
      await adminPage.unroute(pattern);
    }
    await chart.getByRole('button', { name: 'Reintentar rangos históricos', exact: true }).click();
    await chart.locator('line[data-version="4"]').first().waitFor({ state: 'attached' });
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await adminPage.screenshot({
      path: join(directory, 'historical-thresholds-mobile.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

  it('paginar a lecturas anteriores a la configuración no arrastra los límites de la página reciente', async () => {
    // Seed a historical page in the disposable DB without flooding HTTP or the live Socket.IO room.
    // Ingestion -> Socket.IO is already exercised above; this case tests REST pagination and ranges.
    const base = Date.now() - 12 * 3600000;
    const db = app.get(PrismaService);
    const sensors = await db.sensor.findMany({
      where: { deviceId: adminDeviceId, variable: 'SOIL_MOISTURE' },
    });
    await db.$transaction(async (tx) => {
      const rows = await tx.reading.createManyAndReturn({
        data: Array.from({ length: 101 }, (_, i) => ({
          deviceId: adminDeviceId,
          eventId: `history-old-page-${i}`,
          source: 'demo' as const,
          recordedAt: new Date(base + i * 5000),
          effectiveAt: new Date(base + i * 5000),
          receivedAt: new Date(),
          timestampOrigin: 'device',
          payloadHash: '0'.repeat(64),
          quality: {
            soil_1: 'uncalibrated',
            soil_2: 'uncalibrated',
            soil_3: 'missing',
            temperatureC: 'missing',
            airHumidityPct: 'missing',
            rainDetected: 'missing',
            relayCommandedOpen: 'missing',
            feedbackOpen: 'missing',
          },
        })),
      });
      await tx.soilReading.createMany({
        data: rows.flatMap((row) =>
          sensors.map((sensor) => ({
            readingId: row.id,
            sensorId: sensor.id,
            moisturePct: sensor.code === 'soil_3' ? null : 50,
            quality: sensor.code === 'soil_3' ? ('missing' as const) : ('uncalibrated' as const),
          })),
        ),
      });
    });
    const refreshed = adminPage.waitForResponse(
      (response) => response.url().includes('/readings?') && response.status() === 200,
    );
    await adminPage.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await refreshed;
    const chart = adminPage.locator('app-soil-history-chart');
    await adminPage.waitForFunction(
      () => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (b) => b.textContent?.trim() === 'Más antiguas',
        );
        return button && !button.disabled;
      },
      undefined,
      { timeout: 7000 },
    );
    await adminPage.getByRole('button', { name: 'Más antiguas', exact: true }).click();
    await chart
      .getByText('Zona A · Sin rango configurado en este periodo', { exact: false })
      .waitFor({ timeout: 7000 });
    expect(await chart.locator('line[data-threshold]').count()).toBe(0);
    expect(await chart.locator('svg path').count()).toBe(1);
    expect(
      await adminPage.locator('app-soil-sensor-card').first().locator('strong').textContent(),
    ).toContain('40');
    await adminPage.getByRole('button', { name: 'Más recientes', exact: true }).click();
    await chart
      .locator('line[data-version="4"]')
      .first()
      .waitFor({ state: 'attached', timeout: 7000 });
    expect(errors).toEqual([]);
  }, 30000);

  it('FARMER ve y reconoce la desconexión DEMO sin cerrar la condición ni duplicar episodios', async () => {
    // Only fixture timestamps in the runner-owned temporary DB; never stop the user's simulator.
    const db = app.get(PrismaService);
    await db.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(Date.now() - 30000) },
    });
    const repository = app.get(OfflineAlertRepository);
    const allowed = (source: 'real' | 'demo') => app.get(SourcePolicy).allows(source);
    await repository.synchronize(deviceId, allowed);
    const active = await db.offlineAlert.findFirstOrThrow({ where: { deviceId, closedAt: null } });
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await text('main', 'Dispositivo desconectado');
    await page
      .locator('app-soil-history-chart .range-status')
      .getByText('Zona A · Rangos por vigencia', { exact: true })
      .waitFor();
    const panel = page.locator('app-offline-alerts-panel');
    await panel.getByRole('button', { name: 'Actualizar alertas', exact: true }).click();
    const episode = panel.locator(`[data-alert-id="${active.id}"]`);
    await episode.getByText('Desconexión detectada · condición activa', { exact: false }).waitFor();
    const evidence = episode.locator('.alert-evidence');
    expect(await evidence.getAttribute('open')).toBeNull();
    const evidenceToggle = evidence.locator('summary');
    await evidenceToggle.focus();
    await evidenceToggle.press('Enter');
    await evidence.getByText('Último contacto de ese episodio:', { exact: false }).waitFor();
    await evidenceToggle.press('Enter');
    await evidence
      .getByText('Último contacto de ese episodio:', { exact: false })
      .waitFor({ state: 'hidden' });
    expect(await panel.textContent()).toContain('DEMO · Alertas de demostración');
    const before = await db.offlineAlert.count({ where: { deviceId } });
    await episode.getByRole('button', { name: 'Reconocer alerta', exact: true }).click();
    await episode.getByText('Reconocida', { exact: false }).waitFor();
    expect(await episode.textContent()).toContain('condición activa');
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: active.id } })).closedAt,
    ).toBeNull();
    await repository.synchronize(deviceId, allowed);
    expect(await db.offlineAlert.count({ where: { deviceId } })).toBe(before);
    expect(await page.getByRole('button', { name: 'Configurar rango', exact: true }).count()).toBe(
      0,
    );
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.screenshot({ path: join(directory, 'offline-alert-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: join(directory, 'offline-alert-mobile.png'), fullPage: true });
  });

  it('un mensaje nuevo restablece el contacto y conserva la alerta reconocida en el historial', async () => {
    const db = app.get(PrismaService);
    const active = await db.offlineAlert.findFirstOrThrow({ where: { deviceId, closedAt: null } });
    const count = await db.offlineAlert.count({ where: { deviceId } });
    await send('offline-contact-restored', 45);
    await app
      .get(OfflineAlertRepository)
      .synchronize(deviceId, (source) => app.get(SourcePolicy).allows(source));
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: active.id } })).closeReason,
    ).toBe('CONTACT_RESTORED');
    const panel = page.locator('app-offline-alerts-panel');
    await panel.getByRole('button', { name: 'Actualizar alertas', exact: true }).click();
    const episode = panel.locator(`[data-alert-id="${active.id}"]`);
    await episode.getByText('Contacto restablecido', { exact: false }).waitFor({ timeout: 7000 });
    expect(await episode.textContent()).toContain('Reconocida');
    expect(await db.offlineAlert.count({ where: { deviceId } })).toBe(count);
    expect(
      (await db.offlineAlert.findUniqueOrThrow({ where: { id: active.id } })).closeReason,
    ).toBe('CONTACT_RESTORED');
  });

  it('un error de alertas no oculta mediciones; cambiar origen limpia el panel sin fallback', async () => {
    const pattern = `**/api/v1/plots/${plotId}/alerts?*`;
    const panel = page.locator('app-offline-alerts-panel');
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    try {
      await panel.getByRole('button', { name: 'Actualizar alertas', exact: true }).click();
      await panel.getByRole('alert').waitFor();
      expect(await panel.textContent()).not.toContain('Sin alertas de desconexión registradas');
      await text('app-soil-sensor-card:nth-child(1) strong', '45');
      expect(await page.locator('app-soil-history-chart svg path').count()).toBe(1);
    } finally {
      await page.unroute(pattern);
    }
    await page.getByLabel('Origen de telemetría', { exact: true }).selectOption('real');
    await panel
      .getByText('Selecciona un dispositivo para consultar sus alertas.', { exact: true })
      .waitFor();
    expect(await panel.locator('[data-alert-id]').count()).toBe(0);
    await page.getByLabel('Origen de telemetría', { exact: true }).selectOption('demo');
    await panel.locator('[data-alert-id]').first().waitFor();
    expect(errors).toEqual([]);
    expect(unexpectedRateLimits).toEqual([]);
  });

  it('ADMIN configura margen sin defaults; tres lecturas DEMO generan alerta y reconocer no recupera', async () => {
    adminPage.setDefaultTimeout(7000);
    const db = app.get(PrismaService);
    const panel = adminPage.locator('app-moisture-alerts-panel');
    await panel.getByText('Configuración de alertas · Sensor 1', { exact: true }).click();
    const policy = panel.locator('app-moisture-policy').first();
    await policy.getByRole('button', { name: 'Consultar política', exact: true }).click();
    await policy.getByText('Inhabilitada: falta configurar el margen.', { exact: true }).waitFor();
    const margin = policy.locator('input');
    expect(await margin.inputValue()).toBe('');
    await margin.fill('5');
    await policy.getByRole('button', { name: 'Guardar margen', exact: true }).click();
    await policy.locator('[role="status"]').waitFor();
    expect(await policy.textContent()).toContain('Margen guardado.');
    const stored = await db.moistureAlertPolicy.findUniqueOrThrow({
      where: { sensorId: adminSoilId },
    });
    expect(stored.recoveryMarginPct).toBe(5);
    const range = await db.sensorThreshold.findFirstOrThrow({ where: { sensorId: adminSoilId } });
    expect(range.minValue).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const result = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': adminDeviceId,
          'X-Device-Key': adminDeviceKey,
        },
        body: JSON.stringify({
          schemaVersion: '1.2',
          eventId: `moisture-browser-${i}`,
          deviceId: adminDeviceId,
          recordedAt: null,
          soilMoisture: { soil_1: 0, soil_2: 60, soil_3: 60 },
          temperatureC: 25,
          airHumidityPct: 70,
          rainDetected: false,
          valve: { relayCommandedOpen: false, feedbackOpen: null },
          source: 'demo',
        }),
      });
      expect(result.status).toBe(201);
      await app
        .get(MoistureRepository)
        .synchronize(adminSoilId, (source) => app.get(SourcePolicy).allows(source));
    }
    const alert = await db.moistureAlert.findFirstOrThrow({
      where: { sensorId: adminSoilId, closedAt: null },
    });
    await panel.getByRole('button', { name: 'Actualizar alertas de humedad', exact: true }).click();
    const episode = panel.locator(`[data-moisture-alert-id="${alert.id}"]`);
    await episode.getByText('Baja humedad · condición activa', { exact: false }).waitFor();
    const evidence = episode.locator('.alert-evidence');
    expect(await evidence.getAttribute('open')).toBeNull();
    await evidence.locator('summary').focus();
    await evidence.locator('summary').press('Enter');
    await evidence.getByText('Tercera lectura:', { exact: false }).waitFor();
    await evidence.locator('summary').press('Enter');
    await evidence.getByText('Tercera lectura:', { exact: false }).waitFor({ state: 'hidden' });
    await episode.getByRole('button', { name: 'Reconocer alerta de humedad', exact: true }).click();
    await episode.getByText('Reconocida', { exact: false }).waitFor();
    expect(
      (await db.moistureAlert.findUniqueOrThrow({ where: { id: alert.id } })).closedAt,
    ).toBeNull();
    expect(await panel.textContent()).toContain('DEMO · Alertas de demostración');
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await adminPage.screenshot({
      path: join(directory, 'moisture-alert-mobile.png'),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });

  it('sensor.status refresca rango cambiado fuera del navegador sin otra lectura ni recarga', async () => {
    const db = app.get(PrismaService);
    await db.device.update({ where: { id: adminDeviceId }, data: { expectedIntervalSeconds: 60 } });
    const result = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Id': adminDeviceId,
        'X-Device-Key': adminDeviceKey,
      },
      body: JSON.stringify({
        schemaVersion: '1.2',
        deviceId: adminDeviceId,
        eventId: 'sensor-status-browser',
        recordedAt: null,
        soilMoisture: { soil_1: 0, soil_2: null, soil_3: 60 },
        temperatureC: 25,
        airHumidityPct: 70,
        rainDetected: false,
        valve: { relayCommandedOpen: false, feedbackOpen: null },
      }),
    });
    expect(result.status).toBe(201);
    await adminPage
      .locator('app-soil-sensor-card')
      .first()
      .locator('[data-comparison="low"]')
      .waitFor();
    const before = await db.reading.count({ where: { deviceId: adminDeviceId } });
    const current = await app.get(ThresholdService).get(adminSoilId, adminId);
    const version = current.threshold!.version + 1;
    const refreshed = adminPage.waitForResponse(
      (r) => r.url().endsWith(`/sensors/${adminSoilId}/thresholds`) && r.status() === 200,
    );
    const status = waitForSensor(
      (event) =>
        event.deviceId === adminDeviceId &&
        event.sensors.some(
          (sensor) => sensor.sensorId === adminSoilId && sensor.rangeVersion === version,
        ),
    );
    const [, event] = await Promise.all([
      app.get(ThresholdService).put(adminSoilId, adminId, {
        variable: 'SOIL_MOISTURE',
        unit: 'PERCENT',
        minValue: 0,
        maxValue: 100,
        expectedVersion: current.threshold!.version,
      }),
      status,
      refreshed,
    ]);
    await adminPage
      .locator('app-soil-sensor-card')
      .first()
      .locator('[data-comparison="within"]')
      .waitFor({ timeout: 12000 });
    expect(event).toMatchObject({ schemaVersion: '1.0', deviceId: adminDeviceId, source: 'demo' });
    expect(event!.sensors.find((s) => s.code === 'soil_1')).toMatchObject({
      quality: 'uncalibrated',
      range: 'within',
      rangeVersion: version,
    });
    expect(event!.sensors.find((s) => s.code === 'soil_2')).toMatchObject({
      quality: 'missing',
      range: null,
    });
    expect(await db.reading.count({ where: { deviceId: adminDeviceId } })).toBe(before);
    expect(await adminPage.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
    await adminPage.screenshot({
      path: join(directory, 'sensor-status-mobile.png'),
      fullPage: true,
    });
  });

  it('fechas personalizadas filtran gráfico/tabla, conservan UTC al paginar y recuperan errores sin ocultar la última medición', async () => {
    const db = app.get(PrismaService);
    const bounds = await db.reading.aggregate({
      where: { deviceId: adminDeviceId },
      _min: { effectiveAt: true },
      _max: { effectiveAt: true },
    });
    const from = new Date(
      Math.floor(bounds._min.effectiveAt!.getTime() / 1000) * 1000 - 1000,
    ).toISOString();
    const to = new Date(
      Math.ceil(bounds._max.effectiveAt!.getTime() / 1000) * 1000 + 1000,
    ).toISOString();
    const form = adminPage.getByRole('form', { name: 'Fechas del historial', exact: true });
    const local = (iso: string) =>
      adminPage.evaluate((value) => {
        const date = new Date(value);
        return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 19)
          .replace(/:00$/, '');
      }, iso);
    const setFields = async (start: string, end: string) => {
      await form
        .getByLabel('Desde del historial (hora local)', { exact: true })
        .fill(await local(start));
      await form
        .getByLabel('Hasta del historial (hora local)', { exact: true })
        .fill(await local(end));
    };
    const response = (offset: number, start = from, end = to, status = 200) =>
      adminPage.waitForResponse((r) => {
        const url = new URL(r.url());
        return (
          url.pathname.endsWith('/readings') &&
          url.searchParams.get('from') === start &&
          url.searchParams.get('to') === end &&
          url.searchParams.get('offset') === String(offset) &&
          r.status() === status
        );
      });
    await setFields(from, to);
    const first = response(0);
    await form.getByRole('button', { name: 'Aplicar fechas al historial', exact: true }).click();
    const received = await first;
    expect(new URL(received.url()).searchParams.get('source')).toBe('demo');
    expect(new URL(received.url()).searchParams.get('deviceId')).toBe(adminDeviceId);
    expect((await received.json()).total).toBeGreaterThan(100);
    await adminPage
      .locator('app-history-period')
      .getByText('Periodo fijo:', { exact: false })
      .waitFor();
    const chart = adminPage.locator('app-soil-history-chart');
    await chart.locator('svg').waitFor();
    const second = response(100);
    await adminPage.getByRole('button', { name: 'Más antiguas', exact: true }).click();
    await second;
    await chart.locator('svg').waitFor();
    const refreshed = response(100);
    await adminPage.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await refreshed;
    await setFields('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    await form.getByRole('button', { name: 'Aplicar fechas al historial', exact: true }).click();
    await adminPage.locator('app-history-period [role="alert"]').waitFor();
    const emptyFrom = '2020-01-01T00:00:00.000Z',
      emptyTo = '2020-01-02T00:00:00.000Z';
    await setFields(emptyFrom, emptyTo);
    const empty = response(0, emptyFrom, emptyTo);
    await form.getByRole('button', { name: 'Aplicar fechas al historial', exact: true }).click();
    await empty;
    await chart.getByText('Sin lecturas en este intervalo.', { exact: true }).waitFor();
    expect(
      await adminPage.locator('app-soil-sensor-card').first().locator('strong').textContent(),
    ).toContain('0');
    expect(
      await adminPage.getByRole('button', { name: 'Más antiguas', exact: true }).isDisabled(),
    ).toBe(true);
    const fail = '**/api/v1/plots/*/readings?*';
    await adminPage.route(fail, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    try {
      const failed = response(0, emptyFrom, emptyTo, 503);
      await form.getByRole('button', { name: 'Aplicar fechas al historial', exact: true }).click();
      await failed;
      await chart.getByText('Historial no disponible.', { exact: false }).waitFor();
      expect(
        await chart.getByText('Sin lecturas en este intervalo.', { exact: true }).count(),
      ).toBe(0);
    } finally {
      await adminPage.unroute(fail);
    }
    const retry = response(0, emptyFrom, emptyTo);
    await adminPage.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await retry;
    await chart.getByText('Sin lecturas en este intervalo.', { exact: true }).waitFor();
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await adminPage.screenshot({
      path: join(directory, 'history-period-mobile.png'),
      fullPage: true,
    });
    await adminPage
      .getByLabel('Intervalo histórico')
      .getByRole('button', { name: '24 h', exact: true })
      .click();
    await chart.locator('svg').waitFor();
  });

  it('fechas del riego observado conservan UTC al paginar/actualizar y validan sin afectar gráfico o móvil', async () => {
    const db = app.get(PrismaService);
    // Only the disposable test DB: many readings do not necessarily imply many relay changes.
    const base = Date.now() - 6 * 3600000;
    await db.reading.createMany({
      data: Array.from({ length: 12 }, (_, i) => ({
        deviceId: adminDeviceId,
        eventId: `irrigation-custom-period-${i}`,
        source: 'demo' as const,
        recordedAt: new Date(base + i * 5000),
        effectiveAt: new Date(base + i * 5000),
        receivedAt: new Date(),
        timestampOrigin: 'device',
        payloadHash: '0'.repeat(64),
        relayCommandedOpen: i % 2 === 0,
        quality: {
          soil_1: 'missing',
          soil_2: 'missing',
          soil_3: 'missing',
          temperatureC: 'missing',
          airHumidityPct: 'missing',
          rainDetected: 'missing',
          relayCommandedOpen: 'valid',
          feedbackOpen: 'missing',
        },
      })),
    });
    const bounds = await db.reading.aggregate({
      where: { deviceId: adminDeviceId },
      _min: { effectiveAt: true },
      _max: { effectiveAt: true },
    });
    const from = new Date(
      Math.floor(bounds._min.effectiveAt!.getTime() / 1000) * 1000 - 1000,
    ).toISOString();
    const to = new Date(
      Math.ceil(bounds._max.effectiveAt!.getTime() / 1000) * 1000 + 1000,
    ).toISOString();
    const panel = adminPage.locator('app-irrigation-history');
    const form = panel.getByRole('form', { name: 'Fechas del riego observado', exact: true });
    const setFields = async (start: string, end: string) => {
      const local = (iso: string) =>
        adminPage.evaluate((value) => {
          const date = new Date(value);
          return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 19)
            .replace(/:00$/, '');
        }, iso);
      await form
        .getByLabel('Desde del riego (hora local)', { exact: true })
        .fill(await local(start));
      await form.getByLabel('Hasta del riego (hora local)', { exact: true }).fill(await local(end));
    };
    const response = (offset: number, start = from, end = to, status = 200) =>
      adminPage.waitForResponse((r) => {
        const url = new URL(r.url());
        return (
          url.pathname.endsWith('/irrigation-events') &&
          url.searchParams.get('from') === start &&
          url.searchParams.get('to') === end &&
          url.searchParams.get('offset') === String(offset) &&
          r.status() === status
        );
      });
    const graphDates = await adminPage
      .locator('app-history-period input')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    await setFields(from, to);
    const first = response(0);
    await form.getByRole('button', { name: 'Aplicar fechas al riego', exact: true }).click();
    const received = await first;
    expect(new URL(received.url()).searchParams.get('source')).toBe('demo');
    expect(new URL(received.url()).searchParams.get('deviceId')).toBe(adminDeviceId);
    expect((await received.json()).total).toBeGreaterThan(10);
    await panel.getByText('Periodo fijo:', { exact: false }).waitFor();
    const second = response(10);
    await panel.getByRole('button', { name: 'Más antiguos', exact: true }).click();
    await second;
    const refreshed = response(0);
    await panel
      .getByRole('button', { name: 'Consultar / actualizar historial', exact: true })
      .click();
    await refreshed;
    expect(
      await adminPage
        .locator('app-history-period input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    ).toEqual(graphDates);
    await setFields('2026-01-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    await form.getByRole('button', { name: 'Aplicar fechas al riego', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    const emptyFrom = '2020-01-01T00:00:00.000Z',
      emptyTo = '2020-01-02T00:00:00.000Z';
    await setFields(emptyFrom, emptyTo);
    const empty = response(0, emptyFrom, emptyTo);
    await form.getByRole('button', { name: 'Aplicar fechas al riego', exact: true }).click();
    await empty;
    await panel.getByText('Sin cambios observados en este periodo.', { exact: false }).waitFor();
    const fail = '**/api/v1/plots/*/irrigation-events?*';
    await adminPage.route(fail, (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
    );
    try {
      const failed = response(0, emptyFrom, emptyTo, 503);
      await panel
        .getByRole('button', { name: 'Consultar / actualizar historial', exact: true })
        .click();
      await failed;
      await panel.getByText('No se pudo consultar el historial.', { exact: false }).waitFor();
    } finally {
      await adminPage.unroute(fail);
    }
    const retry = response(0, emptyFrom, emptyTo);
    await panel.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await retry;
    expect(
      await adminPage
        .locator('app-history-period input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    ).toEqual(graphDates);
    expect(await adminPage.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(await adminPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await adminPage.screenshot({
      path: join(directory, 'irrigation-period-mobile.png'),
      fullPage: true,
    });
    const preset = adminPage.waitForResponse(
      (r) => r.url().includes('/irrigation-events?') && r.status() === 200,
    );
    await panel.getByRole('button', { name: '24 h', exact: true }).click();
    await preset;
    expect(
      await panel.getByRole('button', { name: '24 h', exact: true }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('renueva antes de quince minutos, reautentica Socket.IO, recupera recarga y revoca al salir', async () => {
    const context = await browser.newContext();
    const sessionPage = await context.newPage();
    try {
      await sessionPage.clock.install();
      await sessionPage.goto(`${frontendUrl}/login`);
      await sessionPage.locator('#email').fill('browser@example.test');
      await sessionPage.locator('#password').fill(password);
      await sessionPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
      await sessionPage.getByRole('link', { name: 'Abrir panel de monitoreo' }).click();
      await sessionPage.getByLabel('Origen de telemetría', { exact: true }).selectOption('demo');
      await sessionPage.waitForFunction(() =>
        document.querySelector('main')?.textContent?.includes('Canal en vivo: Conectado'),
      );
      const cookies = await context.cookies(`${frontendUrl}/api/v1/auth`);
      const cookie = cookies.find((item) => item.name === 'cacaosmart_session');
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.sameSite).toBe('Strict');
      expect(await sessionPage.evaluate(() => document.cookie.includes('cacaosmart_session'))).toBe(
        false,
      );
      const refreshed = sessionPage.waitForResponse(
        (r) => r.url().endsWith('/auth/refresh') && r.status() === 200,
      );
      const reconnected = sessionPage.waitForEvent('websocket');
      await sessionPage.clock.fastForward(840000);
      await refreshed;
      await reconnected;
      // Wait for Socket.IO authentication/subscription, not just the transport opening,
      // before advancing across its ping timeout with the controlled browser clock.
      await sessionPage.waitForFunction(() =>
        document.querySelector('main')?.textContent?.includes('Canal en vivo: Conectado'),
      );
      await sessionPage.clock.fastForward(61000);
      await sessionPage.waitForFunction(() =>
        document.querySelector('main')?.textContent?.includes('Canal en vivo: Conectado'),
      );
      expect(await sessionPage.getByRole('button', { name: 'Salir', exact: true }).count()).toBe(1);
      const restored = sessionPage.waitForResponse(
        (r) => r.url().endsWith('/auth/refresh') && r.status() === 200,
      );
      await sessionPage.reload();
      await restored;
      await sessionPage.getByRole('button', { name: 'Salir', exact: true }).waitFor();
      const closed = sessionPage.waitForResponse(
        (r) => r.url().endsWith('/auth/logout') && r.status() === 204,
      );
      await sessionPage.getByRole('button', { name: 'Salir', exact: true }).click();
      await closed;
      await sessionPage.waitForURL((url) => url.pathname === '/login');
      await sessionPage.reload();
      await sessionPage.locator('#email').waitFor();
      expect(
        (await context.cookies(`${frontendUrl}/api/v1/auth`)).some(
          (item) => item.name === 'cacaosmart_session',
        ),
      ).toBe(false);
    } finally {
      await context.close();
    }
  }, 45000);

  it.each([
    {
      email: 'browser@example.test',
      plot: 'Cacao · Prueba aislada',
      serial: 'browser-demo',
      id: () => deviceId,
    },
    {
      email: 'range-editor@example.test',
      plot: 'Rangos · Prueba aislada',
      serial: 'browser-editor-demo',
      id: () => adminDeviceId,
    },
  ])(
    'inventario de $email muestra equipos/sensores propios sin escrituras y recupera errores en móvil',
    async (account) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const inventoryPage = await context.newPage();
      try {
        await inventoryPage.goto(`${frontendUrl}/login`);
        await inventoryPage.locator('#email').fill(account.email);
        await inventoryPage.locator('#password').fill(password);
        await inventoryPage.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
        await inventoryPage.getByRole('heading', { name: 'Mis parcelas', exact: true }).waitFor();
        const mutations: string[] = [];
        inventoryPage.on('request', (req) => {
          if (req.url().includes('/api/v1/') && req.method() !== 'GET')
            mutations.push(req.method());
        });
        const card = inventoryPage
          .locator('article')
          .filter({ has: inventoryPage.getByRole('heading', { name: account.plot, exact: true }) });
        const toggle = card.getByRole('button', {
          name: 'Ver dispositivos y sensores',
          exact: true,
        });
        const received = inventoryPage.waitForResponse(
          (r) => new URL(r.url()).pathname.endsWith('/devices') && r.status() === 200,
        );
        await toggle.click();
        const body = await (await received).json();
        expect(body.items.some((item: { id: string }) => item.id === account.id())).toBe(true);
        expect(JSON.stringify(body)).not.toMatch(/deviceKey|credentialHash/);
        const panel = card.locator('app-device-inventory');
        await panel.getByRole('heading', { name: account.serial, exact: true }).waitFor();
        await panel.getByText('DEMO · Equipo de demostración', { exact: true }).waitFor();
        await panel.locator('.device .sensors summary').click();
        expect(await panel.locator('.sensor').count()).toBe(6);
        for (const label of [
          'Sensor 1',
          'Sensor 2',
          'Sensor 3',
          'Temperatura ambiental',
          'Humedad ambiental',
          'Detección de lluvia',
        ]) {
          expect(await panel.textContent()).toContain(label);
        }
        expect(await panel.locator('form').count()).toBe(
          account.email === 'browser@example.test' ? 0 : 1,
        );
        const fail = '**/api/v1/plots/*/devices?*';
        await inventoryPage.route(fail, (route) =>
          route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
        );
        await panel.getByRole('button', { name: 'Actualizar dispositivos', exact: true }).click();
        await panel.getByRole('alert').waitFor();
        expect(await panel.locator('.device').count()).toBe(0);
        await inventoryPage.unroute(fail);
        const retry = inventoryPage.waitForResponse(
          (r) => new URL(r.url()).pathname.endsWith('/devices') && r.status() === 200,
        );
        await panel.getByRole('button', { name: 'Reintentar dispositivos', exact: true }).click();
        await retry;
        await panel.getByRole('heading', { name: account.serial, exact: true }).waitFor();
        expect(
          await inventoryPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        expect(
          await inventoryPage.getByRole('heading', { name: 'Mis parcelas', exact: true }).count(),
        ).toBe(1);
        expect(mutations).toEqual([]);
        await inventoryPage.screenshot({
          path: join(directory, `inventory-${account.serial}-mobile.png`),
          fullPage: true,
        });
        await card
          .getByRole('button', { name: 'Ocultar dispositivos y sensores', exact: true })
          .click();
        await card.locator('app-device-inventory').waitFor({ state: 'detached' });
        expect(await card.locator('app-device-inventory').count()).toBe(0);
      } finally {
        await context.close();
      }
    },
  );

  it('ADMIN gestiona equipo con clave única, habilitación y edición/archivo sin borrar historial', async () => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: await adminPage.context().storageState(),
    });
    const managementPage = await context.newPage();
    try {
      await managementPage.goto(`${frontendUrl}/parcelas`);
      await managementPage.getByRole('heading', { name: 'Mis parcelas', exact: true }).waitFor();
      await managementPage.getByLabel('Nombre', { exact: true }).fill('Gestión · Aislada');
      await managementPage.getByLabel('Ubicación', { exact: true }).fill('Chone');
      const creating = managementPage.waitForResponse(
        (r) => r.url().endsWith('/api/v1/plots') && r.request().method() === 'POST',
      );
      await managementPage.getByRole('button', { name: 'Crear parcela', exact: true }).click();
      const createdPlot = (await (await creating).json()) as { id: string };
      let card = managementPage.locator('article').filter({
        has: managementPage.getByRole('heading', { name: 'Gestión · Aislada', exact: true }),
      });
      await card.getByRole('button', { name: 'Ver dispositivos y sensores', exact: true }).click();
      const manager = card.locator('app-device-management');
      const registration = manager.locator('.registration');
      expect(await registration.getAttribute('open')).toBeNull();
      await registration.locator('summary').focus();
      await registration.locator('summary').press('Enter');
      await manager.getByLabel('Serie del equipo', { exact: true }).fill('browser-management');
      await manager.getByLabel('Origen del equipo', { exact: true }).selectOption('demo');
      await manager.getByLabel('Intervalo esperado en segundos', { exact: true }).fill('15');
      await manager.getByRole('checkbox').check();
      const failedCreate = `**/api/v1/plots/${createdPlot.id}/devices`;
      let attempts = 0;
      await managementPage.route(failedCreate, (route) => {
        attempts++;
        return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      });
      await manager.getByRole('button', { name: 'Registrar dispositivo', exact: true }).click();
      await manager.getByText('No se confirmó el alta.', { exact: false }).waitFor();
      expect(
        await manager
          .getByRole('button', { name: 'Registrar dispositivo', exact: true })
          .isDisabled(),
      ).toBe(true);
      expect(attempts).toBe(1);
      await managementPage.unroute(failedCreate);
      await card.getByRole('button', { name: 'Actualizar dispositivos', exact: true }).click();
      await manager
        .getByRole('button', { name: 'Revisé el inventario · Desbloquear formulario', exact: true })
        .click();
      const registering = managementPage.waitForResponse(
        (r) =>
          r.url().endsWith(`/plots/${createdPlot.id}/devices`) && r.request().method() === 'POST',
      );
      await manager.getByRole('button', { name: 'Registrar dispositivo', exact: true }).click();
      const registered = (await (await registering).json()) as {
        id: string;
        deviceKey: string;
        sensors: unknown[];
      };
      expect(registered.sensors.length).toBe(6);
      await manager.getByLabel('Clave privada del dispositivo', { exact: true }).waitFor();
      expect(
        await manager.getByLabel('Clave privada del dispositivo', { exact: true }).inputValue(),
      ).toBe(registered.deviceKey);
      expect(
        await managementPage.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
      ).not.toContain(registered.deviceKey);
      // Refresh inventory does not destroy the one-time credential panel.
      await card.getByRole('button', { name: 'Actualizar dispositivos', exact: true }).click();
      await card
        .locator('.device')
        .getByRole('heading', { name: 'browser-management', exact: true })
        .waitFor();
      expect(
        await manager.getByLabel('Clave privada del dispositivo', { exact: true }).inputValue(),
      ).toBe(registered.deviceKey);
      await manager
        .getByRole('button', { name: 'Ya guardé la clave · Ocultar', exact: true })
        .click();
      await manager.locator('textarea').waitFor({ state: 'detached' });
      await manager.locator('.registration summary').waitFor({ state: 'visible' });
      await managementPage.waitForFunction(() =>
        document.activeElement?.matches('app-device-management .registration summary'),
      );
      // The returned focus is visible and safe to capture: no credential remains.
      await manager.screenshot({ path: join(directory, 'device-management-collapsed-mobile.png') });
      await manager
        .getByRole('button', { name: 'Deshabilitar browser-management', exact: true })
        .click();
      const cancelChange = manager.getByRole('button', { name: 'Cancelar cambio', exact: true });
      await cancelChange.waitFor();
      await managementPage.waitForFunction(
        () => document.activeElement?.textContent?.trim() === 'Cancelar cambio',
      );
      await cancelChange.press('Escape');
      await manager
        .getByRole('group', { name: 'Confirmar habilitación', exact: true })
        .waitFor({ state: 'detached' });
      await managementPage.waitForFunction(
        () => document.activeElement?.textContent?.trim() === 'Deshabilitar browser-management',
      );
      const db = app.get(PrismaService);
      expect((await db.device.findUniqueOrThrow({ where: { id: registered.id } })).isActive).toBe(
        true,
      );
      await manager
        .getByRole('button', { name: 'Deshabilitar browser-management', exact: true })
        .click();
      const toggleRoute = `**/api/v1/plots/${createdPlot.id}/devices/${registered.id}`;
      const inventoryRoute = `**/api/v1/plots/${createdPlot.id}/devices?*`;
      let toggleAttempts = 0;
      await managementPage.route(toggleRoute, async (route) => {
        toggleAttempts++;
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      });
      await managementPage.route(inventoryRoute, (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      const disabling = managementPage.waitForResponse(
        (r) => r.url().endsWith(`/devices/${registered.id}`) && r.request().method() === 'PATCH',
      );
      await manager
        .getByRole('button', { name: 'Confirmar cambio de habilitación', exact: true })
        .click();
      expect((await disabling).status()).toBe(503);
      await manager.getByText('No se confirmó el cambio.', { exact: false }).waitFor();
      await card.getByRole('button', { name: 'Reintentar dispositivos', exact: true }).waitFor();
      expect(toggleAttempts).toBe(1);
      expect((await db.device.findUniqueOrThrow({ where: { id: registered.id } })).isActive).toBe(
        false,
      );
      await managementPage.unroute(toggleRoute);
      await managementPage.unroute(inventoryRoute);
      await card.getByRole('button', { name: 'Reintentar dispositivos', exact: true }).click();
      await manager
        .getByRole('button', { name: 'Habilitar browser-management', exact: true })
        .waitFor();
      expect((await db.device.findUniqueOrThrow({ where: { id: registered.id } })).isActive).toBe(
        false,
      );
      await manager
        .getByRole('button', { name: 'Habilitar browser-management', exact: true })
        .click();
      const enabling = managementPage.waitForResponse(
        (r) => r.url().endsWith(`/devices/${registered.id}`) && r.request().method() === 'PATCH',
      );
      await manager
        .getByRole('button', { name: 'Confirmar cambio de habilitación', exact: true })
        .click();
      await enabling;
      await manager
        .getByRole('button', { name: 'Deshabilitar browser-management', exact: true })
        .waitFor();
      const observed = await fetch(`${apiUrl}/api/v1/iot/telemetry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Id': registered.id,
          'X-Device-Key': registered.deviceKey,
        },
        body: JSON.stringify({
          schemaVersion: '1.2',
          deviceId: registered.id,
          eventId: 'management-observation',
          recordedAt: null,
          soilMoisture: { soil_1: 20, soil_2: 40, soil_3: 60 },
          temperatureC: 26,
          airHumidityPct: 70,
          rainDetected: false,
          valve: { relayCommandedOpen: false, feedbackOpen: null },
        }),
      });
      expect(observed.status).toBe(201);
      await card.getByRole('button', { name: 'Editar parcela', exact: true }).click();
      await managementPage.waitForFunction(
        () => document.activeElement?.getAttribute('formControlName') === 'name',
      );
      await card.getByLabel('Nombre de la parcela', { exact: true }).press('Escape');
      await managementPage.waitForFunction(
        () => document.activeElement?.textContent?.trim() === 'Editar parcela',
      );
      await card.getByRole('button', { name: 'Editar parcela', exact: true }).click();
      await card.getByLabel('Nombre de la parcela', { exact: true }).fill('Gestión · Editada');
      await card
        .getByLabel('Superficie de la parcela en m² (opcional)', { exact: true })
        .fill('500');
      const updating = managementPage.waitForResponse(
        (r) => r.url().endsWith(`/plots/${createdPlot.id}`) && r.request().method() === 'PATCH',
      );
      await card.getByRole('button', { name: 'Guardar parcela', exact: true }).click();
      expect((await updating).status()).toBe(200);
      card = managementPage.locator('article').filter({
        has: managementPage.getByRole('heading', { name: 'Gestión · Editada', exact: true }),
      });
      await card.waitFor();
      expect((await db.plot.findUniqueOrThrow({ where: { id: createdPlot.id } })).areaM2).toBe(500);
      expect(
        await managementPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await managementPage.screenshot({
        path: join(directory, 'device-management-mobile.png'),
        fullPage: true,
      });
      await card.getByRole('button', { name: 'Archivar parcela', exact: true }).click();
      await managementPage.waitForFunction(
        () =>
          document.activeElement?.getAttribute('autocomplete') === 'off' &&
          document.activeElement?.closest('app-plot-management') !== null,
      );
      await card
        .getByRole('group', { name: 'Confirmar archivo de Gestión · Editada', exact: true })
        .screenshot({ path: join(directory, 'plot-archive-mobile.png') });
      expect(
        await card
          .getByRole('button', { name: 'Confirmar archivo de parcela', exact: true })
          .isDisabled(),
      ).toBe(true);
      await card
        .getByLabel('Escribe el nombre de la parcela para confirmar', { exact: true })
        .fill('Gestión · Editada');
      const archiving = managementPage.waitForResponse(
        (r) => r.url().endsWith(`/plots/${createdPlot.id}`) && r.request().method() === 'DELETE',
      );
      await card.getByRole('button', { name: 'Confirmar archivo de parcela', exact: true }).click();
      expect((await archiving).status()).toBe(204);
      await card.waitFor({ state: 'detached' });
      expect(
        (await db.plot.findUniqueOrThrow({ where: { id: createdPlot.id } })).archivedAt,
      ).not.toBeNull();
      expect(await db.device.count({ where: { id: registered.id } })).toBe(1);
      expect(await db.sensor.count({ where: { deviceId: registered.id } })).toBe(6);
      expect(await db.reading.count({ where: { deviceId: registered.id } })).toBe(1);
    } finally {
      await context.close();
    }
  }, 45000);

  it('login y registro adaptables conservan etiquetas, privacidad y enlaces sin enviar credenciales', async () => {
    const context = await browser.newContext();
    const accessPage = await context.newPage();
    const mutations: string[] = [];
    try {
      await accessPage.goto(`${frontendUrl}/login`);
      await accessPage.getByRole('heading', { name: 'Bienvenido de nuevo', exact: true }).waitFor();
      // Ignore the initial session recovery; interactions below must not submit credentials.
      accessPage.on('request', (request) => {
        if (/\/auth\/(login|register)$/.test(request.url()) && request.method() === 'POST')
          mutations.push(request.url());
      });
      expect(await accessPage.locator('.privacy').textContent()).toContain('hasta 8 horas');
      for (const route of ['login', 'registro']) {
        if (route === 'registro') {
          await accessPage
            .getByRole('link', { name: 'Crear cuenta de agricultor', exact: true })
            .click();
          await accessPage.getByRole('heading', { name: 'Crea tu cuenta', exact: true }).waitFor();
        }
        for (const width of [320, 390, 768, 1440]) {
          await accessPage.setViewportSize({ width, height: 900 });
          expect(
            await accessPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          expect(
            await accessPage.getByLabel('Correo electrónico', { exact: true }).isVisible(),
          ).toBe(true);
          if (width === 390 || width === 1440)
            await accessPage.screenshot({
              path: join(directory, `auth-${route}-${width}.png`),
              fullPage: true,
            });
        }
      }
      await accessPage.getByRole('link', { name: 'Iniciar sesión', exact: true }).click();
      await accessPage.getByRole('heading', { name: 'Bienvenido de nuevo', exact: true }).waitFor();
      await accessPage.locator('.setup summary').focus();
      await accessPage.locator('.setup summary').press('Enter');
      expect(await accessPage.locator('.setup').getAttribute('open')).not.toBeNull();
      expect(mutations).toEqual([]);
    } finally {
      await context.close();
    }
  });

  it('FARMER sube foto con consentimiento, consulta DEMO privada y reintenta respuesta perdida sin duplicar', async () => {
    // Share the live cookie jar; copying a rotating refresh cookie makes later pages stale.
    const diagnosisPage = await page.context().newPage();
    await diagnosisPage.setViewportSize({ width: 390, height: 844 });
    try {
      await diagnosisPage.goto(`${frontendUrl}/parcelas`);
      const card = diagnosisPage.locator('article').filter({
        has: diagnosisPage.getByRole('heading', { name: 'Cacao · Prueba aislada', exact: true }),
      });
      await card.getByRole('link', { name: 'Diagnóstico IA · DEMO →', exact: true }).click();
      await diagnosisPage
        .getByRole('heading', { name: 'Fotografía de la planta', exact: true })
        .waitFor();
      const input = diagnosisPage.getByLabel('Subir imagen de la planta', { exact: true });
      const photo = await sharp({
        create: { width: 60, height: 40, channels: 3, background: '#387e3e' },
      })
        .png()
        .toBuffer();
      let posts = 0;
      diagnosisPage.on('request', (req) => {
        if (req.method() === 'POST' && req.url().endsWith('/ai-diagnostics')) posts++;
      });
      await input.setInputFiles({ name: 'cacao-demo.png', mimeType: 'image/png', buffer: photo });
      await diagnosisPage
        .getByAltText('Vista previa de la foto elegida, aún no enviada', { exact: true })
        .waitFor();
      expect(posts).toBe(0);
      const confirm = diagnosisPage.getByRole('button', {
        name: 'Confirmar análisis simulado',
        exact: true,
      });
      expect(await confirm.isDisabled()).toBe(true);
      for (const width of [320, 768, 1440]) {
        await diagnosisPage.setViewportSize({ width, height: 900 });
        expect(
          await diagnosisPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
      }
      await diagnosisPage
        .locator('.capture-panel')
        .screenshot({ path: join(directory, 'ai-capture-desktop.png') });
      await diagnosisPage.setViewportSize({ width: 390, height: 844 });
      await diagnosisPage
        .locator('.capture-panel')
        .screenshot({ path: join(directory, 'ai-capture-mobile.png') });
      await diagnosisPage.getByRole('checkbox').check();
      const creating = diagnosisPage.waitForResponse(
        (r) => r.url().endsWith('/ai-diagnostics') && r.request().method() === 'POST',
      );
      await confirm.click();
      const created = (await (await creating).json()) as {
        id: string;
        source: string;
        status: string;
      };
      expect(created.source).toBe('demo');
      expect(created.status).toBe('completed');
      await diagnosisPage.getByRole('heading', { name: 'Resultado · DEMO', exact: true }).waitFor();
      await diagnosisPage
        .getByAltText('Fotografía privada del análisis seleccionado', { exact: true })
        .waitFor();
      expect(await diagnosisPage.locator('main').textContent()).toContain('no concluyente');
      expect(await diagnosisPage.locator('main').textContent()).toContain(
        'No evaluadas por el proveedor simulado',
      );
      await diagnosisPage
        .locator('.result-panel')
        .screenshot({ path: join(directory, 'ai-result-mobile.png') });
      expect(
        await diagnosisPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await diagnosisPage.screenshot({
        path: join(directory, 'ai-diagnosis-demo-mobile.png'),
        fullPage: true,
      });
      // The backend persists the second upload, but the browser loses its response.
      await input.setInputFiles({ name: 'cacao-demo.png', mimeType: 'image/png', buffer: photo });
      await diagnosisPage.getByRole('checkbox').check();
      const pattern = '**/api/v1/ai-diagnostics';
      let lostId = '';
      await diagnosisPage.route(pattern, async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        const response = await route.fetch();
        lostId = ((await response.json()) as { id: string }).id;
        await route.abort('failed');
      });
      await diagnosisPage
        .getByRole('button', { name: 'Confirmar análisis simulado', exact: true })
        .click();
      await diagnosisPage
        .getByRole('button', { name: 'Reintentar misma solicitud', exact: true })
        .waitFor();
      await diagnosisPage.unroute(pattern);
      const retrying = diagnosisPage.waitForResponse(
        (r) => r.url().endsWith('/ai-diagnostics') && r.request().method() === 'POST',
      );
      await diagnosisPage
        .getByRole('button', { name: 'Reintentar misma solicitud', exact: true })
        .click();
      expect(((await (await retrying).json()) as { id: string }).id).toBe(lostId);
      await diagnosisPage
        .getByRole('button', { name: 'Quitar foto', exact: true })
        .waitFor({ state: 'detached' });
      const db = app.get(PrismaService);
      expect(await db.aiDiagnosis.count({ where: { plotId } })).toBe(2);
      await diagnosisPage.reload();
      await diagnosisPage
        .getByRole('button', { name: 'Ver análisis', exact: true })
        .first()
        .waitFor();
      expect(
        await diagnosisPage.getByRole('button', { name: 'Ver análisis', exact: true }).count(),
      ).toBe(2);
      await diagnosisPage
        .getByRole('button', { name: 'Eliminar análisis', exact: true })
        .first()
        .click();
      await diagnosisPage
        .getByRole('button', { name: 'Cancelar eliminación', exact: true })
        .click();
      expect(await db.aiDiagnosis.count({ where: { plotId, deletedAt: null } })).toBe(2);
      await diagnosisPage
        .getByRole('button', { name: 'Eliminar análisis', exact: true })
        .first()
        .click();
      const deleting = diagnosisPage.waitForResponse(
        (r) => r.request().method() === 'DELETE' && r.url().includes('/ai-diagnostics/'),
      );
      await diagnosisPage
        .getByRole('button', { name: 'Confirmar eliminación', exact: true })
        .click();
      expect((await deleting).status()).toBe(204);
      expect(await db.aiDiagnosis.count({ where: { plotId, deletedAt: null } })).toBe(1);
      const noSession = await fetch(`${apiUrl}/api/v1/ai-diagnostics/${created.id}/image`);
      expect(noSession.status).toBe(401);
    } finally {
      await diagnosisPage.close();
    }
  }, 45000);

  it('historial IA filtra fechas/estado, conserva UTC al paginar y recupera error sin subir fotos', async () => {
    const db = app.get(PrismaService);
    const owner = await db.plot.findUniqueOrThrow({ where: { id: plotId } });
    const filterPlot = await db.plot.create({
      data: { name: 'Filtros IA · Prueba aislada', locationLabel: 'Chone', ownerId: owner.ownerId },
    });
    const now = Math.floor(Date.now() / 1000) * 1000;
    const from = new Date(now - 120000),
      to = new Date(now - 60000);
    const result = {
      plantPart: 'unknown',
      visibleSymptoms: ['Fixture DEMO, sin evaluación real'],
      possibleCauses: [],
      uncertainty: 'high',
      recommendedActions: ['Consultar técnico'],
      requiresExpertReview: true,
      disclaimer: 'Resultado simulado de prueba',
    };
    const row = (status: string, createdAt: Date) => ({
      id: randomUUID(),
      userId: owner.ownerId,
      plotId: filterPlot.id,
      requestId: randomUUID(),
      payloadHash: 'a'.repeat(64),
      status,
      consentVersion: 'demo-v1',
      consentAt: createdAt,
      createdAt,
      expiresAt: new Date(now + 86400000),
      ...(status === 'completed' ? { result } : {}),
    });
    await db.aiDiagnosis.createMany({
      data: [
        ...Array.from({ length: 12 }, () => row('completed', from)),
        row('failed', to),
        row('pending', from),
        row('completed', new Date(from.getTime() - 1000)),
      ],
    });
    const filterPage = await page.context().newPage();
    await filterPage.setViewportSize({ width: 390, height: 844 });
    const mutations: string[] = [];
    filterPage.on('request', (req) => {
      if (req.url().includes('/api/v1/ai-diagnostics') && req.method() !== 'GET')
        mutations.push(req.method());
    });
    try {
      await filterPage.goto(`${frontendUrl}/diagnostico-ia?plotId=${filterPlot.id}`);
      const history = filterPage.locator('section[aria-labelledby="history-title"]');
      await history.getByRole('button', { name: 'Ver análisis', exact: true }).first().waitFor();
      const local = async (date: Date) =>
        filterPage.evaluate((value) => {
          const d = new Date(value);
          return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
            .toISOString()
            .slice(0, 19)
            .replace(/:00$/, '');
        }, date.toISOString());
      const fromInput = history.getByLabel('Desde del diagnóstico (hora local)', { exact: true });
      const toInput = history.getByLabel('Hasta del diagnóstico (hora local)', { exact: true });
      const state = history.getByLabel('Estado del diagnóstico', { exact: true });
      const nextResponse = () =>
        filterPage.waitForResponse(
          (r) =>
            new URL(r.url()).pathname.endsWith('/ai-diagnostics') && r.request().method() === 'GET',
        );
      await fromInput.fill(await local(from));
      await toInput.fill(await local(to));
      await state.selectOption('completed');
      let response = nextResponse();
      await history
        .getByRole('button', { name: 'Aplicar filtros de diagnósticos', exact: true })
        .click();
      const first = await response,
        query = new URL(first.url()).searchParams;
      expect(query.get('from')).toBe(from.toISOString());
      expect(query.get('to')).toBe(to.toISOString());
      expect(query.get('status')).toBe('completed');
      expect((await first.json()).total).toBe(12);
      response = nextResponse();
      await history.getByRole('button', { name: 'Diagnósticos siguientes', exact: true }).click();
      const second = await response;
      expect(new URL(second.url()).searchParams.get('offset')).toBe('10');
      expect((await second.json()).items).toHaveLength(2);
      await history.getByText('Página 2 · 12 registros', { exact: true }).waitFor();
      await state.selectOption('failed');
      response = nextResponse();
      await history.getByRole('button', { name: 'Actualizar diagnósticos', exact: true }).click();
      const refreshed = new URL((await response).url()).searchParams;
      expect(refreshed.get('status')).toBe('completed');
      expect(refreshed.get('from')).toBe(query.get('from'));
      expect(refreshed.get('offset')).toBe('10');
      await fromInput.fill(await local(new Date(to.getTime() + 60000)));
      await history
        .getByRole('button', { name: 'Aplicar filtros de diagnósticos', exact: true })
        .click();
      await history.getByRole('alert').waitFor();
      expect(await history.locator('[data-history-filters]').textContent()).toContain('Completado');
      expect(await history.getByRole('button', { name: 'Ver análisis', exact: true }).count()).toBe(
        2,
      );
      await fromInput.fill(await local(from));
      response = nextResponse();
      await history
        .getByRole('button', { name: 'Aplicar filtros de diagnósticos', exact: true })
        .click();
      expect((await (await response).json()).total).toBe(1);
      await history.getByText('Página 1 · 1 registros', { exact: true }).waitFor();
      expect(await history.locator('article').textContent()).toContain('Fallido');
      response = nextResponse();
      await history
        .getByRole('button', { name: 'Limpiar filtros de diagnósticos', exact: true })
        .click();
      const cleared = await response;
      expect(new URL(cleared.url()).searchParams.has('from')).toBe(false);
      expect(new URL(cleared.url()).searchParams.has('status')).toBe(false);
      expect((await cleared.json()).total).toBe(15);
      await filterPage.route('**/api/v1/ai-diagnostics?*', (route) =>
        route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
      );
      await state.selectOption('pending');
      await history
        .getByRole('button', { name: 'Aplicar filtros de diagnósticos', exact: true })
        .click();
      await history.getByRole('alert').waitFor();
      await filterPage.unroute('**/api/v1/ai-diagnostics?*');
      response = nextResponse();
      await history.getByRole('button', { name: 'Actualizar diagnósticos', exact: true }).click();
      const recovered = await response;
      expect(new URL(recovered.url()).searchParams.get('status')).toBe('pending');
      expect((await recovered.json()).total).toBe(1);
      await history.getByText('Página 1 · 1 registros', { exact: true }).waitFor();
      expect(
        await filterPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      expect(mutations).toEqual([]);
      await filterPage.screenshot({
        path: join(directory, 'ai-diagnosis-filters-mobile.png'),
        fullPage: true,
      });
    } finally {
      await filterPage.close();
    }
  }, 45000);

  it('compara dos fotos privadas, conserva selección al filtrar y limpia al eliminar sin nuevo análisis', async () => {
    const db = app.get(PrismaService);
    const owner = await db.plot.findUniqueOrThrow({ where: { id: plotId } });
    const comparisonPlot = await db.plot.create({
      data: {
        name: 'Comparación IA · Prueba aislada',
        locationLabel: 'Chone',
        ownerId: owner.ownerId,
      },
    });
    const store = app.get(PrivateImageStore);
    const ids: string[] = [];
    for (let index = 0; index < 3; index++) {
      const id = randomUUID(),
        imageKey = `${randomUUID()}.jpg`;
      const bytes = await sharp({
        create: {
          width: 80,
          height: 60,
          channels: 3,
          background: index === 0 ? '#387e3e' : '#a87122',
        },
      })
        .jpeg()
        .toBuffer();
      await store.put(imageKey, bytes);
      await db.aiDiagnosis.create({
        data: {
          id,
          userId: owner.ownerId,
          plotId: comparisonPlot.id,
          requestId: randomUUID(),
          payloadHash: 'c'.repeat(64),
          status: 'completed',
          imageKey,
          consentVersion: 'demo-v1',
          consentAt: new Date(),
          createdAt: new Date(Date.now() - (index + 1) * 60000),
          expiresAt: new Date(Date.now() + 3600000),
          notes: `Foto sintética ${index + 1}`,
          result: {
            plantPart: 'unknown',
            visibleSymptoms: ['Sin evaluación real'],
            possibleCauses: [],
            uncertainty: 'high',
            recommendedActions: ['Consultar técnico'],
            requiresExpertReview: true,
            disclaimer: 'Resultado simulado, no concluyente',
          },
        },
      });
      ids.push(id);
    }
    const comparisonPage = await page.context().newPage();
    const mutations: string[] = [];
    comparisonPage.on('request', (req) => {
      if (req.url().includes('/api/v1/ai-diagnostics') && req.method() !== 'GET')
        mutations.push(req.method());
    });
    try {
      await comparisonPage.goto(`${frontendUrl}/diagnostico-ia?plotId=${comparisonPlot.id}`);
      const history = comparisonPage.locator('section[aria-labelledby="history-title"]');
      const panel = comparisonPage.locator('#diagnosis-comparison');
      const add = () => history.getByRole('button', { name: 'Añadir a comparación', exact: true });
      await add().first().click();
      await history.getByRole('button', { name: 'Quitar de comparación', exact: true }).waitFor();
      await add().first().click();
      const a = panel.getByRole('article', { name: 'Foto A', exact: true });
      const b = panel.getByRole('article', { name: 'Foto B', exact: true });
      await a.getByRole('img').waitFor();
      await b.getByRole('img').waitFor();
      await comparisonPage.waitForFunction(
        () =>
          Array.from(document.querySelectorAll('#diagnosis-comparison img')).length === 2 &&
          Array.from(
            document.querySelectorAll<HTMLImageElement>('#diagnosis-comparison img'),
          ).every((img) => img.complete && img.naturalWidth > 0),
      );
      expect(await a.textContent()).toContain('Foto sintética 1');
      expect(await b.textContent()).toContain('Foto sintética 2');
      expect(await add().isDisabled()).toBe(true);
      expect(await panel.textContent()).toContain('No confirma mejoría');
      expect(await panel.textContent()).toContain('no identifica plantas');
      await panel.getByRole('button', { name: 'Intercambiar fotos', exact: true }).click();
      await a.getByText('Foto sintética 2', { exact: true }).waitFor();
      await b.getByText('Foto sintética 1', { exact: true }).waitFor();
      expect(await a.textContent()).toContain('Foto sintética 2');
      expect(await b.textContent()).toContain('Foto sintética 1');
      await history.getByLabel('Estado del diagnóstico', { exact: true }).selectOption('failed');
      await history
        .getByRole('button', { name: 'Aplicar filtros de diagnósticos', exact: true })
        .click();
      await history
        .getByText('No hay diagnósticos disponibles con los filtros aplicados en esta parcela.')
        .waitFor();
      expect(await panel.getByRole('img').count()).toBe(2);
      await comparisonPage.setViewportSize({ width: 1440, height: 1050 });
      const desktopA = await a.boundingBox(),
        desktopB = await b.boundingBox();
      expect(Math.abs(desktopA!.y - desktopB!.y)).toBeLessThan(2);
      expect(desktopB!.x).toBeGreaterThan(desktopA!.x);
      await panel.screenshot({ path: join(directory, 'ai-comparison-desktop.png') });
      await comparisonPage.setViewportSize({ width: 390, height: 844 });
      const mobileA = await a.boundingBox(),
        mobileB = await b.boundingBox();
      expect(mobileB!.y).toBeGreaterThan(mobileA!.y);
      expect(
        await comparisonPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await panel.screenshot({ path: join(directory, 'ai-comparison-mobile.png') });
      expect(mutations).toEqual([]);
      // An externally deleted diagnosis cannot retain an old image after explicit refresh.
      await db.aiDiagnosis.update({ where: { id: ids[0] }, data: { deletedAt: new Date() } });
      await b.getByRole('button', { name: 'Actualizar Foto B', exact: true }).click();
      await b.getByRole('alert').waitFor();
      expect(await b.getByRole('img').count()).toBe(0);
      expect(await b.textContent()).not.toContain('Foto sintética 1');
      expect(await a.getByRole('img').count()).toBe(1);
      await history
        .getByRole('button', { name: 'Limpiar filtros de diagnósticos', exact: true })
        .click();
      await history.getByRole('button', { name: 'Quitar de comparación', exact: true }).waitFor();
      const selected = history.locator('article').filter({
        has: comparisonPage.getByRole('button', { name: 'Quitar de comparación', exact: true }),
      });
      await selected.getByRole('button', { name: 'Eliminar análisis', exact: true }).click();
      const deleting = comparisonPage.waitForResponse((r) => r.request().method() === 'DELETE');
      await history.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
      expect((await deleting).status()).toBe(204);
      await panel
        .getByRole('article', { name: 'Foto A', exact: true })
        .getByRole('alert')
        .waitFor();
      expect(await panel.getByRole('img').count()).toBe(0);
      await panel.getByRole('button', { name: 'Limpiar comparación', exact: true }).click();
      await panel.getByRole('article').waitFor({ state: 'detached' });
      expect(await panel.getByRole('article').count()).toBe(0);
      expect(mutations).toEqual(['DELETE']);
      expect((await fetch(`${apiUrl}/api/v1/ai-diagnostics/${ids[2]}/image`)).status).toBe(401);
    } finally {
      await comparisonPage.close();
    }
  }, 45000);

  it('FARMER crea parcela propia desde móvil sin dispositivos ni datos inventados', async () => {
    const menu = page.getByRole('button', { name: 'Menú', exact: true });
    if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) === 'false') {
      await menu.click();
    }
    await page.getByRole('link', { name: 'Parcelas', exact: true }).click();
    await page.getByRole('heading', { name: 'Registrar una parcela propia' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel('Nombre', { exact: true }).fill('Cacao · Alta FARMER');
    await page.getByLabel('Ubicación', { exact: true }).fill('Chone · prueba');
    await page.getByLabel('Superficie en m² (opcional)', { exact: true }).fill('1200');
    const result = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/plots') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Crear parcela', exact: true }).click();
    const response = await result;
    expect(response.status()).toBe(201);
    const created = (await response.json()) as { id: string; ownerId: string };
    const db = app.get(PrismaService);
    const owner = await db.user.findUniqueOrThrow({ where: { email: 'browser@example.test' } });
    expect(created.ownerId).toBe(owner.id);
    expect(owner.role).toBe('FARMER');
    expect(await db.device.count({ where: { plotId: created.id } })).toBe(0);
    await text('main', 'Parcela creada');
    const card = page
      .locator('article')
      .filter({ has: page.getByRole('heading', { name: 'Cacao · Alta FARMER', exact: true }) });
    await card.waitFor();
    expect((await db.plot.findUniqueOrThrow({ where: { id: created.id } })).areaM2).toBe(1200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: join(directory, 'farmer-create-plot-mobile.png'),
      fullPage: true,
    });
    await card.getByRole('link', { name: 'Abrir panel de monitoreo' }).click();
    await text('main', 'No hay dispositivos disponibles');
    expect(errors).toEqual([]);
  });
  it('móvil y teclado cierran el menú; crear con respuesta perdida exige revisar y no duplica parcela', async () => {
    // Share the live cookie jar: copying a rotating refresh cookie invalidates
    // the original context on its next refresh and cascades failures to later tests.
    const ux = await page.context().newPage();
    await ux.setViewportSize({ width: 390, height: 844 });
    ux.setDefaultTimeout(7000);
    let step = 'acceso';
    try {
      await ux.goto(`${frontendUrl}/parcelas`);
      await ux.getByRole('heading', { name: 'Registrar una parcela propia' }).waitFor();
      const menu = ux.getByRole('button', { name: 'Menú', exact: true });
      step = 'abrir menú y Escape';
      await menu.click();
      await ux.locator('nav.expanded').waitFor({ state: 'visible' });
      await ux.locator('nav a').first().focus();
      await ux.keyboard.press('Escape');
      await ux.waitForFunction(
        () => document.querySelector('.menu-toggle')?.getAttribute('aria-expanded') === 'false',
      );
      expect(await menu.getAttribute('aria-expanded')).toBe('false');
      expect(await menu.evaluate((element) => document.activeElement === element)).toBe(true);
      step = 'cerrar menú al navegar';
      await menu.click();
      await ux.getByRole('link', { name: 'Parcelas', exact: true }).click();
      expect(await menu.getAttribute('aria-expanded')).toBe('false');
      const db = app.get(PrismaService);
      const owner = await db.user.findUniqueOrThrow({ where: { email: 'browser@example.test' } });
      const before = await db.plot.count({ where: { ownerId: owner.id } });
      let posts = 0;
      await ux.route('**/api/v1/plots', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        posts++;
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        // Simulate a lost acknowledgment after the server has actually committed.
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{}' });
      });
      await ux.getByLabel('Nombre', { exact: true }).fill('Cacao · Confirmación perdida');
      await ux.getByLabel('Ubicación', { exact: true }).fill('Datos sintéticos de interfaz');
      const create = ux.getByRole('button', { name: 'Crear parcela', exact: true });
      step = 'enviar con confirmación perdida';
      await create.click();
      await ux.getByText('No se confirmó la creación.', { exact: false }).waitFor();
      expect(await create.isDisabled()).toBe(true);
      expect(await ux.getByLabel('Nombre', { exact: true }).inputValue()).toBe(
        'Cacao · Confirmación perdida',
      );
      await create.evaluate((button: HTMLButtonElement) => button.click());
      expect(posts).toBe(1);
      step = 'consultar lista antes de otro envío';
      await ux.getByRole('button', { name: 'Actualizar', exact: true }).click();
      await ux
        .getByRole('heading', { name: 'Cacao · Confirmación perdida', exact: true })
        .waitFor();
      expect(await create.isEnabled()).toBe(true);
      expect(await db.plot.count({ where: { ownerId: owner.id } })).toBe(before + 1);
      expect(posts).toBe(1);
      expect(await ux.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await ux.screenshot({ path: join(directory, 'uncertain-plot-mobile.png'), fullPage: true });
    } catch (error) {
      throw new Error(`Falló el recorrido móvil en: ${step}`, { cause: error });
    } finally {
      await ux.close();
    }
  });
  it('barra lateral permanece visible al bajar en escritorio y permite recorrer el menú en pantalla baja', async () => {
    const checkSticky = async (selector: string) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      const before = await page.locator(selector).boundingBox();
      expect(before).not.toBeNull();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const after = await page.locator(selector).boundingBox();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
      // Layout/scroll coordinates can differ by a fractional CSS pixel in Chromium.
      expect(after!.y).toBeGreaterThanOrEqual(-1);
      expect(after!.height).toBeLessThanOrEqual(501);
    };
    await page.setViewportSize({ width: 1440, height: 500 });
    await checkSticky('.sidebar');
    await page.locator('.sidebar').evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const technical = page.locator('.sidebar-footer a');
    await technical.scrollIntoViewIfNeeded();
    const link = await technical.boundingBox();
    expect(link).not.toBeNull();
    expect(link!.y).toBeGreaterThanOrEqual(-1);
    expect(link!.y + link!.height).toBeLessThanOrEqual(501);
    await page.screenshot({
      path: join(directory, 'sticky-dashboard-desktop.png'),
      fullPage: false,
    });
    await page.getByRole('link', { name: 'Parcelas', exact: true }).click();
    await page.getByRole('heading', { name: 'Registrar una parcela propia' }).waitFor();
    await checkSticky('aside');
    await page.screenshot({ path: join(directory, 'sticky-plots-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.locator('aside').evaluate((element) => getComputedStyle(element).position),
    ).toBe('static');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
  it('navegación compartida muestra clima en escritorio y vuelve al monitoreo desde el menú móvil', async () => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${frontendUrl}/parcelas/${plotId}/dashboard`);
    await page.getByRole('link', { name: 'Clima histórico', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Clima histórico de la parcela', exact: true })
      .waitFor();
    await page.getByRole('heading', { name: 'Ubicación para clima', exact: true }).waitFor();
    expect(await page.locator('app-page-header .connection').count()).toBe(0);
    expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1);
    expect(await page.locator('nav a[aria-current="page"]').count()).toBe(1);
    expect(await page.locator('nav a[aria-current="page"]').textContent()).toContain(
      'Clima histórico',
    );
    await page.screenshot({ path: join(directory, 'weather-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Menú', exact: true }).click();
    await page.getByRole('link', { name: 'Monitoreo', exact: true }).click();
    await page.waitForURL(`**/parcelas/${plotId}/dashboard#readings`);
    await page.locator('app-soil-sensor-card').first().waitFor();
    expect(await page.locator('app-soil-sensor-card').count()).toBe(1);
    expect(errors).toEqual([]);
  });
  it('estado del sistema distingue fallo parcial, evita reintentos simultáneos y recupera salud', async () => {
    const context = await browser.newContext();
    const statusPage = await context.newPage();
    let available = false;
    let healthRequests = 0;
    try {
      await statusPage.route('**/api/v1/health/live', async (route) => {
        healthRequests++;
        await route.fulfill({ json: { status: 'ok' } });
      });
      await statusPage.route('**/api/v1/health/ready', async (route) => {
        healthRequests++;
        await route.fulfill({
          status: available ? 200 : 503,
          json: { status: available ? 'ok' : 'error', database: available ? 'up' : 'down' },
        });
      });
      await statusPage.goto(`${frontendUrl}/estado`);
      await statusPage.getByRole('heading', { name: 'No disponible', exact: true }).waitFor();
      expect(await statusPage.locator('.badge.good').count()).toBe(1);
      expect(await statusPage.locator('.service-warning').textContent()).toContain(
        'ni se modifica el riego',
      );
      for (const width of [320, 390, 768, 1440]) {
        await statusPage.setViewportSize({ width, height: 900 });
        expect(
          await statusPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (width === 390 || width === 1440)
          await statusPage.screenshot({
            path: join(directory, `system-status-partial-${width}.png`),
            fullPage: true,
          });
      }
      expect(healthRequests).toBe(2);
      available = true;
      await statusPage.getByRole('button', { name: 'Volver a comprobar', exact: true }).click();
      await statusPage.waitForFunction(() => document.querySelectorAll('.badge.good').length === 2);
      expect(await statusPage.locator('.service-warning').count()).toBe(0);
      expect(healthRequests).toBe(4);
      expect(
        await statusPage
          .getByRole('link', { name: 'Acceder a la plataforma', exact: true })
          .isVisible(),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });

  it('clima almacenado filtra sin consultas externas y muestra cero, ausencia y fuente en móvil', async () => {
    const climatePage = await page.context().newPage();
    let weatherGets = 0;
    const writes: string[] = [];
    try {
      await climatePage.route(`**/api/v1/plots/${plotId}/weather`, async (route) => {
        weatherGets++;
        await route.fulfill({
          json: {
            provider: 'disabled',
            profile: {
              latitude: -0.7,
              longitude: -80.1,
              timezone: 'America/Guayaquil',
              enabled: false,
              version: 1,
              updatedAt: '2026-11-01T00:00:00Z',
              consentAt: null,
              syncedAt: null,
              nextAttemptAt: null,
              lastError: null,
            },
            items: [
              {
                date: '2026-11-01',
                variable: 'temperature_2m',
                unit: '°C',
                value: 0,
                quality: 'modeled',
              },
              {
                date: '2026-11-01',
                variable: 'precipitation',
                unit: 'mm',
                value: null,
                quality: 'missing',
              },
            ],
            provenance: {
              provider: 'Open-Meteo',
              dataset: 'ERA5',
              model: 'era5',
              requestedLatitude: -0.7,
              requestedLongitude: -80.1,
              gridLatitude: -0.75,
              gridLongitude: -80,
              timezone: 'America/Guayaquil',
              resolution: '0.25°',
              sourceTemporalResolution: 'hourly',
              aggregation: 'daily',
              adapterVersion: 'fixture',
              licence: 'CC BY 4.0',
              attribution: 'Open-Meteo / ECMWF',
              fetchedAt: '2026-11-02T00:00:00Z',
              from: '2026-11-01',
              to: '2026-11-01',
            },
          },
        });
      });
      climatePage.on('request', (request) => {
        if (request.url().includes(`/plots/${plotId}/weather`) && request.method() !== 'GET')
          writes.push(request.method());
      });
      await climatePage.goto(`${frontendUrl}/parcelas/${plotId}/clima`);
      await climatePage.locator('tbody tr').first().waitFor();
      expect(await climatePage.locator('tbody tr').count()).toBe(2);
      expect(await climatePage.locator('tbody').textContent()).toContain('0 °C');
      expect(await climatePage.locator('.provenance.stale').textContent()).toContain(
        'Consulta antigua',
      );
      expect(await climatePage.locator('form').count()).toBe(0);
      for (const width of [320, 390, 768, 1440]) {
        await climatePage.setViewportSize({ width, height: 1000 });
        expect(
          await climatePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (width === 390 || width === 1440)
          await climatePage.screenshot({
            path: join(directory, `weather-stored-${width}.png`),
            fullPage: true,
          });
      }
      await climatePage
        .getByLabel('Variable meteorológica', { exact: true })
        .selectOption('precipitation');
      expect(await climatePage.locator('tbody tr').count()).toBe(1);
      expect(await climatePage.locator('tbody').textContent()).toContain('No disponible');
      expect(await climatePage.locator('tbody').textContent()).toContain('Incompleto');
      await climatePage.getByLabel('Variable meteorológica', { exact: true }).selectOption('');
      expect(await climatePage.locator('tbody tr').count()).toBe(2);
      expect(weatherGets).toBe(1);
      expect(writes).toEqual([]);
    } finally {
      await climatePage.close();
    }
  });

  it('predicción muestra cobertura y descarga JSON DEMO privado sin entrenar, con errores y navegación móvil', async () => {
    const predictionPage = await page.context().newPage();
    const unexpected: string[] = [];
    predictionPage.on('request', (request) => {
      if (
        (request.url().includes('/predictions') && request.method() !== 'GET') ||
        request.url().includes('/weather/sync') ||
        request.url().includes('api.open-meteo.com') ||
        request.url().includes('api.openai.com')
      )
        unexpected.push(request.url());
    });
    try {
      await predictionPage.setViewportSize({ width: 1440, height: 1000 });
      await predictionPage.goto(`${frontendUrl}/parcelas/${plotId}/dashboard`);
      await predictionPage.getByRole('link', { name: /Predicción hídrica/ }).click();
      await predictionPage.getByLabel('Equipo', { exact: true }).waitFor();
      expect(await predictionPage.locator('article').count()).toBe(0);
      await predictionPage.getByLabel('Equipo', { exact: true }).selectOption(deviceId);
      await predictionPage.locator('.source.demo').waitFor();
      expect(await predictionPage.locator('article').count()).toBe(1);
      expect(await predictionPage.locator('main').textContent()).toContain(
        'sin validación de campo',
      );
      expect(await predictionPage.locator('main').textContent()).toContain('30 días completos UTC');
      expect(await predictionPage.locator('nav a[aria-current="page"]').count()).toBe(1);
      expect(await predictionPage.locator('app-page-header .connection').count()).toBe(0);
      const panel = predictionPage.locator('app-offline-export');
      const to = new Date(Math.floor(Date.now() / 86400000) * 86400000);
      const day = (offset: number) =>
        new Date(to.getTime() + offset * 86400000).toISOString().slice(0, 10);
      await panel.getByLabel('Desde (UTC)', { exact: true }).fill(day(-30));
      await panel.getByLabel('Fin de entrenamiento (UTC)', { exact: true }).fill(day(-20));
      await panel.getByLabel('Fin de validación (UTC)', { exact: true }).fill(day(-10));
      await panel.getByLabel('Hasta exclusivo (UTC)', { exact: true }).fill(day(0));
      const button = panel.getByRole('button', {
        name: 'Descargar JSON para evaluación offline',
        exact: true,
      });
      let downloads = 0;
      predictionPage.on('download', () => downloads++);
      const pendingDownload = predictionPage.waitForEvent('download');
      await button.click();
      const download = await pendingDownload;
      expect(download.suggestedFilename()).toBe(
        `cacaosmart-offline-demo-${deviceId}-${day(-30)}-${day(0)}.json`,
      );
      const target = join(directory, 'offline-demo.json');
      await download.saveAs(target);
      const contents = await readFile(target, 'utf8');
      const exported = parsePersistenceInput(JSON.parse(contents));
      expect(exported).toMatchObject({
        plotId,
        deviceId,
        source: 'demo',
        from: day(-30),
        trainUntil: day(-20),
        validationUntil: day(-10),
        toExclusive: day(0),
      });
      expect(contents).not.toMatch(
        /passwordHash|credentialHash|accessToken|refreshHash|calibrationMetadata/,
      );
      await panel.getByRole('status').waitFor();
      const count = await app.get(PrismaService).reading.count();
      await panel.getByLabel('Fin de entrenamiento (UTC)', { exact: true }).fill(day(-30));
      await button.click();
      await panel.getByRole('alert').filter({ hasText: 'Desde <' }).waitFor();
      expect(downloads).toBe(1);
      await panel.getByLabel('Fin de entrenamiento (UTC)', { exact: true }).fill(day(-20));
      const exportRoute = '**/predictions/offline-input.json*';
      await predictionPage.route(
        exportRoute,
        (route) => route.fulfill({ status: 413, contentType: 'application/json', body: '{}' }),
        { times: 1 },
      );
      await button.click();
      await panel
        .getByRole('alert')
        .filter({ hasText: 'No se descargó un archivo parcial' })
        .waitFor();
      expect(await panel.getByLabel('Desde (UTC)', { exact: true }).inputValue()).toBe(day(-30));
      expect(downloads).toBe(1);
      await predictionPage.route(
        exportRoute,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ...exported, deviceId: randomUUID() }),
          }),
        { times: 1 },
      );
      await button.click();
      await panel.getByRole('alert').filter({ hasText: 'archivo compatible' }).waitFor();
      expect(downloads).toBe(1);
      const retryDownload = predictionPage.waitForEvent('download');
      await button.click();
      await (await retryDownload).saveAs(join(directory, 'offline-demo-retry.json'));
      expect(downloads).toBe(2);
      expect(await app.get(PrismaService).reading.count()).toBe(count);
      for (const width of [320, 390, 768, 1440]) {
        await predictionPage.setViewportSize({ width, height: 1000 });
        expect(
          await predictionPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (width === 390 || width === 1440)
          await predictionPage.screenshot({
            path: join(directory, `prediction-${width}.png`),
            fullPage: true,
          });
      }
      await predictionPage.setViewportSize({ width: 390, height: 844 });
      await predictionPage.getByRole('button', { name: 'Menú', exact: true }).click();
      await predictionPage.getByRole('link', { name: 'Monitoreo', exact: true }).click();
      await predictionPage.waitForURL(`**/parcelas/${plotId}/dashboard#readings`);
      expect(unexpected).toEqual([]);
    } finally {
      await predictionPage.close();
    }
  });

  it('referencia experimental muestra cero, gráficos, errores, corte UTC y móvil sin escribir lecturas', async () => {
    const db = app.get(PrismaService);
    const sensors = await db.sensor.findMany({
      where: { deviceId, code: { in: ['soil_1', 'soil_2', 'soil_3'] } },
    });
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    for (const daysBefore of [3, 2, 1]) {
      const time = new Date(cutoff.getTime() - (daysBefore - 1) * 86400000 - 100);
      await db.reading.create({
        data: {
          deviceId,
          eventId: `forecast-browser-${daysBefore}`,
          source: 'demo',
          payloadHash: 'c'.repeat(64),
          recordedAt: time,
          effectiveAt: time,
          receivedAt: time,
          timestampOrigin: 'device',
          quality: {},
          soilReadings: {
            create: sensors.map((sensor) => ({
              sensorId: sensor.id,
              quality: 'valid',
              moisturePct: sensor.code === 'soil_1' ? (daysBefore === 1 ? 0 : 20) : 60,
            })),
          },
        },
      });
    }
    const before = await db.reading.count();
    const forecastPage = await page.context().newPage();
    try {
      await forecastPage.goto(`${frontendUrl}/parcelas/${plotId}/prediccion`);
      await forecastPage.getByLabel('Equipo', { exact: true }).selectOption(deviceId);
      await forecastPage.locator('.source.demo').waitFor();
      const panel = forecastPage.locator('app-experimental-forecast');
      const button = panel.getByRole('button', {
        name: 'Consultar referencia experimental',
        exact: true,
      });
      await button.click();
      await panel.locator('.zone .value').first().filter({ hasText: '0 %' }).waitFor();
      expect(await panel.locator('svg[role="img"]').count()).toBe(1);
      expect(await panel.locator('table').count()).toBe(1);
      expect(await panel.textContent()).toContain('sin validación de campo');
      expect(await panel.textContent()).toContain('MAE (puntos porcentuales)');
      expect(await panel.textContent()).toContain('Corte de información');
      await forecastPage.route(
        '**/predictions/experimental?*',
        (route) => route.fulfill({ status: 503, body: '{}' }),
        { times: 1 },
      );
      await button.click();
      await panel.getByRole('alert').filter({ hasText: 'Reintenta' }).waitFor();
      expect(await panel.locator('.zone').count()).toBe(0);
      await button.click();
      await panel.locator('.zone .value').first().filter({ hasText: '0 %' }).waitFor();
      for (const width of [320, 390, 768, 1440]) {
        await forecastPage.setViewportSize({ width, height: 1000 });
        await panel
          .locator('details')
          .first()
          .evaluate((element) => {
            (element as HTMLDetailsElement).open = true;
          });
        expect(
          await forecastPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (width === 390 || width === 1440)
          await forecastPage.screenshot({
            path: join(directory, `experimental-forecast-${width}.png`),
            fullPage: true,
          });
      }
      await forecastPage.getByLabel('Equipo', { exact: true }).selectOption('');
      await panel.locator('.zone').first().waitFor({ state: 'detached' });
      expect(await db.reading.count()).toBe(before);
    } finally {
      await forecastPage.close();
    }
  }, 60000);

  it('regresión registrada muestra estimación, persistencia, métricas y recuperación en móvil sin entrenar', async () => {
    const db = app.get(PrismaService);
    const plot = await db.plot.findUniqueOrThrow({ where: { id: plotId } });
    const sensors = await db.sensor.findMany({
      where: { deviceId, code: { in: ['soil_1', 'soil_2', 'soil_3'] } },
    });
    const cutoff = new Date();
    cutoff.setUTCHours(0, 0, 0, 0);
    const run = syntheticRegressionRun(
      { plotId, deviceId, sensors },
      new Date(cutoff.getTime() - 2 * 86400000),
    );
    await registerRegressionPublication(
      db,
      plot.ownerId,
      publicationsFromRun(run.input, run.report, new Date()),
      createHash('sha256').update(JSON.stringify(run.report)).digest('hex'),
    );
    const before = await db.reading.count();
    const regressionPage = await page.context().newPage();
    try {
      await regressionPage.goto(`${frontendUrl}/parcelas/${plotId}/prediccion`);
      await regressionPage.getByLabel('Equipo', { exact: true }).selectOption(deviceId);
      await regressionPage.locator('.source.demo').waitFor();
      const panel = regressionPage.locator('app-regression-forecast');
      const button = panel.getByRole('button', {
        name: 'Consultar regresión experimental',
        exact: true,
      });
      await button.click();
      await panel.locator('.zone .value').first().filter({ hasText: '10 %' }).waitFor();
      expect(await panel.textContent()).toContain('Persistencia con las mismas entradas');
      expect(await panel.textContent()).toContain('Sin validación de campo');
      expect(await panel.textContent()).toContain('linear-two-lag-1.0.0');
      await panel
        .locator('details')
        .first()
        .evaluate((element) => {
          (element as HTMLDetailsElement).open = true;
        });
      expect(await panel.locator('table').count()).toBe(2);
      for (const width of [320, 390, 768, 1440]) {
        await regressionPage.setViewportSize({ width, height: 1000 });
        expect(
          await regressionPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        if (width === 390 || width === 1440)
          await regressionPage.screenshot({
            path: join(directory, `regression-forecast-${width}.png`),
            fullPage: true,
          });
      }
      await regressionPage.route(
        '**/predictions/regression?*',
        (route) => route.fulfill({ status: 503, body: '{}' }),
        { times: 1 },
      );
      await button.click();
      await panel.getByRole('alert').filter({ hasText: 'Reintenta' }).waitFor();
      expect(await panel.locator('.zone').count()).toBe(0);
      await button.click();
      await panel.locator('.zone .value').first().filter({ hasText: '10 %' }).waitFor();
      await regressionPage.getByLabel('Equipo', { exact: true }).selectOption('');
      await panel.locator('.zone').first().waitFor({ state: 'detached' });
      expect(await db.reading.count()).toBe(before);
    } finally {
      await regressionPage.close();
    }
  }, 60000);

  it('encabezado común soporta nombres largos en cinco pantallas y 320/390/768/1440 px', async () => {
    const db = app.get(PrismaService);
    const plot = await db.plot.findUniqueOrThrow({ where: { id: plotId } });
    const owner = await db.user.findUniqueOrThrow({ where: { id: plot.ownerId } });
    const name =
      'Parcela de demostración con un nombre largo para validar el encabezado compartido';
    const userName =
      'Productora de demostración con nombre largo para comprobar la adaptación móvil';
    try {
      await db.plot.update({
        where: { id: plot.id },
        data: { name, locationLabel: 'Ubicación de prueba aislada · Chone, Manabí, Ecuador' },
      });
      await db.user.update({ where: { id: owner.id }, data: { name: userName } });
      const routes = [
        ['dashboard', `/parcelas/${plotId}/dashboard`],
        ['plots', '/parcelas'],
        ['diagnosis', `/diagnostico-ia?plotId=${plotId}`],
        ['weather', `/parcelas/${plotId}/clima`],
        ['prediction', `/parcelas/${plotId}/prediccion`],
      ];
      for (const [label, route] of routes) {
        await page.goto(frontendUrl + route);
        const header = page.locator('app-page-header');
        await header.getByText(userName, { exact: true }).waitFor();
        if (label !== 'plots') await header.getByText(name, { exact: true }).waitFor();
        expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1);
        if (label !== 'dashboard') expect(await header.locator('.connection').count()).toBe(0);
        for (const width of [1440, 768, 390, 320]) {
          await page.setViewportSize({ width, height: 1000 });
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          expect(await header.getByRole('button', { name: 'Salir', exact: true }).isVisible()).toBe(
            true,
          );
          if (width === 1440 || width === 390) {
            await header.screenshot({ path: join(directory, `header-${label}-${width}.png`) });
            await page.screenshot({
              path: join(directory, `unified-${label}-${width}.png`),
              fullPage: false,
            });
          }
          const main = await page.locator('.main-area').boundingBox();
          expect(main).not.toBeNull();
          expect(Math.round(main!.x)).toBe(width <= 900 ? 0 : 240);
        }
      }
      await page.locator('app-page-header').getByRole('link', { name: 'Cambiar parcela' }).click();
      await page.waitForURL('**/parcelas');
      await page.getByRole('heading', { name: 'Mis parcelas', exact: true }).waitFor();
    } finally {
      await db.plot.update({
        where: { id: plot.id },
        data: { name: plot.name, locationLabel: plot.locationLabel },
      });
      await db.user.update({ where: { id: owner.id }, data: { name: owner.name } });
    }
    expect(errors).toEqual([]);
  }, 45000);
  it('salir desde IA revoca sesión, limpia la fotografía y protege la recarga', async () => {
    // Use the current cookie jar, not a copy of another context's rotating cookie.
    const route = `/diagnostico-ia?plotId=${plotId}`;
    await page.goto(frontendUrl + route);
    await page.getByRole('heading', { name: 'Fotografía de la planta', exact: true }).waitFor();
    const bytes = await sharp({
      create: { width: 40, height: 30, channels: 3, background: '#387e3e' },
    })
      .jpeg()
      .toBuffer();
    await page
      .getByLabel('Subir imagen de la planta', { exact: true })
      .setInputFiles({ name: 'fixture.jpg', mimeType: 'image/jpeg', buffer: bytes });
    await page.locator('img.preview').waitFor();
    const response = page.waitForResponse(
      (value) => value.url().endsWith('/api/v1/auth/logout') && value.request().method() === 'POST',
    );
    await page
      .locator('app-page-header')
      .getByRole('button', { name: 'Salir', exact: true })
      .click();
    expect((await response).status()).toBe(204);
    await page.waitForURL('**/login');
    expect(
      await page.locator('app-page-header, img.preview, app-diagnosis-comparison-card').count(),
    ).toBe(0);
    await page.goto(frontendUrl + route);
    await page.waitForURL('**/login');
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).waitFor();
    expect(errors).toEqual([]);
  }, 45000);
});
