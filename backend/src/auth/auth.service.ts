import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { isUUID } from 'class-validator';
import type { Environment } from '../config/environment';
import { UsersRepository } from '../users/users.repository';
import { PasswordService } from './password.service';
import type { AuthenticatedUser } from './auth.types';
import { LoginDto, LoginResponseDto, RegisterDto } from './auth.dto';
import { UsersService } from '../users/users.service';
import { BrowserSessionService } from './browser-session.service';
import type { SessionRequest } from './browser-session.service';

export const TOKEN_ISSUER = 'cacaosmart-api';
export const TOKEN_AUDIENCE = 'cacaosmart-web';
export const TOKEN_SECONDS = 900;

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Environment, true>,
    private readonly accounts: UsersService,
    private readonly sessions: BrowserSessionService,
  ) {}

  async login(input: LoginDto) {
    const account = await this.users.findForLogin(input.email);
    const valid = await this.passwords.verify(account?.passwordHash, input.password);
    if (!valid || !account?.isActive) throw new UnauthorizedException('Credenciales incorrectas');
    const user: AuthenticatedUser = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
    };
    const session = await this.sessions.create(user.id);
    return { ...session, body: await this.issueSession(user, session.id, session.expiresAt) };
  }

  async register(input: RegisterDto) {
    // Reutiliza alta segura: rol FARMER fijado en servidor, hash Argon2id y unicidad.
    const user = await this.accounts.create(input);
    const session = await this.sessions.create(user.id);
    return { ...session, body: await this.issueSession(user, session.id, session.expiresAt) };
  }

  async refresh(req: SessionRequest) {
    const session = await this.sessions.refresh(req);
    return {
      ...session,
      body: await this.issueSession(session.user, session.id, session.expiresAt),
    };
  }

  private async issueSession(
    user: AuthenticatedUser,
    sessionId: string,
    expiresAt: Date,
  ): Promise<LoginResponseDto> {
    const expiresIn = Math.max(
      1,
      Math.min(TOKEN_SECONDS, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    );
    const accessToken = await this.jwt.signAsync(
      { sid: sessionId },
      {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        algorithm: 'HS256',
        subject: user.id,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn,
        jwtid: randomUUID(),
      },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn, user };
  }

  async authenticate(token: string): Promise<AuthenticatedUser> {
    let claims: Record<string, unknown>;
    try {
      claims = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        algorithms: ['HS256'],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        maxAge: '15m',
      });
      if (
        typeof claims['sub'] !== 'string' ||
        !isUUID(claims['sub']) ||
        typeof claims['exp'] !== 'number'
      )
        throw new Error('Invalid claims');
    } catch {
      throw new UnauthorizedException('Sesión inválida o caducada');
    }
    // El rol y el estado activo se consultan en base; no se confía en un rol del JWT.
    const user = await this.users.findActive(claims['sub'] as string);
    if (!user) throw new UnauthorizedException('Sesión inválida o caducada');
    if (
      claims['sid'] !== undefined &&
      (typeof claims['sid'] !== 'string' || !(await this.sessions.active(claims['sid'], user.id)))
    )
      throw new UnauthorizedException('Sesión inválida o caducada');
    return user;
  }
}
