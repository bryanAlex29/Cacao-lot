import type { UserRole } from '@prisma/client';
import type { AuthenticatedDevice } from '../devices/device-auth.service';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  device?: AuthenticatedDevice;
}
