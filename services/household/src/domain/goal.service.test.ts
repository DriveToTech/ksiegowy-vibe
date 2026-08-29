import { Prisma, type PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';
import { createGoal, createGoalMovement, getGoalDetail, type CreateGoalMovementInput } from './goal.service.js';

const account = {
  id: 'account-savings', householdId: 'household-1', name: 'Savings', type: 'SAVINGS', accountNumberMask: null,
  visibility: 'SHARED', ownerUserId: null, openingBalance: new Prisma.Decimal('0.00'), creditLimit: null, statementDay: null,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01')
};

const fundingAccount = { ...account, id: 'account-current', name: 'Current', type: 'CURRENT', openingBalance: new Prisma.Decimal('100.00') };

const baseGoal = {
  id: 'goal-1', householdId: 'household-1', accountId: account.id, name: 'Emergency fund', description: null, kind: 'ONE_OFF', status: 'ACTIVE',
  targetAmount: new Prisma.Decimal('100.00'), currentAmount: new Prisma.Decimal('0.00'), targetDate: new Date('2026-12-31'), monthlyAmount: null,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), account
};

const visibleAccounts = vi.fn(async () => [{ id: fundingAccount.id }, { id: account.id }]);

describe('createGoal()', () => {
  it('accepts a one-off goal with exactly one scheduling field', async () => {
    const create = vi.fn(async (arguments_: unknown) => arguments_);
    const prisma = {
      householdAccount: { findMany: visibleAccounts, findFirst: vi.fn(async () => account) },
      goal: { create }
    } as unknown as PrismaClient;

    await createGoal(prisma, {
      householdId: 'household-1', userId: 'user-1', accountId: account.id, name: 'Emergency fund', kind: 'ONE_OFF', targetAmount: '100.00', targetDate: '2026-12-31'
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1', accountId: account.id, name: 'Emergency fund', description: null, kind: 'ONE_OFF',
        targetAmount: new Prisma.Decimal('100.00'), currentAmount: new Prisma.Decimal('0'), targetDate: new Date('2026-12-31T00:00:00.000Z'), monthlyAmount: null
      }
    });
  });

  it('rejects a one-off goal when both scheduling fields are supplied', async () => {
    const prisma = {
      householdAccount: { findMany: visibleAccounts, findFirst: vi.fn(async () => account) },
      goal: { create: vi.fn() }
    } as unknown as PrismaClient;

    await expect(createGoal(prisma, {
      householdId: 'household-1', userId: 'user-1', accountId: account.id, name: 'Emergency fund', kind: 'ONE_OFF', targetAmount: '100.00', targetDate: '2026-12-31', monthlyAmount: '10.00'
    })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('createGoalMovement()', () => {
  it('creates linked ledger legs and completes a one-off goal atomically at its target', async () => {
    const movementCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({
      id: 'movement-1', ...arguments_.data, createdAt: new Date('2026-08-29T10:00:00.000Z')
    }));
    const transactionCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({
      id: arguments_.data.accountId === fundingAccount.id ? 'source-1' : 'goal-leg-1', ...arguments_.data,
      categoryId: null, bankDescription: null, tag: null, isRecurring: false, commitmentId: null, categorizationSource: 'MANUAL', importBatchId: null,
      createdAt: new Date('2026-08-29T10:00:00.000Z'), updatedAt: new Date('2026-08-29T10:00:00.000Z')
    }));
    const transactionClient = {
      goalMovement: { findUnique: vi.fn(async () => null), aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })), create: movementCreate },
      goal: { findFirst: vi.fn(async () => baseGoal), update: vi.fn(async () => baseGoal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
      householdTransaction: {
        aggregate: vi.fn(async ({ where }: { where: { accountId: string } }) => ({ _sum: { amount: where.accountId === fundingAccount.id ? new Prisma.Decimal('100.00') : new Prisma.Decimal('0.00') } })),
        create: transactionCreate
      }
    };
    const prisma = {
      householdAccount: { findMany: visibleAccounts },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
    } as unknown as PrismaClient;
    const input: CreateGoalMovementInput = {
      householdId: 'household-1', userId: 'user-1', goalId: 'goal-1', accountId: fundingAccount.id, direction: 'ADD', amount: '100.00', effectiveDate: '2026-08-29', idempotencyKey: 'operation-1'
    };

    const result = await createGoalMovement(prisma, input);

    expect(result?.replayed).toBe(false);
    expect(movementCreate.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({ amount: new Prisma.Decimal('100.00'), balanceAfter: new Prisma.Decimal('100.00'), source: 'MANUAL' }));
    expect(transactionCreate.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({ accountId: fundingAccount.id, amount: new Prisma.Decimal('-100.00') }));
    expect(transactionCreate.mock.calls[1]?.[0].data).toEqual(expect.objectContaining({ accountId: account.id, amount: new Prisma.Decimal('100.00') }));
    expect(transactionClient.goal.update).toHaveBeenCalledWith({ where: { id: 'goal-1' }, data: { currentAmount: new Prisma.Decimal('100.00'), status: 'COMPLETED' } });
  });

  it('rejects an add when the source account cannot fund it', async () => {
    const transactionClient = {
      goalMovement: { findUnique: vi.fn(async () => null), aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })), create: vi.fn() },
      goal: { findFirst: vi.fn(async () => baseGoal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
        householdTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('-90.00') } })) }
    };
    const prisma = {
      householdAccount: { findMany: visibleAccounts },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
    } as unknown as PrismaClient;

    await expect(createGoalMovement(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: 'goal-1', accountId: fundingAccount.id, direction: 'ADD', amount: '20.00', effectiveDate: '2026-08-29', idempotencyKey: 'operation-2'
    })).rejects.toMatchObject({ code: 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT' });
  });

  it('replays the existing result for the same operation and rejects a different payload', async () => {
    const existingMovement = {
      id: 'movement-1', householdId: 'household-1', goalId: 'goal-1', amount: new Prisma.Decimal('20.00'), source: 'MANUAL', effectiveDate: new Date('2026-08-29'), note: null,
      automationRuleId: null, sourceTransactionId: null, calculationWindowStart: null, calculationWindowEnd: null, balanceAfter: new Prisma.Decimal('20.00'),
      transferGroupId: 'transfer-1', idempotencyKey: 'operation-3', createdAt: new Date('2026-08-29T10:00:00.000Z'), goal: { accountId: account.id },
      transactions: [{ accountId: fundingAccount.id, amount: new Prisma.Decimal('-20.00') }, { accountId: account.id, amount: new Prisma.Decimal('20.00') }]
    };
    const findUnique = vi.fn(async () => existingMovement);
    const prisma = {
      householdAccount: { findMany: visibleAccounts },
      $transaction: vi.fn(async (callback: (client: { goalMovement: { findUnique: typeof findUnique } }) => Promise<unknown>) => callback({ goalMovement: { findUnique } }))
    } as unknown as PrismaClient;

    const replay = await createGoalMovement(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: 'goal-1', accountId: fundingAccount.id, direction: 'ADD', amount: '20.00', effectiveDate: '2026-08-29', idempotencyKey: 'operation-3'
    });
    expect(replay?.replayed).toBe(true);
    await expect(createGoalMovement(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: 'goal-1', accountId: fundingAccount.id, direction: 'ADD', amount: '21.00', effectiveDate: '2026-08-29', idempotencyKey: 'operation-3'
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });

  it('retries a serializable conflict without changing the operation identity', async () => {
    const transactionClient = {
      goalMovement: {
        findUnique: vi.fn(async () => null),
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })),
        create: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: 'movement-retried', ...arguments_.data, createdAt: new Date('2026-08-29T10:00:00.000Z') }))
      },
      goal: { findFirst: vi.fn(async () => baseGoal), update: vi.fn(async () => baseGoal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
      householdTransaction: {
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('100.00') } })),
        create: vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: 'transaction-retried', ...arguments_.data }))
      }
    };
    let transactionAttempt = 0;
    const serializableConflict = Object.assign(new Error('serialization failure'), { code: 'P2034' });
    const prisma = {
      householdAccount: { findMany: visibleAccounts },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => {
        transactionAttempt += 1;
        if (transactionAttempt === 1) throw serializableConflict;
        return callback(transactionClient);
      })
    } as unknown as PrismaClient;

    const result = await createGoalMovement(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: 'goal-1', accountId: fundingAccount.id, direction: 'ADD', amount: '20.00', effectiveDate: '2026-08-29', idempotencyKey: 'retry-operation'
    });

    expect(result?.replayed).toBe(false);
    expect(transactionAttempt).toBe(2);
  });
});

describe('getGoalDetail()', () => {
  it('returns a stable reconciliation conflict instead of trusting a drifted currentAmount', async () => {
    const prisma = {
      householdMembership: { findUnique: vi.fn(async () => ({ householdId: 'household-1', userId: 'user-1' })) },
      householdAccount: { findMany: vi.fn(async () => [{ id: account.id }]) },
      goal: { findFirst: vi.fn(async () => ({ ...baseGoal, automationRules: [] })) },
      goalMovement: {
        findMany: vi.fn(async () => []),
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('10.00') } }))
      },
      householdTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })) }
    } as unknown as PrismaClient;

    await expect(getGoalDetail(prisma, 'household-1', 'user-1', 'goal-1')).rejects.toMatchObject({ code: 'GOAL_RECONCILIATION_CONFLICT' });
  });
});
