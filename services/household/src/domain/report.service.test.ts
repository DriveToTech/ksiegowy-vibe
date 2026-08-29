import { Prisma, type HouseholdAccount, type HouseholdTransaction, type InvestmentPosition, type InvestmentTransaction, type PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';
import { getHouseholdReportSummary, getHouseholdTaxReturnReport } from './report.service.js';

const buildAccount = (overrides: Partial<HouseholdAccount> = {}): HouseholdAccount => ({
  id: 'account-shared', householdId: 'household-1', name: 'Current account', type: 'CURRENT', accountNumberMask: null, visibility: 'SHARED', ownerUserId: null,
  openingBalance: new Prisma.Decimal('100.00'), creditLimit: null, statementDay: null, createdAt: new Date('2025-01-01T00:00:00.000Z'), updatedAt: new Date('2025-01-01T00:00:00.000Z'), ...overrides
});

const buildTransaction = (overrides: Partial<HouseholdTransaction> = {}, category: { id: string; name: string; cashFlowTreatment: 'STANDARD' | 'TRANSFER' } | null = null): HouseholdTransaction & { category: typeof category } => ({
  id: 'ledger-1', householdId: 'household-1', accountId: 'account-shared', categoryId: category?.id ?? null, payee: 'Payee', payerUserId: 'user-1', bankDescription: null,
  amount: new Prisma.Decimal('0.00'), date: new Date('2026-01-05T00:00:00.000Z'), tag: null, note: null, isRecurring: false, commitmentId: null, goalMovementId: null,
  categorizationSource: 'MANUAL', importBatchId: null, transferGroupId: null, createdAt: new Date('2026-01-05T00:00:00.000Z'), updatedAt: new Date('2026-01-05T00:00:00.000Z'), ...overrides, category
});

const buildPosition = (overrides: Partial<InvestmentPosition> = {}, transactions: InvestmentTransaction[] = []): InvestmentPosition & { transactions: InvestmentTransaction[] } => ({
  id: 'position-1', householdId: 'household-1', ownerUserId: 'user-1', wrapper: 'IKZE', visibility: 'SHARED', instrument: 'ETF World', units: new Prisma.Decimal('2'), costBasis: new Prisma.Decimal('100.00'), currentValue: new Prisma.Decimal('250.00'), targetAllocationPercent: null,
  lastValuedAt: new Date('2026-08-01T00:00:00.000Z'), archivedAt: null, createdAt: new Date('2025-01-01T00:00:00.000Z'), updatedAt: new Date('2025-01-01T00:00:00.000Z'), ...overrides, transactions
});

const buildInvestmentTransaction = (overrides: Partial<InvestmentTransaction> = {}): InvestmentTransaction => ({
  id: 'investment-transaction-1', householdId: 'household-1', positionId: 'position-1', type: 'VALUATION_UPDATE', units: null, amount: new Prisma.Decimal('250.00'), date: new Date('2026-08-01T00:00:00.000Z'), operationId: 'operation-1', voidedAt: null, voidedByUserId: null, createdAt: new Date('2026-08-01T01:00:00.000Z'), ...overrides
});

const buildDatabase = (account: HouseholdAccount, transactions: Array<HouseholdTransaction & { category: { id: string; name: string; cashFlowTreatment: 'STANDARD' | 'TRANSFER' } | null }>, positions: Array<InvestmentPosition & { transactions: InvestmentTransaction[] }>) => ({
  householdAccount: {
    findMany: vi.fn(async (arguments_: { select?: unknown }) => arguments_.select ? [{ id: account.id }] : [account])
  },
  householdTransaction: { findMany: vi.fn(async () => transactions) },
  investmentPosition: { findMany: vi.fn(async () => positions) }
} as unknown as PrismaClient);

describe('getHouseholdReportSummary()', () => {
  it('excludes linked and TRANSFER-category cash flow, scopes aggregates to visible records, and includes account/investment components', async () => {
    const account = buildAccount();
    const transactions = [
      buildTransaction({ id: 'old', amount: new Prisma.Decimal('10.00'), date: new Date('2024-01-01T00:00:00.000Z') }, { id: 'salary', name: 'Salary', cashFlowTreatment: 'STANDARD' }),
      buildTransaction({ id: 'income', amount: new Prisma.Decimal('500.00') }, { id: 'salary', name: 'Salary', cashFlowTreatment: 'STANDARD' }),
      buildTransaction({ id: 'expense', amount: new Prisma.Decimal('-100.00') }, { id: 'groceries', name: 'Groceries', cashFlowTreatment: 'STANDARD' }),
      buildTransaction({ id: 'linked-transfer', amount: new Prisma.Decimal('-50.00'), transferGroupId: 'transfer-1' }, { id: 'transfer', name: 'Investment transfers', cashFlowTreatment: 'TRANSFER' }),
      buildTransaction({ id: 'category-transfer', amount: new Prisma.Decimal('-20.00') }, { id: 'transfer', name: 'Investment transfers', cashFlowTreatment: 'TRANSFER' })
    ];
    const valuation = buildInvestmentTransaction();
    const prisma = buildDatabase(account, transactions, [buildPosition({}, [valuation])]);

    const report = await getHouseholdReportSummary(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2026-12-31' });

    expect(report.cashFlow).toMatchObject({ income: '500.00', spending: '100.00', surplus: '400.00' });
    expect(report.cashFlow.categories.map((category) => category.categoryName)).toEqual(['Groceries', 'Salary']);
    expect(report.netWorth.accounts).toHaveLength(1);
    expect(report.netWorth.investments).toEqual([expect.objectContaining({ instrument: 'ETF World', value: '250.00', completeness: 'COMPLETE' })]);
    expect(report.netWorth.components).toEqual({ accounts: '430.00', investments: '250.00' });
    expect(report.dataQuality).toMatchObject({ visibleOnly: true, status: 'COMPLETE', missingInvestmentValuationCount: 0 });
    expect(report.categoryComparison.basis).toBe('EQUIVALENT_PRIOR_YEAR');
  });

  it('marks net worth partial instead of inventing a value when a visible position has no valuation', async () => {
    const prisma = buildDatabase(buildAccount(), [], [buildPosition({ currentValue: null }, [])]);

    const report = await getHouseholdReportSummary(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2026-06-30' });

    expect(report.netWorth.investments[0]).toMatchObject({ value: null, completeness: 'PARTIAL' });
    expect(report.dataQuality).toMatchObject({ status: 'PARTIAL', missingInvestmentValuationCount: 1 });
    expect(report.netWorth.total).toBe('100.00');
  });

  it('rejects report ranges longer than one year', async () => {
    const prisma = buildDatabase(buildAccount(), [], []);

    await expect(getHouseholdReportSummary(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2027-01-01' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects reports whose ledger workload exceeds the bounded read model', async () => {
    const account = buildAccount();
    const transactions = Array.from({ length: 10_001 }, (_, index) => buildTransaction({ id: `ledger-${index}` }));
    const prisma = buildDatabase(account, transactions, []);

    await expect(getHouseholdReportSummary(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({ code: 'WORKLOAD_LIMIT_EXCEEDED' });
  });

  it('rejects overlong user-controlled report export text', async () => {
    const prisma = buildDatabase(buildAccount({ name: 'x'.repeat(161) }), [], []);

    await expect(getHouseholdReportSummary(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2026-12-31' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('getHouseholdTaxReturnReport()', () => {
  it('returns IKZE contribution evidence without tax or headroom calculations', async () => {
    const contribution = buildInvestmentTransaction({ type: 'CONTRIBUTION', amount: new Prisma.Decimal('300.00'), date: new Date('2026-03-05T00:00:00.000Z') });
    const otherWrapperContribution = buildInvestmentTransaction({ id: 'investment-transaction-2', positionId: 'position-2', amount: new Prisma.Decimal('100.00'), type: 'CONTRIBUTION' });
    const archivedContribution = buildInvestmentTransaction({ id: 'investment-transaction-3', positionId: 'position-3', amount: new Prisma.Decimal('50.00'), type: 'CONTRIBUTION', date: new Date('2026-04-05T00:00:00.000Z') });
    const prisma = buildDatabase(buildAccount(), [], [
      buildPosition({}, [contribution]),
      buildPosition({ id: 'position-2', wrapper: 'TAXABLE', instrument: 'Bond' }, [otherWrapperContribution]),
      buildPosition({ id: 'position-3', instrument: 'Archived ETF', archivedAt: new Date('2026-05-01T00:00:00.000Z') }, [archivedContribution])
    ]);

    const report = await getHouseholdTaxReturnReport(prisma, 'household-1', 'user-1', { from: '2026-01-01', to: '2026-12-31' });

    expect(report.ikzeContributions).toEqual([
      { kind: 'IKZE_CONTRIBUTION', positionId: 'position-1', instrument: 'ETF World', date: '2026-03-05', amount: '300.00' },
      { kind: 'IKZE_CONTRIBUTION', positionId: 'position-3', instrument: 'Archived ETF', date: '2026-04-05', amount: '50.00' }
    ]);
    expect(report.totalIkzeContributions).toBe('350.00');
    expect(report.calculations).toEqual({ annualLimit: null, ikzeHeadroom: null, taxLiability: null });
    expect(report.informationalOnly).toBe(true);
  });
});
