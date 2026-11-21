import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';
import type { AuthenticatedDevice } from '../devices/device-auth.service';

export const PUBLIC_ROUTE = 'auth:public';
export const DEVICE_ROUTE = 'auth:device';
export const DeviceEndpoint = () => SetMetadata(DEVICE_ROUTE, true);
export const REQUIRED_ROLES = 'auth:roles';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const Roles = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES, roles);
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException('Autenticación requerida');
    return user;
  },
);

export const CurrentDevice = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedDevice => {
    const device = context.switchToHttp().getRequest<AuthenticatedRequest>().device;
    if (!device) throw new UnauthorizedException('Autenticación de dispositivo requerida');
    return device;
  },
);
