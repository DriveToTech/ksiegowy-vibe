import { Prisma, type PrismaClient } from '@prisma/client';
import { InvestmentServiceError } from '@ksiegowy/household-service';
import type * as HouseholdService from '@ksiegowy/household-service';
import { HouseholdReportPdfError } from '@ksiegowy/pdf-templates';
import type * as PdfTemplates from '@ksiegowy/pdf-templates';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type BuildAppOptions } from '../../app.js';
import type { AccessTokenPayload, AuthConfig } from '../../lib/auth-config.js';

const mockedOperations = vi.hoisted(() => ({
  getInvestmentPortfolio: vi.fn(),
  createInvestmentPosition: vi.fn(),
  getInvestmentValueHistory: vi.fn(),
  getInvestmentContributions: vi.fn(),
  updateInvestmentPosition: vi.fn(),
  listInvestmentTransactions: vi.fn(),
  recordInvestmentTransaction: vi.fn(),
  voidInvestmentTransaction: vi.fn(),
  getHouseholdReportSummary: vi.fn(),
  getHouseholdTaxReturnReport: vi.fn()
}));
const mockedPdf = vi.hoisted(() => ({ generateHouseholdReportPdf: vi.fn() }));

vi.mock('@ksiegowy/household-service', async () => ({
  ...(await vi.importActual<typeof HouseholdService>('@ksiegowy/household-service')),
  ...mockedOperations
}));
vi.mock('@ksiegowy/pdf-templates', async () => ({
  ...(await vi.importActual<typeof PdfTemplates>('@ksiegowy/pdf-templates')),
  ...mockedPdf
}));

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: { accessSecret: 'test-access-secret', refreshSecret: 'test-refresh-secret', accessTtl: '15m', refreshTtl: '30d' },
  cookies: { accessTokenName: 'auth_token', refreshTokenName: 'refresh_token', accessMaxAgeSeconds: 900, refreshMaxAgeSeconds: 2592000, secure: false, sameSite: 'lax', path: '/' },
  google: { enabled: false, missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'], providedEnv: [] }
};

const position = {
  id: 'position-1', householdId: 'household-1', ownerUserId: 'user-1', wrapper: 'IKZE', visibility: 'SHARED', instrument: 'ETF World', units: new Prisma.Decimal('2'), costBasis: new Prisma.Decimal('100.00'), currentValue: new Prisma.Decimal('250.00'), targetAllocationPercent: new Prisma.Decimal('100.00'), lastValuedAt: new Date('2026-08-01T00:00:00.000Z'), archivedAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z')
};
const transaction = {
  id: 'investment-transaction-1', householdId: 'household-1', positionId: 'position-1', type: 'BUY', units: new Prisma.Decimal('2'), amount: new Prisma.Decimal('100.00'), date: new Date('2026-01-01T00:00:00.000Z'), operationId: 'operation-1', voidedAt: null, voidedByUserId: null, createdAt: new Date('2026-01-01T01:00:00.000Z')
};
const portfolio = { positions: [{ position, currentAllocationPercent: '100.00', driftPercent: '0.00' }], totalCurrentValue: '250.00', valuedCurrentValue: '250.00', missingValuationCount: 0, dataQuality: 'COMPLETE', targetAllocation: { status: 'COMPLETE', totalPercent: '100.00' } };
const report = {
  from: '2026-01-01', to: '2026-12-31',
  cashFlow: { income: '100.00', spending: '20.00', surplus: '80.00', categories: [{ categoryId: 'category-1', categoryName: '\uFEFF\r\n\u2003=SUM(A1:A2)', income: '100.00', spending: '20.00' }] },
  categoryComparison: { basis: 'EQUIVALENT_PRIOR_YEAR', from: '2025-01-01', to: '2025-12-31', categories: [] },
  netWorth: { total: '350.00', accounts: [{ accountId: 'account-1', name: 'Cash', value: '100.00', openingBalanceBoundary: '2025-01-01', completeness: 'COMPLETE' }], investments: [{ positionId: 'position-1', instrument: '@launch', wrapper: 'IKZE', value: '250.00', valuationDate: '2026-08-01', completeness: 'COMPLETE' }], components: { accounts: '100.00', investments: '250.00' } },
  dataQuality: { status: 'COMPLETE', visibleOnly: true, missingInvestmentValuationCount: 0, accountOpeningBalanceBoundary: '2025-01-01', notes: [] }
};

const householdDatabase = {
  householdMembership: {
    findUnique: vi.fn(async () => ({ householdId: 'household-1', userId: 'user-1' })),
    updateMany: vi.fn(async () => ({ count: 1 }))
  },
  $disconnect: vi.fn(async () => undefined)
} as unknown as NonNullable<BuildAppOptions['householdDatabaseClient']>;

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);

describe('household investment and report routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedOperations.getInvestmentPortfolio.mockResolvedValue(portfolio);
    mockedOperations.createInvestmentPosition.mockResolvedValue(position);
    mockedOperations.getInvestmentValueHistory.mockResolvedValue({ data: [{ transactionId: transaction.id, positionId: position.id, instrument: position.instrument, wrapper: position.wrapper, date: transaction.date, value: transaction.amount }], from: null, to: null, missingValuationPositionIds: [] });
    mockedOperations.getInvestmentContributions.mockResolvedValue({ data: [{ transaction, positionId: position.id, instrument: position.instrument, wrapper: position.wrapper }], totalContribution: '100.00', ikzeContribution: '100.00', year: 2026, annualLimit: '10000.00', annualLimitSource: 'user-confirmed 2026 limit', annualLimitConfirmation: 'USER_CONFIRMED', ikzeHeadroom: '9900.00' });
    mockedOperations.updateInvestmentPosition.mockResolvedValue(position);
    mockedOperations.listInvestmentTransactions.mockResolvedValue([transaction]);
    mockedOperations.recordInvestmentTransaction.mockResolvedValue({ transaction, position, replayed: false });
    mockedOperations.voidInvestmentTransaction.mockResolvedValue({ transaction: { ...transaction, voidedAt: new Date('2026-02-01T00:00:00.000Z'), voidedByUserId: 'user-1' }, position, replayed: false });
    mockedOperations.getHouseholdReportSummary.mockResolvedValue(report);
    mockedOperations.getHouseholdTaxReturnReport.mockResolvedValue({ from: '2026-01-01', to: '2026-12-31', ikzeContributions: [], totalIkzeContributions: '0.00', calculations: { annualLimit: null, ikzeHeadroom: null, taxLiability: null }, informationalOnly: true, notice: 'Informational only' });
    mockedPdf.generateHouseholdReportPdf.mockResolvedValue(Buffer.from('%PDF-1.7'));
  });

  it('authenticates, checks live membership, and serializes investment decimals and dates', async () => {
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'user@example.com', name: 'User', companies: [] });
    const request = { headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } };

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/households/household-1/investments', ...request }),
      app.inject({ method: 'POST', url: '/households/household-1/investments/position-1/transactions', payload: { type: 'BUY', units: '2', amount: '100.00', date: '2026-01-01', operationId: 'operation-1' }, ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/investments/position-1/transactions', ...request })
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 201, 200]);
    expect(responses[0]!.json().positions[0].position.units).toBe('2');
    expect(responses[1]!.json().transaction.amount).toBe('100');
    expect(responses[2]!.json()[0].date).toBe('2026-01-01');
    expect(responses[0]!.headers['cache-control']).toBe('private, no-store');
    expect(responses[2]!.headers['cache-control']).toBe('private, no-store');
    expect(householdDatabase.householdMembership.findUnique).toHaveBeenCalled();
    await app.close();
  });

  it('sets private no-store headers on every household financial JSON GET', async () => {
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'user@example.com', name: 'User', companies: [] });
    const request = { headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } };
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/households/household-1/investments/value-history', ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/investments/contributions?year=2026&annualLimit=10000.00&annualLimitSource=user-confirmed%202026%20limit&annualLimitConfirmation=USER_CONFIRMED', ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/reports/summary?from=2026-01-01&to=2026-12-31', ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/reports/tax-return?from=2026-01-01&to=2026-12-31', ...request })
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200]);
    expect(responses.map((response) => response.headers['cache-control'])).toEqual(['private, no-store', 'private, no-store', 'private, no-store', 'private, no-store']);
    expect(responses[1]!.json().annualLimitConfirmation).toBe('USER_CONFIRMED');
    await app.close();
  });

  it('maps owner errors to the stable 409 code after membership succeeds', async () => {
    mockedOperations.recordInvestmentTransaction.mockRejectedValue(new InvestmentServiceError('INVESTMENT_OWNER_REQUIRED', 'Only owner'));
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-2', email: 'member@example.com', name: 'Member', companies: [] });

    const response = await app.inject({ method: 'POST', url: '/households/household-1/investments/position-1/transactions', headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken }, payload: { type: 'BUY', units: '1', amount: '10.00', date: '2026-01-01', operationId: 'operation-2' } });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe('INVESTMENT_OWNER_REQUIRED');
    await app.close();
  });

  it('maps workload limits to 413', async () => {
    mockedOperations.getInvestmentValueHistory.mockRejectedValue(new InvestmentServiceError('WORKLOAD_LIMIT_EXCEEDED', 'Too many rows'));
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'user@example.com', name: 'User', companies: [] });

    const response = await app.inject({ method: 'GET', url: '/households/household-1/investments/value-history', headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('WORKLOAD_LIMIT_EXCEEDED');
    await app.close();
  });

  it('returns 403 for a non-member before the investment service is called', async () => {
    householdDatabase.householdMembership.findUnique.mockResolvedValueOnce(null);
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'outsider', email: 'outsider@example.com', name: 'Outsider', companies: [] });

    const response = await app.inject({ method: 'GET', url: '/households/household-1/investments', headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(403);
    expect(mockedOperations.getInvestmentPortfolio).not.toHaveBeenCalled();
    await app.close();
  });

  it('neutralizes formula-like user fields and sends private no-store CSV headers', async () => {
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'user@example.com', name: 'User', companies: [] });

    const response = await app.inject({ method: 'GET', url: '/households/household-1/reports/export?from=2026-01-01&to=2026-12-31&format=csv', headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-disposition']).toContain('household-report-2026-01-01-2026-12-31.csv');
    expect(response.body).toContain("'\uFEFF\r\n\u2003=SUM(A1:A2)");
    expect(response.body).toContain("'@launch");
    expect(response.body.charCodeAt(0)).toBe(0xfeff);
    await app.close();
  });

  it('maps bounded PDF renderer failures to the existing report limit response', async () => {
    mockedPdf.generateHouseholdReportPdf.mockRejectedValue(new HouseholdReportPdfError('WORKLOAD_LIMIT_EXCEEDED', 'PDF export queue is full'));
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'user@example.com', name: 'User', companies: [] });

    const response = await app.inject({ method: 'GET', url: '/households/household-1/reports/export?from=2026-01-01&to=2026-12-31&format=pdf', headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } });

    expect(response.statusCode).toBe(413);
    expect(response.json().code).toBe('WORKLOAD_LIMIT_EXCEEDED');
    await app.close();
  });
});
