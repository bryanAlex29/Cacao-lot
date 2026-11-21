import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { isUUID } from 'class-validator';
import type {
  DeviceStatusEvent,
  TelemetrySubscription,
  TelemetryUpdatedEvent,
} from '@cacaosmart/contracts';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../database/prisma.service';
import { SourcePolicy } from '../integrations/source-policy.service';
import { connectionStatus } from '../devices/connection-status';

interface ClientState {
  token: string;
  subscription?: TelemetrySubscription;
  revision: number;
  joins: number;
  window: number;
  status?: string;
}

@Injectable()
export class RealtimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private server?: Server;
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;
  private readonly clients = new Map<Socket, ClientState>();

  constructor(
    private readonly http: HttpAdapterHost,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly db: PrismaService,
    private readonly sources: SourcePolicy,
  ) {}

  onApplicationBootstrap(): void {
    const origin = this.config.getOrThrow<string>('CORS_ORIGIN');
    const server = new Server(this.http.httpAdapter.getHttpServer(), {
      path: '/socket.io',
      maxHttpBufferSize: 16384,
      cors: { origin, methods: ['GET', 'POST'] },
      allowRequest: (req, done) => done(null, !req.headers.origin || req.headers.origin === origin),
    });
    this.server = server;
    const namespace = server.of('/telemetry');
    namespace.use(async (socket, next) => {
      const token: unknown = socket.handshake.auth['token'];
      try {
        if (socket.handshake.headers.origin && socket.handshake.headers.origin !== origin)
          throw new Error();
        if (typeof token !== 'string' || token.length > 4096) throw new Error();
        if (
          [...this.clients.keys()].filter((s) => s.handshake.address === socket.handshake.address)
            .length >= 20
        )
          throw new Error();
        await this.auth.authenticate(token);
        this.clients.set(socket, { token, revision: 0, joins: 0, window: Date.now() });
        next();
      } catch {
        next(new Error('Sesión no autorizada'));
      }
    });
    namespace.on('connection', (socket) => {
      socket.on('disconnect', () => this.clients.delete(socket));
      socket.on('subscribe', (input: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        void this.subscribe(socket, input).then(
          (result) => ack(result),
          () => ack({ ok: false, message: 'Suscripción no autorizada' }),
        );
      });
    });
    this.timer = setInterval(() => {
      void this.scan();
    }, 5000);
    this.timer.unref();
  }

  private async subscribe(socket: Socket, input: unknown) {
    const state = this.clients.get(socket);
    if (!state) return { ok: false };
    const revision = ++state.revision;
    state.subscription = undefined;
    state.status = undefined;
    for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
    if (Date.now() - state.window > 60000) {
      state.joins = 0;
      state.window = Date.now();
    }
    if (++state.joins > 20) return { ok: false, message: 'Demasiadas suscripciones' };
    if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false };
    const record = input as Record<string, unknown>;
    if (
      Object.keys(record).some((key) => !['plotId', 'deviceId', 'source'].includes(key)) ||
      typeof record['plotId'] !== 'string' ||
      !isUUID(record['plotId'], '4') ||
      typeof record['deviceId'] !== 'string' ||
      !isUUID(record['deviceId'], '4') ||
      (record['source'] !== 'real' && record['source'] !== 'demo')
    )
      return { ok: false };
    const subscription = record as unknown as TelemetrySubscription;
    if (!(await this.authorize(state, subscription)))
      return { ok: false, message: 'Suscripción no autorizada' };
    if (!socket.connected || revision !== state.revision) return { ok: false };
    state.subscription = { ...subscription };
    await socket.join(
      `plot:${subscription.plotId}:${subscription.source}:${subscription.deviceId}`,
    );
    return { ok: true };
  }

  private async authorize(state: ClientState, sub: TelemetrySubscription) {
    const user = await this.auth.authenticate(state.token);
    if (!this.sources.allows(sub.source)) return null;
    return this.db.device.findFirst({
      where: {
        id: sub.deviceId,
        plotId: sub.plotId,
        source: sub.source,
        plot: { ownerId: user.id, archivedAt: null },
      },
      select: { id: true, isActive: true, lastSeenAt: true, expectedIntervalSeconds: true },
    });
  }

  async publish(event: TelemetryUpdatedEvent): Promise<void> {
    // Solo después del commit y para eventos únicos. Revalidar cada destinatario.
    await Promise.all(
      [...this.clients].map(async ([socket, state]) => {
        const sub = state.subscription;
        if (
          !sub ||
          sub.plotId !== event.plotId ||
          sub.deviceId !== event.reading.deviceId ||
          sub.source !== event.reading.source
        )
          return;
        try {
          const device = await this.authorize(state, sub);
          if (!device) {
            socket.disconnect(true);
            return;
          }
          if (socket.connected && state.subscription === sub)
            socket.emit('telemetry.updated', event);
        } catch {
          socket.disconnect(true);
        }
      }),
    );
  }

  private async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      await Promise.all(
        [...this.clients].map(async ([socket, state]) => {
          try {
            const sub = state.subscription;
            if (!sub) {
              await this.auth.authenticate(state.token);
              return;
            }
            const device = await this.authorize(state, sub);
            if (!device) {
              socket.disconnect(true);
              return;
            }
            const event: DeviceStatusEvent = {
              ...sub,
              status: connectionStatus(device).toLowerCase() as DeviceStatusEvent['status'],
              lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
              expectedIntervalSeconds: device.expectedIntervalSeconds,
            };
            const signature = JSON.stringify(event);
            if (socket.connected && state.subscription === sub && state.status !== signature) {
              state.status = signature;
              socket.emit('device.status', event);
            }
          } catch {
            socket.disconnect(true);
          }
        }),
      );
    } finally {
      this.scanning = false;
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
    this.clients.clear();
    this.server?.disconnectSockets(true);
    this.server?.engine.close();
  }
}
