import { Prisma, type InvestmentPosition, type InvestmentTransaction, type PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createInvestmentPosition,
  getInvestmentPortfolio,
  InvestmentServiceError,
  listInvestmentTransactions,
  recordInvestmentTransaction,
  updateInvestmentPosition,
  voidInvestmentTransaction
} from './investment.service.js';
import { getInvestmentContributions, getInvestmentValueHistory } from './investment-read.service.js';

const buildPosition = (overrides: Partial<InvestmentPosition> = {}): InvestmentPosition => ({
  id: 'position-1', householdId: 'household-1', ownerUserId: 'user-1', wrapper: 'TAXABLE', visibility: 'SHARED', instrument: 'ETF World',
  units: new Prisma.Decimal('5'), costBasis: new Prisma.Decimal('100.00'), currentValue: new Prisma.Decimal('125.00'), targetAllocationPercent: new Prisma.Decimal('100.00'),
  lastValuedAt: new Date('2026-01-02T00:00:00.000Z'), archivedAt: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), ...overrides
});

const buildTransaction = (overrides: Partial<InvestmentTransaction> = {}): InvestmentTransaction => ({
  id: 'transaction-1', householdId: 'household-1', positionId: 'position-1', type: 'BUY', units: new Prisma.Decimal('5'), amount: new Prisma.Decimal('100.00'), date: new Date('2026-01-01T00:00:00.000Z'), operationId: 'operation-1', voidedAt: null, voidedByUserId: null, createdAt: new Date('2026-01-01T01:00:00.000Z'), ...overrides
});

const buildDatabase = (overrides: Record<string, unknown> = {}) => {
  const database = {
    investmentPosition: {
      findFirst: vi.fn(async () => buildPosition()),
      findMany: vi.fn(async () => [buildPosition()]),
      create: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ ...buildPosition(), ...arguments_.data })),
      update: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ ...buildPosition(), ...arguments_.data })),
      count: vi.fn(async () => 0)
    },
    investmentTransaction: {
      findUnique: vi.fn(async () => null),
      findFirst: vi.fn(async () => buildTransaction()),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ ...buildTransaction(), ...arguments_.data })),
      update: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ ...buildTransaction(), ...arguments_.data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUniqueOrThrow: vi.fn(async () => buildTransaction())
    },
    $queryRaw: vi.fn(async () => [{ id: 'position-1' }]),
    $transaction: vi.fn(async (operation: (transactionClient: Prisma.TransactionClient) => Promise<unknown>) => operation(database as unknown as Prisma.TransactionClient)),
    ...overrides
  };
  return database as unknown as PrismaClient;
};

describe('createInvestmentPosition()', () => {
  it('derives an immutable owner from the authenticated user and starts without a fabricated valuation', async () => {
    const prisma = buildDatabase();
    const position = await createInvestmentPosition(prisma, { householdId: 'household-1', userId: 'user-2', wrapper: 'IKE', instrument: 'ETF', visibility: 'SHARED' });

    expect(prisma.investmentPosition.create).toHaveBeenCalledWith({ data: {
      householdId: 'household-1', ownerUserId: 'user-2', wrapper: 'IKE', visibility: 'SHARED', instrument: 'ETF', units: new Prisma.Decimal(0), costBasis: new Prisma.Decimal(0), currentValue: null, targetAllocationPercent: null
    } });
    expect(position.currentValue).toBeNull();
  });
});

describe('listInvestmentTransactions()', () => {
  it('returns journal rows for a visible shared position, including voided audit rows', async () => {
    const transaction = buildTransaction({ voidedAt: new Date('2026-02-01T00:00:00.000Z') });
    const prisma = buildDatabase();
    prisma.investmentTransaction.findMany = vi.fn(async () => [transaction]);

    await expect(listInvestmentTransactions(prisma, 'household-1', 'member-1', 'position-1')).resolves.toEqual([transaction]);
  });

  it('hides a private position from another member', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => null);

    await expect(listInvestmentTransactions(prisma, 'household-1', 'member-1', 'position-1')).rejects.toMatchObject({ code: 'INVESTMENT_NOT_FOUND' });
  });

  it('rejects transaction history beyond the bounded read model', async () => {
    const prisma = buildDatabase();
    prisma.investmentTransaction.findMany = vi.fn(async () => Array.from({ length: 5_001 }, (_, index) => buildTransaction({ id: `transaction-${index}` })));

    await expect(listInvestmentTransactions(prisma, 'household-1', 'user-1', 'position-1')).rejects.toMatchObject({ code: 'WORKLOAD_LIMIT_EXCEEDED' });
  });
});

describe('recordInvestmentTransaction()', () => {
  it('applies BUY units and cost basis while keeping the missing valuation partial', async () => {
    const position = buildPosition({ units: new Prisma.Decimal(0), costBasis: new Prisma.Decimal(0), currentValue: null, lastValuedAt: null });
    const buy = buildTransaction({ units: new Prisma.Decimal('2.5'), amount: new Prisma.Decimal('50.00') });
    const updatedPosition = buildPosition({ units: new Prisma.Decimal('2.5'), costBasis: new Prisma.Decimal('50.00'), currentValue: null, lastValuedAt: null });
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => position);
    prisma.investmentTransaction.create = vi.fn(async () => buy);
    prisma.investmentTransaction.findMany = vi.fn(async () => [buy]);
    prisma.investmentPosition.update = vi.fn(async () => updatedPosition);

    const result = await recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'BUY', units: '2.5', amount: '50.00', date: '2026-01-01', operationId: 'operation-1' });

    expect(result).toEqual({ transaction: buy, position: updatedPosition, replayed: false });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.investmentPosition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ units: new Prisma.Decimal('2.5'), costBasis: new Prisma.Decimal('50.00'), currentValue: null }) }));
  });

  it('reduces SELL cost basis proportionally and rejects a sale above available units', async () => {
    const buy = buildTransaction({ units: new Prisma.Decimal('5'), amount: new Prisma.Decimal('100.00') });
    const sell = buildTransaction({ id: 'transaction-2', type: 'SELL', units: new Prisma.Decimal('2'), amount: new Prisma.Decimal('70.00'), operationId: 'operation-2', createdAt: new Date('2026-01-02T01:00:00.000Z') });
    const prisma = buildDatabase();
    prisma.investmentTransaction.create = vi.fn(async () => sell);
    prisma.investmentTransaction.findMany = vi.fn(async () => [buy, sell]);

    await recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'SELL', units: '2', amount: '70.00', date: '2026-01-02', operationId: 'operation-2' });
    expect(prisma.investmentPosition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ units: new Prisma.Decimal('3'), costBasis: new Prisma.Decimal('60.00') }) }));

    const insufficientSell = buildTransaction({ id: 'transaction-3', type: 'SELL', units: new Prisma.Decimal('6'), amount: new Prisma.Decimal('70.00'), operationId: 'operation-3' });
    prisma.investmentTransaction.create = vi.fn(async () => insufficientSell);
    prisma.investmentTransaction.findMany = vi.fn(async () => [buy, insufficientSell]);
    await expect(recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'SELL', units: '6', amount: '70.00', date: '2026-01-02', operationId: 'operation-3' })).rejects.toMatchObject({ code: 'SELL_UNITS_INSUFFICIENT' });
  });

  it('changes current value only for VALUATION_UPDATE and records CONTRIBUTION without changing projections', async () => {
    const buy = buildTransaction({ units: new Prisma.Decimal('5'), amount: new Prisma.Decimal('100.00') });
    const valuation = buildTransaction({ id: 'transaction-2', type: 'VALUATION_UPDATE', units: null, amount: new Prisma.Decimal('140.00'), operationId: 'operation-2', date: new Date('2026-02-01T00:00:00.000Z') });
    const contribution = buildTransaction({ id: 'transaction-3', type: 'CONTRIBUTION', units: null, amount: new Prisma.Decimal('20.00'), operationId: 'operation-3', date: new Date('2026-02-02T00:00:00.000Z') });
    const prisma = buildDatabase();
    prisma.investmentTransaction.create = vi.fn()
      .mockResolvedValueOnce(valuation)
      .mockResolvedValueOnce(contribution);
    prisma.investmentTransaction.findMany = vi.fn()
      .mockResolvedValueOnce([buy, valuation])
      .mockResolvedValueOnce([buy, valuation, contribution]);

    await recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'VALUATION_UPDATE', amount: '140.00', date: '2026-02-01', operationId: 'operation-2' });
    expect(prisma.investmentPosition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ units: new Prisma.Decimal('5'), costBasis: new Prisma.Decimal('100.00'), currentValue: new Prisma.Decimal('140.00') }) }));
    await recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'CONTRIBUTION', amount: '20.00', date: '2026-02-02', operationId: 'operation-3' });
    expect(prisma.investmentPosition.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ units: new Prisma.Decimal('5'), costBasis: new Prisma.Decimal('100.00'), currentValue: new Prisma.Decimal('140.00') }) }));
  });

  it('replays an identical operation and rejects a different payload', async () => {
    const existing = buildTransaction();
    const prisma = buildDatabase();
    prisma.investmentTransaction.findUnique = vi.fn(async () => existing);
    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition());
    const input = { householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'BUY' as const, units: '5', amount: '100.00', date: '2026-01-01', operationId: 'operation-1' };

    await expect(recordInvestmentTransaction(prisma, input)).resolves.toMatchObject({ transaction: existing, replayed: true });
    await expect(recordInvestmentTransaction(prisma, { ...input, amount: '101.00' })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('requires the position owner even when the position is shared', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition({ ownerUserId: 'owner-1', visibility: 'SHARED' }));

    await expect(recordInvestmentTransaction(prisma, { householdId: 'household-1', userId: 'member-1', positionId: 'position-1', type: 'BUY', units: '1', amount: '10.00', date: '2026-01-01', operationId: 'operation-1' })).rejects.toMatchObject({ code: 'INVESTMENT_OWNER_REQUIRED' });
  });

  it('rejects decimal overflow before creating a journal row', async () => {
    const prisma = buildDatabase();

    await expect(recordInvestmentTransaction(prisma, {
      householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'BUY', units: '1', amount: '10000000000000.00', date: '2026-01-01', operationId: 'overflow-amount'
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(recordInvestmentTransaction(prisma, {
      householdId: 'household-1', userId: 'user-1', positionId: 'position-1', type: 'BUY', units: '1000000000000.00000000', amount: '10.00', date: '2026-01-01', operationId: 'overflow-units'
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(prisma.investmentTransaction.create).not.toHaveBeenCalled();
  });
});

describe('voidInvestmentTransaction()', () => {
  it('keeps the audit row and recomputes the position projection', async () => {
    const transaction = buildTransaction();
    const voidedTransaction = buildTransaction({ voidedAt: new Date('2026-02-01T00:00:00.000Z'), voidedByUserId: 'user-1' });
    const updatedPosition = buildPosition({ units: new Prisma.Decimal(0), costBasis: new Prisma.Decimal(0), currentValue: null, lastValuedAt: null });
    const prisma = buildDatabase();
    prisma.investmentTransaction.findFirst = vi.fn(async () => transaction);
    prisma.investmentTransaction.updateMany = vi.fn(async () => ({ count: 1 }));
    prisma.investmentTransaction.findUniqueOrThrow = vi.fn(async () => voidedTransaction);
    prisma.investmentTransaction.findMany = vi.fn(async () => [voidedTransaction]);
    prisma.investmentPosition.update = vi.fn(async () => updatedPosition);

    const result = await voidInvestmentTransaction(prisma, 'household-1', 'user-1', 'position-1', 'transaction-1');

    expect(result).toEqual({ transaction: voidedTransaction, position: updatedPosition, replayed: false });
    expect(prisma.investmentTransaction.updateMany).toHaveBeenCalledWith({ where: { id: 'transaction-1', householdId: 'household-1', positionId: 'position-1', voidedAt: null }, data: expect.objectContaining({ voidedByUserId: 'user-1' }) });
  });

  it('checks the owner inside the serialized position transaction', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition({ ownerUserId: 'owner-1' }));

    await expect(voidInvestmentTransaction(prisma, 'household-1', 'member-1', 'position-1', 'transaction-1')).rejects.toMatchObject({ code: 'INVESTMENT_OWNER_REQUIRED' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('replays an already voided transaction without writing again', async () => {
    const voidedTransaction = buildTransaction({ voidedAt: new Date('2026-02-01T00:00:00.000Z'), voidedByUserId: 'user-1' });
    const prisma = buildDatabase();
    prisma.investmentTransaction.findFirst = vi.fn(async () => voidedTransaction);

    await expect(voidInvestmentTransaction(prisma, 'household-1', 'user-1', 'position-1', 'transaction-1')).resolves.toMatchObject({ transaction: voidedTransaction, replayed: true });
    expect(prisma.investmentTransaction.updateMany).not.toHaveBeenCalled();
  });
});

describe('updateInvestmentPosition()', () => {
  it('archives only a zero-unit, zero-value position', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition({ units: new Prisma.Decimal(0), currentValue: new Prisma.Decimal(0) }));

    await updateInvestmentPosition(prisma, 'household-1', 'position-1', { userId: 'user-1', archive: true });
    expect(prisma.investmentPosition.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ archivedAt: expect.any(Date) }) }));

    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition({ units: new Prisma.Decimal('1'), currentValue: new Prisma.Decimal(0) }));
    await expect(updateInvestmentPosition(prisma, 'household-1', 'position-1', { userId: 'user-1', archive: true })).rejects.toMatchObject({ code: 'INVESTMENT_INVALID_STATE' });
  });

  it('checks the owner inside the serialized position transaction', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findFirst = vi.fn(async () => buildPosition({ ownerUserId: 'owner-1' }));

    await expect(updateInvestmentPosition(prisma, 'household-1', 'position-1', { userId: 'member-1', archive: true })).rejects.toMatchObject({ code: 'INVESTMENT_OWNER_REQUIRED' });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

describe('getInvestmentPortfolio()', () => {
  it('returns known allocations but leaves drift unavailable when valuations or targets are incomplete', async () => {
    const prisma = buildDatabase();
    prisma.investmentPosition.findMany = vi.fn(async () => [
      buildPosition({ id: 'position-1', currentValue: new Prisma.Decimal('100.00'), targetAllocationPercent: new Prisma.Decimal('60.00') }),
      buildPosition({ id: 'position-2', currentValue: null, targetAllocationPercent: null })
    ]);

    const portfolio = await getInvestmentPortfolio(prisma, 'household-1', 'user-1');

    expect(portfolio.dataQuality).toBe('PARTIAL');
    expect(portfolio.missingValuationCount).toBe(1);
    expect(portfolio.positions[0]).toMatchObject({ currentAllocationPercent: '100.00', driftPercent: null });
    expect(portfolio.targetAllocation).toEqual({ status: 'INCOMPLETE', totalPercent: '60.00' });
  });
});

describe('getInvestmentValueHistory()', () => {
  it('returns only non-voided visible valuation facts and identifies positions without a point', async () => {
    const position = buildPosition({ currentValue: null });
    const valuation = buildTransaction({ type: 'VALUATION_UPDATE', units: null, amount: new Prisma.Decimal('130.00'), operationId: 'valuation-1', date: new Date('2026-02-01T00:00:00.000Z') });
    const prisma = buildDatabase();
    prisma.investmentPosition.findMany = vi.fn(async () => [position]);
    prisma.investmentTransaction.findMany = vi.fn(async () => [valuation]);

    const result = await getInvestmentValueHistory(prisma, 'household-1', 'user-1', '2026-01-01', '2026-12-31');

    expect(result.data[0]).toMatchObject({ positionId: 'position-1', value: new Prisma.Decimal('130.00') });
    expect(result.missingValuationPositionIds).toEqual([]);
  });

  it('rejects value history beyond the bounded row limit', async () => {
    const prisma = buildDatabase();
    prisma.investmentTransaction.findMany = vi.fn(async () => Array.from({ length: 5_001 }, (_, index) => buildTransaction({ id: `valuation-${index}`, type: 'VALUATION_UPDATE', units: null })));

    await expect(getInvestmentValueHistory(prisma, 'household-1', 'user-1')).rejects.toMatchObject({ code: 'WORKLOAD_LIMIT_EXCEEDED' });
  });
});

describe('getInvestmentContributions()', () => {
  it('keeps IKZE headroom unavailable without a year-specific user-confirmed limit and source', async () => {
    const position = buildPosition({ wrapper: 'IKZE' });
    const contribution = buildTransaction({ type: 'CONTRIBUTION', units: null, amount: new Prisma.Decimal('200.00'), date: new Date('2026-02-01T00:00:00.000Z') });
    const prisma = buildDatabase();
    prisma.investmentPosition.findMany = vi.fn(async () => [position]);
    prisma.investmentTransaction.findMany = vi.fn(async () => [contribution]);

    const unavailable = await getInvestmentContributions(prisma, 'household-1', 'user-1', { year: 2026 });
    expect(unavailable.ikzeHeadroom).toBeNull();
    const available = await getInvestmentContributions(prisma, 'household-1', 'user-1', { year: 2026, annualLimit: '300.00', annualLimitSource: 'User confirmed 2026 limit', annualLimitConfirmation: 'USER_CONFIRMED' });
    expect(available).toMatchObject({ ikzeContribution: '200.00', ikzeHeadroom: '100.00', annualLimitSource: 'User confirmed 2026 limit', annualLimitConfirmation: 'USER_CONFIRMED' });
  });

  it('rejects a limit without its source', async () => {
    const prisma = buildDatabase();
    await expect(getInvestmentContributions(prisma, 'household-1', 'user-1', { year: 2026, annualLimit: '300.00' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a supplied annual limit without explicit user confirmation', async () => {
    const prisma = buildDatabase();

    await expect(getInvestmentContributions(prisma, 'household-1', 'user-1', { year: 2026, annualLimit: '300.00', annualLimitSource: 'User supplied source' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects contribution history beyond the bounded row limit', async () => {
    const prisma = buildDatabase();
    prisma.investmentTransaction.findMany = vi.fn(async () => Array.from({ length: 5_001 }, (_, index) => buildTransaction({ id: `contribution-${index}`, type: 'CONTRIBUTION', units: null })));

    await expect(getInvestmentContributions(prisma, 'household-1', 'user-1', { year: 2026 })).rejects.toMatchObject({ code: 'WORKLOAD_LIMIT_EXCEEDED' });
  });
});

describe('InvestmentServiceError', () => {
  it('has a stable domain error code', () => {
    expect(new InvestmentServiceError('INVESTMENT_OWNER_REQUIRED', 'owner')).toMatchObject({ code: 'INVESTMENT_OWNER_REQUIRED' });
  });
});
