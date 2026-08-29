import { Prisma, type PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';
import { createGoalAutomationRule, runGoalAutomations } from './goal-automation.service.js';

const goalAccount = {
  id: 'goal-account', householdId: 'household-1', name: 'Savings', type: 'SAVINGS', accountNumberMask: null, visibility: 'SHARED', ownerUserId: null,
  openingBalance: new Prisma.Decimal('0.00'), creditLimit: null, statementDay: null, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01')
};
const fundingAccount = { ...goalAccount, id: 'funding-account', name: 'Current', type: 'CURRENT', openingBalance: new Prisma.Decimal('500.00') };
const triggerAccount = { ...goalAccount, id: 'trigger-account', name: 'Income', type: 'CURRENT' };
const goal = {
  id: 'goal-1', householdId: 'household-1', accountId: goalAccount.id, name: 'Emergency fund', description: null, kind: 'ONE_OFF', status: 'ACTIVE',
  targetAmount: new Prisma.Decimal('10000.00'), currentAmount: new Prisma.Decimal('0.00'), targetDate: new Date('2026-12-31'), monthlyAmount: null,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), account: goalAccount
};

describe('createGoalAutomationRule()', () => {
  it('stores fixed rule configuration with no trigger account', async () => {
    const create = vi.fn(async (arguments_: unknown) => arguments_);
    const prisma = {
      householdAccount: {
        findMany: vi.fn(async () => [fundingAccount]),
        findFirst: vi.fn(async () => fundingAccount)
      },
      householdMembership: { findUnique: vi.fn(async () => ({ householdId: 'household-1', userId: 'user-1' })) },
      goal: { findFirst: vi.fn(async () => goal) },
      goalAutomationRule: { findFirst: vi.fn(async () => null), create }
    } as unknown as PrismaClient;

    await createGoalAutomationRule(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: goal.id, ruleType: 'FIXED_ON_DAY', fundingAccountId: fundingAccount.id, startsOn: '2026-08-01', fixedAmount: '25.00', dayOfMonth: 15
    });

    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ ruleType: 'FIXED_ON_DAY', fixedAmount: new Prisma.Decimal('25.00'), dayOfMonth: 15, triggerAccountId: null, percentage: null, incomeThreshold: null, roundUpToAmount: null }) });
  });

  it('maps a database duplicate configuration error to a stable conflict', async () => {
    const duplicateError = Object.assign(new Error('duplicate'), { code: 'P2002' });
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [fundingAccount]), findFirst: vi.fn(async () => fundingAccount) },
      householdMembership: { findUnique: vi.fn(async () => ({ householdId: 'household-1', userId: 'user-1' })) },
      goal: { findFirst: vi.fn(async () => goal) },
      goalAutomationRule: { findFirst: vi.fn(async () => null), create: vi.fn(async () => Promise.reject(duplicateError)) }
    } as unknown as PrismaClient;

    await expect(createGoalAutomationRule(prisma, {
      householdId: 'household-1', userId: 'user-1', goalId: goal.id, ruleType: 'FIXED_ON_DAY', fundingAccountId: fundingAccount.id, startsOn: '2026-08-01', fixedAmount: '25.00', dayOfMonth: 15
    })).rejects.toMatchObject({ code: 'GOAL_RULE_CONFLICT' });
  });
});

describe('runGoalAutomations()', () => {
  it('calculates percentage automation from completed non-transfer income months', async () => {
    const changedTriggerAccount = { ...triggerAccount, id: 'trigger-account-changed', name: 'Changed income' };
    const rule = {
      id: 'rule-1', householdId: 'household-1', goalId: goal.id, ruleType: 'PERCENT_OF_INCOME_OVER_THRESHOLD', automationIdentity: 'series-percent', fundingAccountId: fundingAccount.id, triggerAccountId: triggerAccount.id,
      createdByUserId: 'user-1', startsOn: new Date('2026-06-01'), isActive: true, fixedAmount: null, dayOfMonth: null, percentage: new Prisma.Decimal('10.00'), incomeThreshold: new Prisma.Decimal('100.00'), roundUpToAmount: null,
      createdAt: new Date('2026-06-01'), updatedAt: new Date('2026-06-01'), goal: { ...goal, account: goalAccount }, fundingAccount, triggerAccount
    };
    const changedRule = { ...rule, id: 'rule-changed', triggerAccountId: changedTriggerAccount.id, triggerAccount: changedTriggerAccount, updatedAt: new Date('2026-08-20') };
    const existingMovement = {
      id: 'movement-1', householdId: 'household-1', goalId: goal.id, amount: new Prisma.Decimal('90.00'), source: 'AUTOMATION', effectiveDate: new Date('2026-06-30'), note: null,
      createdByUserId: 'user-1', automationRuleId: rule.id, sourceTransactionId: null, transferGroupId: 'transfer-1', idempotencyKey: 'event-key', calculationWindowStart: new Date('2026-06-01'), calculationWindowEnd: new Date('2026-06-30'),
      balanceAfter: new Prisma.Decimal('90.00'), createdAt: new Date('2026-06-30T10:00:00.000Z'), goal: { accountId: goal.accountId },
      transactions: [{ accountId: fundingAccount.id, amount: new Prisma.Decimal('-90.00') }, { accountId: goal.accountId, amount: new Prisma.Decimal('90.00') }]
    };
    const movementCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: 'movement-1', ...arguments_.data, createdAt: new Date('2026-08-29T10:00:00.000Z') }));
    const transactionCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: 'transaction-1', ...arguments_.data, categoryId: null, payerUserId: null, bankDescription: null, tag: null, isRecurring: false, commitmentId: null, goalMovementId: 'movement-1', categorizationSource: 'MANUAL', importBatchId: null, createdAt: new Date(), updatedAt: new Date() }));
    const movementFindUnique = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(existingMovement);
    const transactionClient = {
      goalMovement: { findUnique: movementFindUnique, aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })), create: movementCreate },
      goal: { findFirst: vi.fn(async () => goal), update: vi.fn(async () => goal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
      householdTransaction: {
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('500.00') } })),
        create: transactionCreate
      }
    };
    const prisma = {
      goalAutomationRule: { findMany: vi.fn().mockResolvedValueOnce([rule]).mockResolvedValueOnce([changedRule]) },
      householdMembership: { findMany: vi.fn(async () => [{ householdId: 'household-1', userId: 'user-1' }]) },
      householdAccount: { findMany: vi.fn(async () => [goalAccount, fundingAccount, triggerAccount, changedTriggerAccount]) },
      householdTransaction: {
        aggregate: vi.fn()
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('1000.00') } })
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('0.00') } })
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('1500.00') } })
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('0.00') } })
      },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
    } as unknown as PrismaClient;

    const result = await runGoalAutomations(prisma, new Date('2026-08-29T12:00:00.000Z'));
    const changedResult = await runGoalAutomations(prisma, new Date('2026-08-29T12:00:00.000Z'));

    expect(result.createdMovementCount).toBe(1);
    expect(changedResult.skippedMovementCount).toBe(1);
    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(movementCreate.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({ amount: new Prisma.Decimal('90.00'), source: 'AUTOMATION', automationRuleId: rule.id, calculationWindowStart: new Date('2026-06-01T00:00:00.000Z'), calculationWindowEnd: new Date('2026-06-30T00:00:00.000Z') }));
  });

  it('does not replay a historical fixed event after its rule is recreated', async () => {
    const recreatedFundingAccount = { ...fundingAccount, id: 'funding-account-recreated', name: 'Recreated current' };
    const firstRule = {
      id: 'rule-deleted', householdId: 'household-1', goalId: goal.id, ruleType: 'FIXED_ON_DAY', automationIdentity: 'series-fixed', fundingAccountId: fundingAccount.id, triggerAccountId: null,
      createdByUserId: 'user-1', startsOn: new Date('2026-08-01'), isActive: true, fixedAmount: new Prisma.Decimal('25.00'), dayOfMonth: 15,
      percentage: null, incomeThreshold: null, roundUpToAmount: null, createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-01'), goal: { ...goal, account: goalAccount }, fundingAccount, triggerAccount: null
    };
    const recreatedRule = { ...firstRule, id: 'rule-recreated', fundingAccountId: recreatedFundingAccount.id, fundingAccount: recreatedFundingAccount, createdAt: new Date('2026-08-20'), updatedAt: new Date('2026-08-20') };
    const createdMovement = {
      id: 'movement-1', householdId: 'household-1', goalId: goal.id, amount: new Prisma.Decimal('25.00'), source: 'AUTOMATION', effectiveDate: new Date('2026-08-15'), note: null,
      createdByUserId: 'user-1', automationRuleId: null, sourceTransactionId: null, transferGroupId: 'transfer-1', idempotencyKey: 'stable', calculationWindowStart: null, calculationWindowEnd: null,
      balanceAfter: new Prisma.Decimal('25.00'), createdAt: new Date('2026-08-15T10:00:00.000Z'), goal: { accountId: goal.accountId },
      transactions: [{ accountId: fundingAccount.id, amount: new Prisma.Decimal('-25.00') }, { accountId: goal.accountId, amount: new Prisma.Decimal('25.00') }]
    };
    const movementFindUnique = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdMovement);
    const movementCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ ...createdMovement, ...arguments_.data }));
    const transactionCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: 'transaction-1', ...arguments_.data }));
    const transactionClient = {
      goalMovement: { findUnique: movementFindUnique, aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })), create: movementCreate },
      goal: { findFirst: vi.fn(async () => goal), update: vi.fn(async () => goal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
      householdTransaction: { aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('500.00') } })), create: transactionCreate }
    };
    const ruleFindMany = vi.fn().mockResolvedValueOnce([firstRule]).mockResolvedValueOnce([recreatedRule]);
    const prisma = {
      goalAutomationRule: { findMany: ruleFindMany },
      householdMembership: { findMany: vi.fn(async () => [{ householdId: 'household-1', userId: 'user-1' }]) },
      householdAccount: { findMany: vi.fn(async () => [goalAccount, fundingAccount, recreatedFundingAccount]) },
      householdTransaction: { findMany: vi.fn(async () => []) },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
    } as unknown as PrismaClient;

    await runGoalAutomations(prisma, new Date('2026-08-29T12:00:00.000Z'));
    await runGoalAutomations(prisma, new Date('2026-08-29T12:00:00.000Z'));

    expect(movementCreate).toHaveBeenCalledTimes(1);
    expect(movementFindUnique.mock.calls[0]?.[0].where.idempotencyKey).toBe(movementFindUnique.mock.calls[1]?.[0].where.idempotencyKey);
  });

  it('advances a per-rule round-up cursor across pages instead of dropping older source transactions', async () => {
    const sourceTransactions = Array.from({ length: 501 }, (_, index) => ({
      id: `expense-${index + 1}`,
      accountId: triggerAccount.id,
      amount: new Prisma.Decimal('-1.01'),
      date: new Date(Date.UTC(2026, 0, index + 1))
    }));
    const rule = {
      id: 'round-up-rule', householdId: 'household-1', goalId: goal.id, ruleType: 'ROUND_UP', automationIdentity: 'series-round-up', fundingAccountId: fundingAccount.id, triggerAccountId: triggerAccount.id,
      createdByUserId: 'user-1', startsOn: new Date('2026-01-01'), isActive: true, fixedAmount: null, dayOfMonth: null, percentage: null, incomeThreshold: null, roundUpToAmount: new Prisma.Decimal('1.00'),
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'), deletedAt: null, roundUpCursorDate: null, roundUpCursorId: null, goal: { ...goal, account: goalAccount }, fundingAccount, triggerAccount
    };
    const nextRule = { ...rule, roundUpCursorDate: sourceTransactions[499]!.date, roundUpCursorId: sourceTransactions[499]!.id };
    const movementCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: `movement-${movementCreate.mock.calls.length + 1}`, ...arguments_.data, createdAt: new Date('2026-08-29T10:00:00.000Z') }));
    const transactionCreate = vi.fn(async (arguments_: { data: Record<string, unknown> }) => ({ id: `transaction-${transactionCreate.mock.calls.length + 1}`, ...arguments_.data }));
    const transactionClient = {
      goalMovement: { findUnique: vi.fn(async () => null), aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('0.00') } })), create: movementCreate },
      goal: { findFirst: vi.fn(async () => goal), update: vi.fn(async () => goal) },
      householdAccount: { findFirst: vi.fn(async () => fundingAccount) },
      householdTransaction: {
        aggregate: vi.fn(async () => ({ _sum: { amount: new Prisma.Decimal('500.00') } })),
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => sourceTransactions.find((transaction) => transaction.id === where.id)),
        create: transactionCreate
      }
    };
    const sourceFindMany = vi.fn().mockResolvedValueOnce(sourceTransactions).mockResolvedValueOnce([sourceTransactions[500]!]);
    const ruleFindMany = vi.fn().mockResolvedValueOnce([rule]).mockResolvedValueOnce([nextRule]);
    const prisma = {
      goalAutomationRule: { findMany: ruleFindMany, update: vi.fn(async () => nextRule) },
      householdMembership: { findMany: vi.fn(async () => [{ householdId: 'household-1', userId: 'user-1' }]) },
      householdAccount: { findMany: vi.fn(async () => [goalAccount, fundingAccount, triggerAccount]) },
      householdTransaction: { findMany: sourceFindMany },
      $transaction: vi.fn(async (callback: (client: typeof transactionClient) => Promise<unknown>) => callback(transactionClient))
    } as unknown as PrismaClient;

    const firstResult = await runGoalAutomations(prisma, new Date('2027-06-30T12:00:00.000Z'));
    const secondResult = await runGoalAutomations(prisma, new Date('2027-06-30T12:00:00.000Z'));

    expect(firstResult.createdMovementCount).toBe(500);
    expect(secondResult.createdMovementCount).toBe(1);
    expect(movementCreate).toHaveBeenCalledTimes(501);
    expect(sourceFindMany.mock.calls[0]?.[0].take).toBe(501);
    expect(sourceFindMany.mock.calls[1]?.[0].where.OR).toEqual([
      { date: { gt: sourceTransactions[499]!.date } },
      { date: sourceTransactions[499]!.date, id: { gt: sourceTransactions[499]!.id } }
    ]);
  });
});
