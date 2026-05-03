import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app.js';
import type { AccessTokenPayload, AuthConfig } from '../lib/auth-config.js';

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '30d',
  },
  cookies: {
    accessTokenName: 'auth_token' as const,
    refreshTokenName: 'refresh_token' as const,
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 2592000,
    secure: false,
    sameSite: 'lax' as const,
    path: '/' as const,
  },
  google: {
    enabled: false,
    missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    providedEnv: [],
  },
};

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

describe('GET /companies/:companyId/ksef/queue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('queries InvoiceKsefState with environment filter and returns status from InvoiceKsefState', async () => {
    const invoiceKsefStateFindMany = vi.fn(async () => [
      {
        status: 'OFFLINE_QUEUED',
        invoice: {
          id: 'invoice-1',
          invoiceNumber: 'FV/2026/01',
          issueDate: new Date('2026-04-15'),
          totalGross: { toString: () => '1230.00' },
          currency: 'PLN',
          updatedAt: new Date('2026-04-15T12:00:00.000Z'),
        },
      },
    ]);
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'PRODUCTION' }));

    const prisma = {
      company: { findUnique: companyFindUnique },
      invoiceKsefState: { findMany: invoiceKsefStateFindMany },
    } as unknown as PrismaClient;

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig,
    });

    const token = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/ksef/queue',
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(200);
    expect(invoiceKsefStateFindMany).toHaveBeenCalledWith({
      where: {
        environment: 'PRODUCTION',
        status: 'OFFLINE_QUEUED',
        invoice: { companyId: 'company-1', environment: 'PRODUCTION' },
      },
      orderBy: { updatedAt: 'asc' },
      select: {
        status: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            totalGross: true,
            currency: true,
            updatedAt: true,
          },
        },
      },
    });

    const body = response.json();
    expect(body[0]).toEqual({
      id: 'invoice-1',
      invoiceNumber: 'FV/2026/01',
      issueDate: '2026-04-15',
      totalGross: '1230.00',
      currency: 'PLN',
      ksefStatus: 'OFFLINE_QUEUED',
      updatedAt: '2026-04-15T12:00:00.000Z',
    });

    await app.close();
  });

  it('uses TEST environment when no header and company default is TEST', async () => {
    const invoiceKsefStateFindMany = vi.fn(async () => []);
    const companyFindUnique = vi.fn(async () => ({ ksefEnv: 'TEST' }));

    const prisma = {
      company: { findUnique: companyFindUnique },
      invoiceKsefState: { findMany: invoiceKsefStateFindMany },
    } as unknown as PrismaClient;

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig,
    });

    const token = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/ksef/queue',
      cookies: { auth_token: token },
    });

    expect(response.statusCode).toBe(200);
    expect(invoiceKsefStateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ environment: 'TEST' }),
      }),
    );

    await app.close();
  });
});
