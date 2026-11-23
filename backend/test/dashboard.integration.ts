import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, Page } from 'playwright-core';
import { spawn, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, writeFile, access, readFile } from 'node:fs/promises';
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
import { MoistureRepository } from '../src/alerts/moisture/moisture.repository';
import type { SensorStatusEvent } from '@cacaosmart/contracts';

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
    page.on('response', (response) => {
      if (response.status() === 429) unexpectedRateLimits.push(new URL(response.url()).pathname);
    });
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
    await text('app-soil-sensor-card:nth-child(2) app-sensor-range', 'Mín. 30 %');
    await text('app-soil-sensor-card:nth-child(3) app-sensor-range', 'Sin rango configurado');
    await text('.environment app-sensor-range', 'Mín. 18 °C');
    expect(await page.locator('app-sensor-range').count()).toBe(5);
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
      await text('app-soil-sensor-card:nth-child(2) app-sensor-range', 'Mín. 30 %');
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

  it('Socket.IO actualiza clasificación de cinco sensores sin inferir calibración o rangos ausentes', async () => {
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
    await page
      .locator('app-soil-sensor-card:nth-child(2) .assessment[data-comparison="low"]')
      .waitFor();
    await page
      .locator('app-soil-sensor-card:nth-child(3) .assessment[data-comparison="unconfigured"]')
      .waitFor();
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
  });

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
    expect(await chart.locator('svg path').count()).toBe(3);
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
      expect(await chart.locator('svg path').count()).toBe(3);
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
    expect(await chart.locator('svg path').count()).toBe(3);
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
      expect(await page.locator('app-soil-history-chart svg path').count()).toBe(3);
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
    await panel.locator('summary').click();
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
        await panel.locator('summary').click();
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
        expect(await panel.locator('form').count()).toBe(0);
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

  it('FARMER crea parcela propia desde móvil sin dispositivos ni datos inventados', async () => {
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
});
