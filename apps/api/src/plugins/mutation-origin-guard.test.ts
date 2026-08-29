import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import type { BuildAppOptions } from '../app.js';
import type { AuthConfig } from '../lib/auth-config.js';

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: { accessSecret: 'test-access-secret', refreshSecret: 'test-refresh-secret', accessTtl: '15m', refreshTtl: '30d' },
  cookies: { accessTokenName: 'auth_token', refreshTokenName: 'refresh_token', accessMaxAgeSeconds: 900, refreshMaxAgeSeconds: 2592000, secure: false, sameSite: 'lax', path: '/' },
  google: { enabled: false, missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'], providedEnv: [] }
};

const prisma = { $disconnect: async () => undefined } as unknown as NonNullable<BuildAppOptions['prismaClient']>;
const householdDatabase = { $disconnect: async () => undefined } as unknown as NonNullable<BuildAppOptions['householdDatabaseClient']>;

describe('mutation origin guard', () => {
  it.each([
    ['POST', '/auth/logout'],
    ['POST', '/auth/refresh'],
    ['POST', '/households/household-1/accounts'],
    ['PATCH', '/households/household-1/accounts/account-1'],
    ['PUT', '/companies/company-1/ksef-settings'],
    ['DELETE', '/households/household-1/transactions/transaction-1']
  ] as const)('rejects cookie-authenticated %s %s before its handler', async (method, url) => {
    const app = await buildApp({ logger: false, prismaClient: prisma, householdDatabaseClient: householdDatabase, authConfig });

    const response = await app.inject({
      method,
      url,
      cookies: { auth_token: 'cookie-authenticated' },
      headers: { origin: 'https://attacker.example' }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ statusCode: 403, error: 'Forbidden', message: 'Origin not allowed' });
    await app.close();
  });

  it('rejects a missing Origin for cookie-authenticated mutations', async () => {
    const app = await buildApp({ logger: false, prismaClient: prisma, householdDatabaseClient: householdDatabase, authConfig });

    const response = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { auth_token: 'cookie-authenticated' } });

    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it('allows one exact configured Origin', async () => {
    const app = await buildApp({ logger: false, prismaClient: prisma, householdDatabaseClient: householdDatabase, authConfig });

    const response = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { auth_token: 'cookie-authenticated' }, headers: { origin: 'http://localhost:3000' } });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('rejects null, malformed, unsupported, comma-separated, and duplicate Origins', async () => {
    const app = await buildApp({ logger: false, prismaClient: prisma, householdDatabaseClient: householdDatabase, authConfig });

    for (const origin of ['null', 'not-an-origin', 'ftp://localhost:3000', 'http://localhost:3000, http://localhost:3000']) {
      const response = await app.inject({ method: 'POST', url: '/auth/logout', cookies: { auth_token: 'cookie-authenticated' }, headers: { origin } });
      expect(response.statusCode).toBe(403);
    }

    const duplicateResponse = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { auth_token: 'cookie-authenticated' },
      headers: { origin: ['http://localhost:3000', 'http://localhost:3000'] }
    });
    expect(duplicateResponse.statusCode).toBe(403);
    await app.close();
  });
});
