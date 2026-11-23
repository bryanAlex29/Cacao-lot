import { ConfigService } from '@nestjs/config';
import { BrowserSessionService } from './browser-session.service';
import type { PrismaService } from '../database/prisma.service';

describe('Cookie de sesión sin secretos en JavaScript', () => {
  it.each(['production', 'development'])('HttpOnly/Strict y Secure en %s', (environment) => {
    const service = new BrowserSessionService(
      {} as PrismaService,
      new ConfigService({ NODE_ENV: environment }),
    );
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const expires = new Date('2026-11-23T12:00:00Z');
    service.setCookie(response, 'test-only-secret', expires);
    expect(response.cookie).toHaveBeenCalledWith('cacaosmart_session', 'test-only-secret', {
      httpOnly: true,
      sameSite: 'strict',
      secure: environment === 'production',
      path: '/api/v1/auth',
      expires,
    });
    service.clearCookie(response);
    expect(response.clearCookie).toHaveBeenCalledWith('cacaosmart_session', {
      httpOnly: true,
      sameSite: 'strict',
      secure: environment === 'production',
      path: '/api/v1/auth',
    });
  });
});
