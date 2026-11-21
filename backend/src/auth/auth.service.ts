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
  ) {}

  async login(input: LoginDto): Promise<LoginResponseDto> {
    const account = await this.users.findForLogin(input.email);
    const valid = await this.passwords.verify(account?.passwordHash, input.password);
    if (!valid || !account?.isActive) throw new UnauthorizedException('Credenciales incorrectas');
    const user: AuthenticatedUser = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
    };
    return this.issueSession(user);
  }

  async register(input: RegisterDto): Promise<LoginResponseDto> {
    // Reutiliza alta segura: rol FARMER fijado en servidor, hash Argon2id y unicidad.
    const user = await this.accounts.create(input);
    return this.issueSession(user);
  }

  private async issueSession(user: AuthenticatedUser): Promise<LoginResponseDto> {
    const accessToken = await this.jwt.signAsync(
      {},
      {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        algorithm: 'HS256',
        subject: user.id,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        expiresIn: TOKEN_SECONDS,
        jwtid: randomUUID(),
      },
    );
    return { accessToken, tokenType: 'Bearer', expiresIn: TOKEN_SECONDS, user };
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
    return user;
  }
}
