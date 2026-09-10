import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';
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

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

const createContractor = (overrides: Partial<{
  id: string;
  companyId: string;
  name: string;
  nip: string | null;
  pesel: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  countryCode: string;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}> = {}) => ({
  id: 'contractor-1',
  companyId: 'company-1',
  name: 'Acme Sp. z o.o.',
  nip: '1234563218',
  pesel: null,
  addressLine1: 'Main St 1',
  addressLine2: null,
  countryCode: 'PL',
  email: null,
  phone: null,
  bankAccount: null,
  notes: null,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

// ── GET /companies/:companyId/contractors ───────────────────────────────────

describe('GET /companies/:companyId/contractors', () => {
  it('defaults to active-only contractors and attaches each contractor\'s year-to-date turnover', async () => {
    const contractorFindMany = vi.fn(async () => [createContractor()]);
    const invoiceGroupBy = vi.fn(async () => [
      { contractorId: 'contractor-1', _sum: { totalGross: new Prisma.Decimal('128400.00') } }
    ]);
    const prisma = {
      contractor: { findMany: contractorFindMany },
      invoice: { groupBy: invoiceGroupBy },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
    });

    expect(response.statusCode).toBe(200);
    expect(contractorFindMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', isActive: true },
      orderBy: { name: 'asc' },
    });
    expect(response.json()).toEqual([
      {
        id: 'contractor-1',
        companyId: 'company-1',
        name: 'Acme Sp. z o.o.',
        nip: '1234563218',
        pesel: null,
        addressLine1: 'Main St 1',
        addressLine2: null,
        countryCode: 'PL',
        email: null,
        phone: null,
        bankAccount: null,
        notes: null,
        isActive: true,
        turnover: '128400.00',
        turnoverYear: new Date().getUTCFullYear(),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    await app.close();
  });

  it('passes isActive: false when status=inactive is requested', async () => {
    const contractorFindMany = vi.fn(async () => []);
    const invoiceGroupBy = vi.fn(async () => []);
    const prisma = {
      contractor: { findMany: contractorFindMany },
      invoice: { groupBy: invoiceGroupBy },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors?status=inactive',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
    });

    expect(contractorFindMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', isActive: false },
      orderBy: { name: 'asc' },
    });

    await app.close();
  });

  it('rejects a cookie-only environment for financial turnover reads', async () => {
    const contractorFindMany = vi.fn(async () => []);
    const invoiceGroupBy = vi.fn(async () => []);
    const prisma = {
      contractor: { findMany: contractorFindMany },
      invoice: { groupBy: invoiceGroupBy },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors',
      cookies: { auth_token: authToken, active_ksef_environment: 'PRODUCTION' },
    });

    expect(response.statusCode).toBe(400);
    expect(contractorFindMany).not.toHaveBeenCalled();
    expect(invoiceGroupBy).not.toHaveBeenCalled();

    await app.close();
  });
});

// ── GET /companies/:companyId/contractors/:id/summary ───────────────────────

describe('GET /companies/:companyId/contractors/:id/summary', () => {
  it('returns year-scoped turnover/paid alongside an all-time outstanding balance and recent documents', async () => {
    const contractorFindUnique = vi.fn(async () => createContractor());
    const invoiceAggregate = vi.fn(async ({ where }: { where: { issueDate?: unknown } }) => ({
      _sum: where.issueDate
        ? { totalGross: new Prisma.Decimal('5000.00'), paymentReceived: new Prisma.Decimal('3000.00') }
        : { totalGross: new Prisma.Decimal('20000.00'), paymentReceived: new Prisma.Decimal('12000.00') },
    }));
    const invoiceFindMany = vi.fn(async () => [
      {
        id: 'invoice-1',
        invoiceNumber: 'FV 3/8/2026',
        invoiceType: 'VAT' as const,
        issueDate: new Date('2026-08-01T00:00:00.000Z'),
        totalGross: new Prisma.Decimal('2000.00'),
      },
    ]);
    const prisma = {
      contractor: { findUnique: contractorFindUnique },
      invoice: { aggregate: invoiceAggregate, findMany: invoiceFindMany },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors/contractor-1/summary?year=2026',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      contractorId: 'contractor-1',
      year: 2026,
      turnover: '5000.00',
      paidThisYear: '3000.00',
      outstanding: '8000.00',
      recentDocuments: [
        { id: 'invoice-1', invoiceNumber: 'FV 3/8/2026', invoiceType: 'VAT', issueDate: '2026-08-01', totalGross: '2000.00' },
      ],
    });

    await app.close();
  });

  it('returns 404 when the contractor belongs to a different company', async () => {
    const contractorFindUnique = vi.fn(async () => createContractor({ companyId: 'other-company' }));
    const prisma = {
      contractor: { findUnique: contractorFindUnique },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors/contractor-1/summary',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
    });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it('uses the explicit header environment even when the legacy cookie disagrees', async () => {
    const contractorFindUnique = vi.fn(async () => createContractor());
    const invoiceAggregate = vi.fn(async () => ({
      _sum: { totalGross: new Prisma.Decimal('100.00'), paymentReceived: new Prisma.Decimal('20.00') },
    }));
    const invoiceFindMany = vi.fn(async () => []);
    const prisma = {
      contractor: { findUnique: contractorFindUnique },
      invoice: { aggregate: invoiceAggregate, findMany: invoiceFindMany },
    } as unknown as PrismaClient;

    const app = await buildApp({ logger: false, prismaClient: prisma, authConfig });
    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'GET',
      url: '/companies/company-1/contractors/contractor-1/summary?year=2026',
      headers: { 'x-ksef-environment': 'PRODUCTION' },
      cookies: { auth_token: authToken, active_ksef_environment: 'TEST' },
    });

    expect(response.statusCode).toBe(200);
    expect(invoiceAggregate).toHaveBeenCalledTimes(2);
    expect(invoiceAggregate.mock.calls.every(([input]) => input.where.environment === 'PRODUCTION')).toBe(true);
    expect(invoiceFindMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', contractorId: 'contractor-1', environment: 'PRODUCTION' },
      orderBy: { issueDate: 'desc' },
      take: 3,
      select: { id: true, invoiceNumber: true, invoiceType: true, issueDate: true, totalGross: true },
    });

    await app.close();
  });
});
