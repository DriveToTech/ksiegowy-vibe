import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { AccessTokenPayload, AuthConfig, RefreshTokenPayload } from '../../lib/auth-config.js';
import type { BuildAppOptions } from '../../app.js';

const baseAuthConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '30d'
  },
  cookies: {
    accessTokenName: 'auth_token',
    refreshTokenName: 'refresh_token',
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 2592000,
    secure: false,
    sameSite: 'lax',
    path: '/'
  },
  google: {
    enabled: false,
    missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    providedEnv: []
  }
};

const prisma = {
  $disconnect: vi.fn(async () => undefined),
  $queryRaw: vi.fn(async () => [{ ready: 1 }]),
  user: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id !== 'user_123') {
        return null;
      }

      return {
        id: 'user_123',
        email: 'maciej@example.com',
        name: 'Maciej',
        avatarUrl: null,
        memberships: [{ companyId: 'company_1', role: 'ADMIN' }]
      };
    })
  }
} as unknown as NonNullable<BuildAppOptions['prismaClient']>;

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

const signRefreshToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: RefreshTokenPayload): string => {
  return (app.jwt as unknown as { refresh: { sign: (value: RefreshTokenPayload) => string } }).refresh.sign(payload);
};

describe('auth routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a safe shell response when Google OAuth is not configured', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig: baseAuthConfig
    });

    const response = await app.inject({
      method: 'GET',
      url: '/auth/google'
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'google_oauth_not_configured',
      message: 'Google OAuth is not configured for this environment.',
      missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']
    });

    await app.close();
  });

  it('protects auth me route with the authenticate decorator', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig: baseAuthConfig
    });

    const unauthorizedResponse = await app.inject({
      method: 'GET',
      url: '/auth/me'
    });

    expect(unauthorizedResponse.statusCode).toBe(401);

    const authToken = signAccessToken(app, {
      sub: 'user_123',
      email: 'maciej@example.com',
      name: 'Maciej',
      companies: [{ id: 'company_1', role: 'ADMIN' }]
    });

    const authorizedResponse = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: {
        auth_token: authToken
      }
    });

    expect(authorizedResponse.statusCode).toBe(200);
    expect(authorizedResponse.json()).toEqual({
      authenticated: true,
      user: {
        id: 'user_123',
        email: 'maciej@example.com',
        name: 'Maciej',
        avatarUrl: null
      },
      companies: [{ id: 'company_1', role: 'ADMIN' }]
    });

    await app.close();
  });

  it('refreshes and clears auth cookies', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig: baseAuthConfig
    });

    const refreshToken = signRefreshToken(app, {
      sub: 'user_123',
      email: 'maciej@example.com',
      name: 'Maciej',
      companies: [{ id: 'company_1', role: 'ADMIN' }],
      tokenType: 'refresh'
    });

    const refreshResponse = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: {
        refresh_token: refreshToken
      }
    });

    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json()).toEqual({ status: 'refreshed' });
    expect(refreshResponse.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'auth_token',
          httpOnly: true,
          sameSite: 'Lax'
        }),
        expect.objectContaining({
          name: 'refresh_token',
          httpOnly: true,
          sameSite: 'Lax'
        })
      ])
    );

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout'
    });

    expect(logoutResponse.statusCode).toBe(200);
    expect(logoutResponse.json()).toEqual({ status: 'logged_out' });
    expect(logoutResponse.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'auth_token', value: '' }),
        expect.objectContaining({ name: 'refresh_token', value: '' })
      ])
    );

    await app.close();
  });
});
