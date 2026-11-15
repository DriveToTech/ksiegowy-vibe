import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AccessTokenPayload, AuthConfig } from '../lib/auth-config.js';

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: { accessSecret: 'test-access-secret', refreshSecret: 'test-refresh-secret', accessTtl: '15m', refreshTtl: '30d' },
  cookies: { accessTokenName: 'auth_token', refreshTokenName: 'refresh_token', accessMaxAgeSeconds: 900, refreshMaxAgeSeconds: 2592000, secure: false, sameSite: 'lax', path: '/' },
  google: { enabled: false, missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'], providedEnv: [] },
};

describe('GET /companies/lookup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns checkedAt and requestId, then 429 with Retry-After after 10 lookups per minute', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      result: { requestId: 'req-9', subject: { name: 'Acme', nip: '5252248481', workingAddress: 'Main 1', statusVat: 'Zwolniony' } },
    }), { status: 200 })));
    const app = await buildApp({ logger: false, prismaClient: {} as unknown as PrismaClient, authConfig });
    const authToken = (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign({
      sub: 'lookup-user', email: 'test@example.com', name: 'Test User', companies: [],
    });
    const lookup = () => app.inject({ method: 'GET', url: '/companies/lookup?nip=5252248481', cookies: { auth_token: authToken } });

    const first = await lookup();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({
      name: 'Acme', nip: '5252248481', addressLine1: 'Main 1', addressLine2: null, vatStatus: 'EXEMPT',
      checkedAt: expect.any(String), requestId: 'req-9',
    });

    for (let attempt = 1; attempt < 10; attempt += 1) await lookup();
    const limited = await lookup();

    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ code: 'RATE_LIMITED' });
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    await app.close();
  });

  it('returns 400 for a bad-checksum NIP without calling the registry or spending the window', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const app = await buildApp({ logger: false, prismaClient: {} as unknown as PrismaClient, authConfig });
    const authToken = (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign({
      sub: 'checksum-user', email: 'test@example.com', name: 'Test User', companies: [],
    });

    const response = await app.inject({ method: 'GET', url: '/companies/lookup?nip=1234567890', cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('maps an upstream timeout to 502 with a fixed message and no upstream text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('The operation was aborted due to timeout host wl-api.mf.gov.pl', 'TimeoutError'); }));
    const app = await buildApp({ logger: false, prismaClient: {} as unknown as PrismaClient, authConfig });
    const authToken = (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign({
      sub: 'timeout-user', email: 'test@example.com', name: 'Test User', companies: [],
    });

    const response = await app.inject({ method: 'GET', url: '/companies/lookup?nip=5260250995', cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ message: 'Company registry unavailable' });
    expect(response.body).not.toContain('wl-api');
    await app.close();
  });
});
