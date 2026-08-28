import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BuildAppOptions } from '../../app.js';
import { buildApp } from '../../app.js';
import type { AccessTokenPayload, AuthConfig } from '../../lib/auth-config.js';
import type * as CompanyBackupPolicyModule from '../../services/backup/company-backup-policy.js';
import { GoogleDriveReauthorizationRequiredError } from '../../services/backup/gdrive.js';

const { runCompanyGoogleDriveBackup } = vi.hoisted(() => ({
  runCompanyGoogleDriveBackup: vi.fn(),
}));

vi.mock('../../services/backup/company-backup-policy.js', async () => {
  const actualModule = await vi.importActual<typeof CompanyBackupPolicyModule>('../../services/backup/company-backup-policy.js');

  return {
    ...actualModule,
    runCompanyGoogleDriveBackup,
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
    secure: false,
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
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id !== 'user_123') {
        return null;
      }

      return {
        id: 'user_123',
        email: 'maciej@example.com',
        name: 'Maciej',
        avatarUrl: null,
        memberships: [{ companyId: 'company_1', role: 'ADMIN' }],
      };
    }),
  },
} as unknown as NonNullable<BuildAppOptions['prismaClient']>;

const householdDatabase = {
  $disconnect: vi.fn(async () => undefined),
} as unknown as NonNullable<BuildAppOptions['householdDatabaseClient']>;

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

describe('company backup policy routes', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a structured reauthorization error when Google Drive must be reconnected', async () => {
    runCompanyGoogleDriveBackup.mockRejectedValue(
      new GoogleDriveReauthorizationRequiredError('Google Drive authorization expired. Reconnect Google Drive to continue backups.')
    );

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      householdDatabaseClient: householdDatabase,
      authConfig: baseAuthConfig,
    });

    const authToken = signAccessToken(app, {
      sub: 'user_123',
      email: 'maciej@example.com',
      name: 'Maciej',
      companies: [{ id: 'company_1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'POST',
      url: '/companies/company_1/backup-policy/run',
      cookies: {
        auth_token: authToken,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      statusCode: 409,
      error: 'Conflict',
      message: 'Google Drive authorization expired. Reconnect Google Drive to continue backups.',
      code: 'REAUTHORIZATION_REQUIRED',
    });

    await app.close();
  });
});
