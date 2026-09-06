import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuildAppOptions } from '../../app.js';
import { buildApp } from '../../app.js';
import type { AccessTokenPayload, AuthConfig } from '../../lib/auth-config.js';
import type * as GoogleDriveModule from '../../services/backup/gdrive.js';

const { getAuthUrl } = vi.hoisted(() => ({
  getAuthUrl: vi.fn(),
}));

vi.mock('../../services/backup/gdrive.js', async () => {
  const actualModule = await vi.importActual<typeof GoogleDriveModule>('../../services/backup/gdrive.js');

  return {
    ...actualModule,
    getAuthUrl,
  };
});

const baseAuthConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '30d',
  },
  cookies: {
    accessTokenName: 'auth_token',
    refreshTokenName: 'refresh_token',
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 2592000,
    secure: true,
    sameSite: 'lax',
    path: '/',
  },
  google: {
    enabled: false,
    missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    providedEnv: [],
  },
};

const prisma = {
  $disconnect: vi.fn(async () => undefined),
  $queryRaw: vi.fn(async () => [{ ready: 1 }]),
  user: {
    findUnique: vi.fn(async () => ({
      id: 'test-user-id',
      email: 'test-user@example.invalid',
      name: 'Test User',
      avatarUrl: null,
      memberships: [{ companyId: 'test-company-id', role: 'ADMIN' }],
    })),
  },
} as unknown as NonNullable<BuildAppOptions['prismaClient']>;

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

describe('Google Drive backup routes', () => {
  const originalRedirectUri = process.env['GDRIVE_REDIRECT_URI'];

  afterEach(() => {
    if (originalRedirectUri === undefined) {
      delete process.env['GDRIVE_REDIRECT_URI'];
    } else {
      process.env['GDRIVE_REDIRECT_URI'] = originalRedirectUri;
    }
    vi.clearAllMocks();
  });

  describe('GET /backup/gdrive/connect', () => {
    it('scopes the OAuth state cookie to the externally configured callback path', async () => {
      process.env['GDRIVE_REDIRECT_URI'] = 'https://api.example.invalid/backend/backup/gdrive/callback';
      getAuthUrl.mockReturnValue('https://oauth.example.invalid/authorize');

      const app = await buildApp({
        logger: false,
        prismaClient: prisma,
        authConfig: baseAuthConfig,
      });

      const authToken = signAccessToken(app, {
        sub: 'test-user-id',
        email: 'test-user@example.invalid',
        name: 'Test User',
        companies: [{ id: 'test-company-id', role: 'ADMIN' }],
      });

      const response = await app.inject({
        method: 'GET',
        url: '/backup/gdrive/connect?companyId=test-company-id',
        cookies: { auth_token: authToken },
      });

      expect(response.statusCode).toBe(302);
      expect(response.cookies).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'backup_gdrive_oauth_state',
          path: '/backend/backup/gdrive/callback',
          httpOnly: true,
          sameSite: 'Lax',
          secure: true,
        }),
      ]));

      await app.close();
    });
  });
});
