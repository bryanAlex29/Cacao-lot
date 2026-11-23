import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { IncomingHttpHeaders } from 'node:http';
import { PrismaService } from '../database/prisma.service';

export const SESSION_COOKIE = 'cacaosmart_session';
export const SESSION_HOURS = 8;
export interface SessionRequest {
  headers: IncomingHttpHeaders;
  get(name: string): string | undefined;
  body?: unknown;
}
interface SessionCookieOptions {
  httpOnly: boolean;
  sameSite: 'strict';
  secure: boolean;
  path: string;
  expires?: Date;
}
export interface SessionResponse {
  cookie(name: string, value: string, options: SessionCookieOptions): unknown;
  clearCookie(name: string, options: SessionCookieOptions): unknown;
}
const hash = (secret: string) => createHash('sha256').update(secret).digest('hex');
const matches = (actual: string, expected: string | null) =>
  !!expected &&
  actual.length === expected.length &&
  timingSafeEqual(Buffer.from(actual), Buffer.from(expected));

@Injectable()
export class BrowserSessionService {
  constructor(
    private readonly db: PrismaService,
    private readonly config: ConfigService,
  ) {}

  requireOrigin(req: SessionRequest, action = false): void {
    if (req.headers.origin && req.headers.origin !== this.config.getOrThrow<string>('CORS_ORIGIN'))
      throw new ForbiddenException('Origen no permitido');
    if (
      action &&
      (req.headers.origin !== this.config.getOrThrow<string>('CORS_ORIGIN') ||
        req.get('X-CacaoSmart-Session') !== '1')
    )
      throw new ForbiddenException('Solicitud de sesión no permitida');
    if (
      action &&
      req.body !== undefined &&
      (!req.body ||
        typeof req.body !== 'object' ||
        Array.isArray(req.body) ||
        Object.keys(req.body as object).length)
    )
      throw new BadRequestException('La acción de sesión no admite campos');
  }

  private credentials(req: SessionRequest) {
    const values =
      req.headers.cookie
        ?.split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith(`${SESSION_COOKIE}=`)) ?? [];
    if (values.length !== 1) return null;
    const [id, secret, extra] = values[0]!.slice(SESSION_COOKIE.length + 1).split('.');
    return id && isUUID(id, '4') && secret && /^[A-Za-z0-9_-]{43}$/.test(secret) && !extra
      ? { id, hash: hash(secret) }
      : null;
  }

  setCookie(res: SessionResponse, value: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, value, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }
  clearCookie(res: SessionResponse): void {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.config.get('NODE_ENV') === 'production',
      path: '/api/v1/auth',
    });
  }

  async create(userId: string) {
    const secret = randomBytes(32).toString('base64url');
    const createdAt = new Date(),
      expiresAt = new Date(createdAt.getTime() + SESSION_HOURS * 3600000);
    const session = await this.db.authSession.create({
      data: { userId, refreshHash: hash(secret), createdAt, expiresAt },
    });
    return { id: session.id, expiresAt, cookie: `${session.id}.${secret}` };
  }

  async refresh(req: SessionRequest) {
    this.requireOrigin(req, true);
    const credentials = this.credentials(req);
    if (!credentials) throw new UnauthorizedException('Sesión inválida o caducada');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id = ${credentials.id}::uuid FOR UPDATE`;
      const row = await tx.authSession.findUnique({
        where: { id: credentials.id },
        include: {
          user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        },
      });
      const now = new Date();
      if (!row || row.revokedAt || row.expiresAt <= now || !row.user.isActive)
        throw new UnauthorizedException('Sesión inválida o caducada');
      const current = matches(credentials.hash, row.refreshHash);
      const concurrent =
        row.previousUntil && row.previousUntil > now && matches(credentials.hash, row.previousHash);
      if (!current && !concurrent) throw new UnauthorizedException('Sesión inválida o caducada');
      // A concurrent tab may use the previous token for five seconds. Do not replace its cookie.
      let cookie: string | null = null;
      if (current) {
        const secret = randomBytes(32).toString('base64url');
        await tx.authSession.update({
          where: { id: row.id },
          data: {
            refreshHash: hash(secret),
            previousHash: row.refreshHash,
            previousUntil: new Date(now.getTime() + 5000),
          },
        });
        cookie = `${row.id}.${secret}`;
      }
      const { id, name, email, role } = row.user;
      const user = { id, name, email, role };
      return { id: row.id, expiresAt: row.expiresAt, cookie, user };
    });
  }

  async revoke(req: SessionRequest): Promise<void> {
    const credentials = this.credentials(req);
    if (!credentials) return;
    // Revoke by proof of possession, not an ID supplied by the client. Either rotation is safe for logout.
    await this.db.authSession.updateMany({
      where: {
        id: credentials.id,
        OR: [{ refreshHash: credentials.hash }, { previousHash: credentials.hash }],
      },
      data: { revokedAt: new Date() },
    });
  }

  async active(id: string, userId: string): Promise<boolean> {
    if (!isUUID(id, '4')) return false;
    return !!(await this.db.authSession.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    }));
  }
}
