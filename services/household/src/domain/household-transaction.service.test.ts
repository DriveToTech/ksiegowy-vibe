import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import {
  calculateMoneySummary,
  createTransaction,
  createTransfer,
  deleteTransaction,
  getMonthlyInOutSummary,
  listTransactions,
  recategorizeTransaction
} from './household-transaction.service.js';

// ── createTransaction() ───────────────────────────────────────────────────────

describe('createTransaction()', () => {
  it('applies a matching categorization rule when no categoryId is given', async () => {
    const create = vi.fn(async (args: unknown) => args);
    const prisma = {
      householdAccount: { findFirst: vi.fn(async () => ({ id: 'account-1' })) },
      categorizationRule: {
        findMany: vi.fn(async () => [
          { id: 'rule-1', matchType: 'EXACT', payeePattern: 'Netflix', categoryId: 'category-entertainment', createdAt: new Date() }
        ])
      },
      householdTransaction: { create }
    } as unknown as PrismaClient;

    await createTransaction(prisma, {
      householdId: 'household-1',
      accountId: 'account-1',
      payee: 'Netflix',
      amount: '-49.99',
      date: '2026-08-01'
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        accountId: 'account-1',
        categoryId: 'category-entertainment',
        payee: 'Netflix',
        payerUserId: null,
        bankDescription: null,
        amount: '-49.99',
        date: new Date('2026-08-01'),
        tag: null,
        note: null,
        isRecurring: false,
        categorizationSource: 'RULE',
        importBatchId: null
      }
    });
  });

  it('leaves the transaction uncategorized when no rule matches and no categoryId is given', async () => {
    const create = vi.fn(async (args: { data: { categoryId: string | null; categorizationSource: string } }) => args);
    const prisma = {
      householdAccount: { findFirst: vi.fn(async () => ({ id: 'account-1' })) },
      categorizationRule: { findMany: vi.fn(async () => []) },
      householdTransaction: { create }
    } as unknown as PrismaClient;

    await createTransaction(prisma, {
      householdId: 'household-1',
      accountId: 'account-1',
      payee: 'Unknown Shop',
      amount: '-10.00',
      date: '2026-08-01'
    });

    expect(create.mock.calls[0]![0].data.categoryId).toBeNull();
    expect(create.mock.calls[0]![0].data.categorizationSource).toBe('MANUAL');
  });

  it('throws when the account does not belong to the household', async () => {
    const prisma = {
      householdAccount: { findFirst: vi.fn(async () => null) }
    } as unknown as PrismaClient;

    await expect(
      createTransaction(prisma, { householdId: 'household-1', accountId: 'account-other', payee: 'Shop', amount: '-5.00', date: '2026-08-01' })
    ).rejects.toThrow('Account account-other not found in household household-1');
  });
});

// ── createTransfer() ───────────────────────────────────────────────────────────

describe('createTransfer()', () => {
  it('creates two linked rows sharing a transferGroupId: negative on the source, positive on the destination', async () => {
    const householdTransactionCreate = vi.fn((args: { data: { accountId: string } }) => args.data);
    const prisma = {
      householdAccount: { findFirst: vi.fn(async () => ({ id: 'account-x' })) },
      householdTransaction: { create: householdTransactionCreate },
      $transaction: vi.fn(async (operations: unknown[]) => operations)
    } as unknown as PrismaClient;

    const [source, destination] = await createTransfer(prisma, {
      householdId: 'household-1',
      fromAccountId: 'account-current',
      toAccountId: 'account-savings',
      amount: '200.00',
      date: '2026-08-01'
    });

    expect(source).toEqual(
      expect.objectContaining({ accountId: 'account-current', amount: '-200', payee: 'Transfer' })
    );
    expect(destination).toEqual(
      expect.objectContaining({ accountId: 'account-savings', amount: '200', payee: 'Transfer' })
    );
    expect(source.transferGroupId).toBe(destination.transferGroupId);
  });

  it('throws when the source and destination accounts are the same', async () => {
    const prisma = {} as unknown as PrismaClient;

    await expect(
      createTransfer(prisma, {
        householdId: 'household-1',
        fromAccountId: 'account-current',
        toAccountId: 'account-current',
        amount: '200.00',
        date: '2026-08-01'
      })
    ).rejects.toThrow('Transfer source and destination accounts must be different');
  });
});

// ── listTransactions() ────────────────────────────────────────────────────────

describe('listTransactions()', () => {
  it('scopes the query to the accounts visible to the requesting user', async () => {
    const findMany = vi.fn(async () => []);
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-shared' }]) },
      householdTransaction: { findMany }
    } as unknown as PrismaClient;

    await listTransactions(prisma, 'household-1', 'user-1', { excludeTransfers: true });

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: {
        householdId: 'household-1',
        accountId: { in: ['account-shared'] },
        transferGroupId: null
      },
      orderBy: { date: 'desc' },
      take: 50,
      skip: 0
    });
    expect(findMany).toHaveBeenNthCalledWith(2, {
      where: {
        householdId: 'household-1',
        accountId: { in: ['account-shared'] },
        transferGroupId: null
      },
      select: { amount: true, transferGroupId: true }
    });
  });

  it('returns an empty page without querying transactions when no accounts are visible', async () => {
    const findMany = vi.fn();
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => []) },
      householdTransaction: { findMany }
    } as unknown as PrismaClient;

    const result = await listTransactions(prisma, 'household-1', 'user-1');

    expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50, moneyIn: '0.00', moneyOut: '0.00' });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('paginates using page and limit, and returns total/moneyIn/moneyOut across all matching transactions', async () => {
    const pageOfTransactions = [{ id: 'transaction-3', amount: '-25.00' }];
    const allMatchingAmounts = [{ amount: '100.00' }, { amount: '-25.00' }, { amount: '-15.50' }];
    const findMany = vi.fn(async (args: { select?: unknown }) => (args.select ? allMatchingAmounts : pageOfTransactions));
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-shared' }]) },
      householdTransaction: { findMany }
    } as unknown as PrismaClient;

    const result = await listTransactions(prisma, 'household-1', 'user-1', { page: 2, limit: 1 });

    expect(findMany).toHaveBeenNthCalledWith(1, {
      where: { householdId: 'household-1', accountId: { in: ['account-shared'] } },
      orderBy: { date: 'desc' },
      take: 1,
      skip: 1
    });
    expect(result).toEqual({
      data: pageOfTransactions,
      total: 3,
      page: 2,
      limit: 1,
      moneyIn: '100.00',
      moneyOut: '40.50'
    });
  });

  it('excludes transfer legs from moneyIn/moneyOut even when the rows themselves are not filtered out', async () => {
    const allMatchingAmounts = [
      { amount: '300.00' },
      { amount: '-300.00', transferGroupId: 'transfer-group-1' },
      { amount: '300.00', transferGroupId: 'transfer-group-1' },
      { amount: '-120.50' }
    ];
    const findMany = vi.fn(async (args: { select?: unknown }) => (args.select ? allMatchingAmounts : []));
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-shared' }]) },
      householdTransaction: { findMany }
    } as unknown as PrismaClient;

    const result = await listTransactions(prisma, 'household-1', 'user-1');

    expect(result.moneyIn).toBe('300.00');
    expect(result.moneyOut).toBe('120.50');
  });
});

// ── recategorizeTransaction() ─────────────────────────────────────────────────

describe('recategorizeTransaction()', () => {
  it('updates the category without creating a rule when applyToFutureFromPayee is not set', async () => {
    const ruleCreate = vi.fn();
    const prisma = {
      householdTransaction: {
        findFirst: vi.fn(async () => ({ id: 'transaction-1', payee: 'Netflix' })),
        update: vi.fn(async () => ({ id: 'transaction-1', categoryId: 'category-entertainment' }))
      },
      categorizationRule: { create: ruleCreate }
    } as unknown as PrismaClient;

    await recategorizeTransaction(prisma, 'household-1', 'transaction-1', { categoryId: 'category-entertainment' });

    expect(ruleCreate).not.toHaveBeenCalled();
  });

  it('creates an EXACT rule for the transaction payee when applyToFutureFromPayee is set', async () => {
    const ruleCreate = vi.fn(async () => ({ id: 'rule-1' }));
    const prisma = {
      householdTransaction: {
        findFirst: vi.fn(async () => ({ id: 'transaction-1', payee: 'Netflix' })),
        update: vi.fn(async () => ({ id: 'transaction-1', categoryId: 'category-entertainment' }))
      },
      categorizationRule: { create: ruleCreate }
    } as unknown as PrismaClient;

    await recategorizeTransaction(prisma, 'household-1', 'transaction-1', {
      categoryId: 'category-entertainment',
      applyToFutureFromPayee: true
    });

    expect(ruleCreate).toHaveBeenCalledWith({
      data: { householdId: 'household-1', matchType: 'EXACT', payeePattern: 'Netflix', categoryId: 'category-entertainment' }
    });
  });
});

// ── deleteTransaction() ────────────────────────────────────────────────────────

describe('deleteTransaction()', () => {
  it('deletes both legs of a transfer when the transaction is part of one', async () => {
    const deleteMany = vi.fn(async () => ({ count: 2 }));
    const deleteOne = vi.fn();
    const prisma = {
      householdTransaction: {
        findFirst: vi.fn(async () => ({ id: 'transaction-1', transferGroupId: 'transfer-group-1' })),
        deleteMany,
        delete: deleteOne
      }
    } as unknown as PrismaClient;

    await deleteTransaction(prisma, 'household-1', 'transaction-1');

    expect(deleteMany).toHaveBeenCalledWith({ where: { transferGroupId: 'transfer-group-1' } });
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it('deletes only the single row for a non-transfer transaction', async () => {
    const deleteOne = vi.fn(async () => ({ id: 'transaction-1' }));
    const prisma = {
      householdTransaction: {
        findFirst: vi.fn(async () => ({ id: 'transaction-1', transferGroupId: null })),
        delete: deleteOne
      }
    } as unknown as PrismaClient;

    await deleteTransaction(prisma, 'household-1', 'transaction-1');

    expect(deleteOne).toHaveBeenCalledWith({ where: { id: 'transaction-1' } });
  });
});

// ── getMonthlyInOutSummary() ──────────────────────────────────────────────────

describe('getMonthlyInOutSummary()', () => {
  it('buckets income and expense by month, with the anchor month as the last entry', async () => {
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]) },
      householdTransaction: {
        findMany: vi.fn(async () => [
          { amount: '1500.00', date: new Date('2026-08-03') },
          { amount: '-420.50', date: new Date('2026-08-10') },
          { amount: '-50.00', date: new Date('2026-07-15') }
        ])
      }
    } as unknown as PrismaClient;

    const result = await getMonthlyInOutSummary(prisma, 'household-1', 'user-1', 2, '2026-08');

    expect(result).toEqual([
      { month: '2026-07', income: '0.00', expense: '50.00' },
      { month: '2026-08', income: '1500.00', expense: '420.50' }
    ]);
  });

  it('returns an empty array without querying transactions when no accounts are visible', async () => {
    const findMany = vi.fn();
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => []) },
      householdTransaction: { findMany }
    } as unknown as PrismaClient;

    const result = await getMonthlyInOutSummary(prisma, 'household-1', 'user-1');

    expect(result).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});

// ── calculateMoneySummary() ───────────────────────────────────────────────────

describe('calculateMoneySummary()', () => {
  it('derives money in/out, net worth, and savings rate from already-fetched accounts and monthly totals', () => {
    const accounts = [
      { balance: '8000.00' },
      { balance: '2000.00' }
    ] as unknown as Parameters<typeof calculateMoneySummary>[0];
    const monthlyInOut = [
      { month: '2026-07', income: '4000.00', expense: '3000.00' },
      { month: '2026-08', income: '5000.00', expense: '3800.00' }
    ];

    const result = calculateMoneySummary(accounts, monthlyInOut);

    expect(result).toEqual({
      moneyIn: '5000.00',
      moneyOut: '3800.00',
      netWorth: '10000.00',
      netWorthChangePercent: '13.64',
      savingsRatePercent: '24.00',
      savingsAmountThisMonth: '1200.00'
    });
  });

  it('returns zeroed rates instead of dividing by zero when there is no income or prior net worth', () => {
    const accounts = [{ balance: '0.00' }] as unknown as Parameters<typeof calculateMoneySummary>[0];
    const monthlyInOut = [{ month: '2026-08', income: '0.00', expense: '0.00' }];

    const result = calculateMoneySummary(accounts, monthlyInOut);

    expect(result.netWorthChangePercent).toBe('0.00');
    expect(result.savingsRatePercent).toBe('0.00');
  });
});
