import { Body, Controller, Get, Header, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto, RegisterDto } from './auth.dto';
import { PublicUserDto } from '../users/user.dto';
import { BrowserSessionService } from './browser-session.service';
import type { SessionRequest, SessionResponse } from './browser-session.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: BrowserSessionService,
  ) {}

  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiCreatedResponse({
    type: LoginResponseDto,
    description:
      'Registro público solo FARMER e inicio de sesión. No verifica posesión del correo.',
  })
  async register(
    @Body() input: RegisterDto,
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: SessionResponse,
  ): Promise<LoginResponseDto> {
    this.sessions.requireOrigin(req);
    const result = await this.auth.register(input);
    await this.sessions.revoke(req);
    this.sessions.setCookie(res, result.cookie, result.expiresAt);
    return result.body;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body() input: LoginDto,
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: SessionResponse,
  ): Promise<LoginResponseDto> {
    this.sessions.requireOrigin(req);
    const result = await this.auth.login(input);
    await this.sessions.revoke(req);
    this.sessions.setCookie(res, result.cookie, result.expiresAt);
    return result.body;
  }

  @Public()
  @Post('refresh')
  @ApiCookieAuth('browser-session')
  @ApiHeader({ name: 'X-CacaoSmart-Session', required: true, enum: ['1'] })
  @ApiOperation({
    summary:
      'Renueva JWT mediante cookie HttpOnly; requiere Origin frontend configurado, sin ampliar las 8 horas absolutas',
  })
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOkResponse({ type: LoginResponseDto })
  async refresh(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: SessionResponse,
  ): Promise<LoginResponseDto> {
    const result = await this.auth.refresh(req);
    if (result.cookie) this.sessions.setCookie(res, result.cookie, result.expiresAt);
    return result.body;
  }

  @Public()
  @Post('logout')
  @ApiCookieAuth('browser-session')
  @ApiHeader({ name: 'X-CacaoSmart-Session', required: true, enum: ['1'] })
  @ApiOperation({
    summary: 'Revoca sesión y sus JWT; requiere Origin frontend configurado y cookie',
  })
  @HttpCode(204)
  async logout(
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: SessionResponse,
  ): Promise<void> {
    this.sessions.requireOrigin(req, true);
    await this.sessions.revoke(req);
    this.sessions.clearCookie(res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: PublicUserDto })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
