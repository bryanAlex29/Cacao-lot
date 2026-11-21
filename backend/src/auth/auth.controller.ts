import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto, RegisterDto } from './auth.dto';
import { PublicUserDto } from '../users/user.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiCreatedResponse({
    type: LoginResponseDto,
    description:
      'Registro público solo FARMER e inicio de sesión. No verifica posesión del correo.',
  })
  register(@Body() input: RegisterDto): Promise<LoginResponseDto> {
    return this.auth.register(input);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() input: LoginDto): Promise<LoginResponseDto> {
    return this.auth.login(input);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: PublicUserDto })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
