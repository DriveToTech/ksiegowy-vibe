import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AuthConfig } from '../lib/auth-config.js';
import type { BuildAppOptions } from '../app.js';

const householdDatabase = {
  $disconnect: vi.fn(async () => undefined)
} as unknown as NonNullable<BuildAppOptions['householdDatabaseClient']>;

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '30d'
  },
  cookies: {
    accessTokenName: 'auth_token' as const,
    refreshTokenName: 'refresh_token' as const,
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 2592000,
    secure: false,
    sameSite: 'lax' as const,
    path: '/' as const
  },
  google: {
    enabled: false,
    missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    providedEnv: []
  }
};

describe('ready route', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns ok when the database query succeeds', async () => {
    const queryRaw = vi.fn(async () => [{ ready: 1 }]);
    const disconnect = vi.fn(async () => undefined);
    const prisma = {
      $queryRaw: queryRaw,
      $disconnect: disconnect
    } as unknown as PrismaClient;

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      householdDatabaseClient: householdDatabase,
      authConfig
    });

    const response = await app.inject({
      method: 'GET',
      url: '/ready'
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ok',
      database: 'ok'
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);

    await app.close();

    expect(disconnect).not.toHaveBeenCalled();
  });
});
