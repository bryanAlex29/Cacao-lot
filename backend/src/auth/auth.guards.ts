import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@prisma/client';
import { DEVICE_ROUTE, PUBLIC_ROUTE, REQUIRED_ROLES } from './auth.decorators';
import { DeviceAuthService } from '../devices/device-auth.service';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest } from './auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly devices: DeviceAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      this.reflector.getAllAndOverride<boolean>(DEVICE_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      request.device = await this.devices.authenticate(request.headers);
      return true;
    }
    if (
      this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const authorization = request.headers['authorization'];
    if (
      typeof authorization !== 'string' ||
      authorization.length > 4096 ||
      !/^Bearer [^\s]+$/i.test(authorization)
    ) {
      throw new UnauthorizedException('Autenticación requerida');
    }
    request.user = await this.auth.authenticate(authorization.slice(7));
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true;
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Permisos insuficientes');
    return true;
  }
}
