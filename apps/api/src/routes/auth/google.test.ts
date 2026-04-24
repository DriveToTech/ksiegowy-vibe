import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { BuildAppOptions } from '../../app.js';
import type { AccessTokenPayload, AuthConfig, RefreshTokenPayload } from '../../lib/auth-config.js';

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
  },
  desktop: {}
};

const desktopAuthConfig: AuthConfig = {
  ...baseAuthConfig,
  google: {
    enabled: true,
    missingEnv: [],
    providedEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    clientId: 'test-google-client-id',
    clientSecret: 'test-google-client-secret',
    redirectUri: 'http://localhost:3001/auth/google/callback'
  },
  desktop: {
    authCallbackUrl: 'ksiegowy-vibe://auth/desktop/callback'
  }
};

const createPrismaClient = (): NonNullable<BuildAppOptions['prismaClient']> => {
  return {
    $disconnect: vi.fn(async () => undefined),
    $queryRaw: vi.fn(async () => [{ ready: 1 }]),
    user: {
      findUnique: vi.fn(
        async ({
          where
        }: {
          where: { id?: string; googleId?: string; email?: string };
        }) => {
          if (where.id === 'user_123') {
            return {
              id: 'user_123',
              email: 'maciej@example.com',
              name: 'Maciej',
              avatarUrl: 'https://example.com/avatar.png',
              memberships: [{ companyId: 'company_1', role: 'ADMIN' }]
            };
          }

          return null;
        }
      ),
      create: vi.fn(
        async ({
          data
        }: {
          data: {
            email: string;
            googleId: string;
            name?: string;
            avatarUrl?: string;
            lastLoginAt: Date;
          };
        }) => ({
          id: 'user_123',
          email: data.email,
          name: data.name ?? null,
          avatarUrl: data.avatarUrl ?? null
        })
      ),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: {
            email: string;
            googleId: string;
            name?: string;
            avatarUrl?: string;
            lastLoginAt: Date;
          };
        }) => ({
          id: where.id,
          email: data.email,
          name: data.name ?? null,
          avatarUrl: data.avatarUrl ?? null
        })
      )
    },
    companyMembership: {
      findMany: vi.fn(async () => [{ companyId: 'company_1', role: 'ADMIN' }])
    }
  } as unknown as NonNullable<BuildAppOptions['prismaClient']>;
};

type App = Awaited<ReturnType<typeof buildApp>>;

const signAccessToken = (app: App, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

const signRefreshToken = (app: App, payload: RefreshTokenPayload): string => {
  return (app.jwt as unknown as { refresh: { sign: (value: RefreshTokenPayload) => string } }).refresh.sign(payload);
};

const setGoogleOAuthMock = (app: App) => {
  const googleOAuth = {
    generateAuthorizationUri: vi.fn(async () => 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id'),
    getAccessTokenFromAuthorizationCodeFlow: vi.fn(async () => ({ token: 'google-access-token' })),
    userinfo: vi.fn(async () => ({
      sub: 'google_user_123',
      email: 'maciej@example.com',
      email_verified: true,
      name: 'Maciej',
      picture: 'https://example.com/avatar.png'
    }))
  } as unknown as NonNullable<App['oauth2GoogleOAuth2']>;

  (app as unknown as { oauth2GoogleOAuth2: NonNullable<App['oauth2GoogleOAuth2']> }).oauth2GoogleOAuth2 = googleOAuth;

  return googleOAuth;
};

describe('auth routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a safe shell response when Google OAuth is not configured', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: createPrismaClient(),
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

  it('starts desktop auth through the API and exchanges a one-time handoff', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: createPrismaClient(),
      authConfig: desktopAuthConfig
    });

    const googleOAuth = setGoogleOAuthMock(app);

    const desktopCodeVerifier = 'desktop-code-verifier-1234567890-desktop-code-verifier';
    const desktopCodeChallenge = createHash('sha256').update(desktopCodeVerifier).digest('base64url');

    const startResponse = await app.inject({
      method: 'GET',
      url: `/auth/google?desktopTransactionId=desktop_transaction_123&desktopCodeChallenge=${desktopCodeChallenge}`
    });

    expect(startResponse.statusCode).toBe(302);
    expect(startResponse.headers.location).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id'
    );
    expect(googleOAuth.generateAuthorizationUri).toHaveBeenCalledTimes(1);
    expect(startResponse.cookies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'desktop_auth_request',
          httpOnly: true,
          sameSite: 'Lax',
          path: '/auth/google'
        })
      ])
    );

    const desktopAuthRequestCookie = startResponse.cookies.find((cookie) => cookie.name === 'desktop_auth_request');

    if (!desktopAuthRequestCookie) {
      throw new Error('desktop_auth_request cookie was not set');
    }

    const callbackResponse = await app.inject({
      method: 'GET',
      url: '/auth/google/callback?code=test-google-code&state=test-google-state',
      cookies: {
        desktop_auth_request: desktopAuthRequestCookie.value
      }
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.cookies).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'auth_token' }),
        expect.objectContaining({ name: 'refresh_token' })
      ])
    );

    const desktopRedirectUrl = new URL(callbackResponse.headers.location);
    const handoffCode = desktopRedirectUrl.searchParams.get('handoffCode');

    expect(desktopRedirectUrl.protocol).toBe('ksiegowy-vibe:');
    expect(desktopRedirectUrl.host).toBe('auth');
    expect(desktopRedirectUrl.pathname).toBe('/desktop/callback');
    expect(desktopRedirectUrl.searchParams.get('transactionId')).toBe('desktop_transaction_123');
    expect(handoffCode).toBeTruthy();

    if (!handoffCode) {
      throw new Error('handoffCode was not returned');
    }

    const exchangeResponse = await app.inject({
      method: 'POST',
      url: '/auth/desktop/exchange',
      payload: {
        handoffCode,
        desktopTransactionId: 'desktop_transaction_123',
        desktopCodeVerifier
      }
    });

    expect(exchangeResponse.statusCode).toBe(200);
    expect(exchangeResponse.json()).toEqual({
      status: 'authenticated',
      user: {
        id: 'user_123',
        email: 'maciej@example.com',
        name: 'Maciej',
        avatarUrl: 'https://example.com/avatar.png'
      },
      companies: [{ id: 'company_1', role: 'ADMIN' }],
      redirectTo: null
    });
    expect(exchangeResponse.cookies).toEqual(
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

    const repeatedExchangeResponse = await app.inject({
      method: 'POST',
      url: '/auth/desktop/exchange',
      payload: {
        handoffCode,
        desktopTransactionId: 'desktop_transaction_123',
        desktopCodeVerifier
      }
    });

    expect(repeatedExchangeResponse.statusCode).toBe(401);
    expect(repeatedExchangeResponse.json()).toEqual({
      error: 'Unauthorized',
      message: 'Desktop handoff code is invalid or expired',
      statusCode: 401
    });

    await app.close();
  });

  it('returns desktop oauth error to the custom protocol callback', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: createPrismaClient(),
      authConfig: desktopAuthConfig
    });

    const startResponse = await app.inject({
      method: 'GET',
      url: '/auth/google?desktopTransactionId=desktop_transaction_123&desktopCodeChallenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOQRSTUVWX0123456789_-'
    });

    const desktopAuthRequestCookie = startResponse.cookies.find((cookie) => cookie.name === 'desktop_auth_request');

    if (!desktopAuthRequestCookie) {
      throw new Error('desktop_auth_request cookie was not set');
    }

    const callbackResponse = await app.inject({
      method: 'GET',
      url: '/auth/google/callback?error=access_denied&error_description=User%20closed%20login',
      cookies: {
        desktop_auth_request: desktopAuthRequestCookie.value
      }
    });

    expect(callbackResponse.statusCode).toBe(302);

    const desktopRedirectUrl = new URL(callbackResponse.headers.location);

    expect(desktopRedirectUrl.protocol).toBe('ksiegowy-vibe:');
    expect(desktopRedirectUrl.host).toBe('auth');
    expect(desktopRedirectUrl.pathname).toBe('/desktop/callback');
    expect(desktopRedirectUrl.searchParams.get('transactionId')).toBe('desktop_transaction_123');
    expect(desktopRedirectUrl.searchParams.get('error')).toBe('access_denied');
    expect(desktopRedirectUrl.searchParams.get('errorDescription')).toBe('User closed login');

    await app.close();
  });

  it('protects auth me route with the authenticate decorator', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: createPrismaClient(),
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
        avatarUrl: 'https://example.com/avatar.png'
      },
      companies: [{ id: 'company_1', role: 'ADMIN' }]
    });

    await app.close();
  });

  it('refreshes and clears auth cookies', async () => {
    const app = await buildApp({
      logger: false,
      prismaClient: createPrismaClient(),
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
