import { Prisma, type PrismaClient } from '@prisma/client';
import { HouseholdTransactionServiceError } from '@ksiegowy/household-service';
import type * as HouseholdService from '@ksiegowy/household-service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp, type BuildAppOptions } from '../../app.js';
import type { AccessTokenPayload, AuthConfig } from '../../lib/auth-config.js';

const mockedGoalOperations = vi.hoisted(() => ({
  getGoalsOverview: vi.fn(),
  listGoals: vi.fn(),
  getGoalDetail: vi.fn(),
  updateGoal: vi.fn(),
  listGoalMovements: vi.fn(),
  createGoalMovement: vi.fn()
}));
const mockedTransactionOperations = vi.hoisted(() => ({ updateTransaction: vi.fn(), deleteTransaction: vi.fn(), recategorizeTransaction: vi.fn() }));

vi.mock('@ksiegowy/household-service', async () => ({
  ...(await vi.importActual<typeof HouseholdService>('@ksiegowy/household-service')),
  ...mockedGoalOperations,
  ...mockedTransactionOperations
}));

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: { accessSecret: 'test-access-secret', refreshSecret: 'test-refresh-secret', accessTtl: '15m', refreshTtl: '30d' },
  cookies: { accessTokenName: 'auth_token', refreshTokenName: 'refresh_token', accessMaxAgeSeconds: 900, refreshMaxAgeSeconds: 2592000, secure: false, sameSite: 'lax', path: '/' },
  google: { enabled: false, missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'], providedEnv: [] }
};

const account = {
  id: 'account-savings', householdId: 'household-1', name: 'Savings', type: 'SAVINGS', accountNumberMask: null,
  visibility: 'SHARED', ownerUserId: null, openingBalance: new Prisma.Decimal('0.00'), creditLimit: null, statementDay: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z')
};
const rule = {
  id: 'rule-1', householdId: 'household-1', goalId: 'goal-1', ruleType: 'FIXED_ON_DAY', automationIdentity: 'series-1', fundingAccountId: 'account-current', triggerAccountId: null,
  createdByUserId: 'user-1', startsOn: new Date('2026-01-01T00:00:00.000Z'), isActive: true, fixedAmount: new Prisma.Decimal('25.00'), dayOfMonth: 15,
  percentage: null, incomeThreshold: null, roundUpToAmount: null, createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z')
};
const goal = {
  id: 'goal-1', householdId: 'household-1', accountId: account.id, name: 'Emergency fund', description: 'Reserve', kind: 'ONE_OFF', status: 'ACTIVE',
  targetAmount: new Prisma.Decimal('1000.00'), currentAmount: new Prisma.Decimal('250.00'), targetDate: new Date('2026-12-31T00:00:00.000Z'), monthlyAmount: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), account, activeRules: [rule], accountBalance: '250.00'
};
const movement = {
  id: 'movement-1', householdId: 'household-1', goalId: 'goal-1', amount: new Prisma.Decimal('250.00'), source: 'MANUAL', effectiveDate: new Date('2026-08-29T00:00:00.000Z'),
  note: null, createdByUserId: 'user-1', automationRuleId: null, sourceTransactionId: null, transferGroupId: 'transfer-1', idempotencyKey: 'operation-1',
  calculationWindowStart: null, calculationWindowEnd: null, balanceAfter: new Prisma.Decimal('250.00'), createdAt: new Date('2026-08-29T00:00:00.000Z')
};
const transaction = {
  id: 'transaction-1', householdId: 'household-1', accountId: 'account-current', categoryId: null, payee: 'Goal: Emergency fund', payerUserId: 'user-1',
  bankDescription: null, amount: new Prisma.Decimal('-250.00'), date: new Date('2026-08-29T00:00:00.000Z'), tag: null, note: null, isRecurring: false,
  commitmentId: null, goalMovementId: movement.id, categorizationSource: 'MANUAL', importBatchId: null, transferGroupId: 'transfer-1',
  createdAt: new Date('2026-08-29T00:00:00.000Z'), updatedAt: new Date('2026-08-29T00:00:00.000Z')
};
const detail = { goal, movements: [movement], totals: { added: '250.00', withdrawn: '0.00' } };
const overview = {
  goals: [{ goal, monthlyDemand: '25.00', allocation: '25.00', shortfall: '0.00', forecastDate: '2026-11-15', forecastBasis: 'FIXED_RULES_ONLY', hasVariableRules: false }],
  averageMonthlySurplus: '100.00', availableForGoals: '100.00', scheduledMonthlyDemand: '25.00', fixedAutomationMonthlyDemand: '25.00', forecastBasis: 'FIXED_RULES_ONLY', hasVariableRules: false,
  lookbackMonths: ['2026-06', '2026-07', '2026-08']
};

const householdDatabase = {
  householdMembership: {
    findUnique: vi.fn(async () => ({ householdId: 'household-1', userId: 'user-1' })),
    updateMany: vi.fn(async () => ({ count: 1 }))
  },
  $disconnect: vi.fn(async () => undefined)
} as unknown as NonNullable<BuildAppOptions['householdDatabaseClient']>;

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

describe('goals routes response contracts', () => {
  beforeEach(() => {
    mockedGoalOperations.getGoalsOverview.mockResolvedValue(overview);
    mockedGoalOperations.listGoals.mockResolvedValue([goal]);
    mockedGoalOperations.getGoalDetail.mockResolvedValue(detail);
    mockedGoalOperations.updateGoal.mockResolvedValue(goal);
    mockedGoalOperations.listGoalMovements.mockResolvedValue({ data: [movement], nextCursor: 'next-cursor' });
    mockedGoalOperations.createGoalMovement.mockResolvedValue({ movement, sourceTransaction: transaction, goalTransaction: { ...transaction, id: 'transaction-2', accountId: account.id, amount: new Prisma.Decimal('250.00') }, replayed: false });
  });

  it('serializes non-empty overview, detail, update, movements, and transfer payloads', async () => {
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'test@example.com', name: 'Test User', companies: [] });
    const request = { headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } };

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/households/household-1/goals/overview', ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/goals/goal-1', ...request }),
      app.inject({ method: 'PATCH', url: '/households/household-1/goals/goal-1', payload: { name: 'Updated fund' }, ...request }),
      app.inject({ method: 'GET', url: '/households/household-1/goals/goal-1/movements?limit=50', ...request }),
      app.inject({ method: 'POST', url: '/households/household-1/goals/goal-1/transfers', payload: { accountId: 'account-current', direction: 'ADD', amount: '250.00', effectiveDate: '2026-08-29', operationId: 'operation-1' }, ...request })
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 201]);
    expect(responses[0]!.json().goals).toHaveLength(1);
    expect(responses[1]!.json().goal.activeRules).toHaveLength(1);
    expect(responses[2]!.json().goal.name).toBe('Emergency fund');
    expect(responses[3]!.json().data).toHaveLength(1);
    expect(responses[4]!.json().sourceTransaction.amount).toBe('-250');
    expect(responses[4]!.json().goalTransaction.goalMovementId).toBe('movement-1');

    await app.close();
  });

  it('maps all goal-linked ledger mutation attempts to the stable conflict code', async () => {
    const immutableError = new HouseholdTransactionServiceError('TRANSACTION_IMMUTABLE', 'Goal movement ledger entries are immutable');
    mockedTransactionOperations.updateTransaction.mockRejectedValue(immutableError);
    mockedTransactionOperations.deleteTransaction.mockRejectedValue(immutableError);
    mockedTransactionOperations.recategorizeTransaction.mockRejectedValue(immutableError);
    const app = await buildApp({ logger: false, prismaClient: {} as PrismaClient, householdDatabaseClient: householdDatabase, authConfig });
    const authToken = signAccessToken(app, { sub: 'user-1', email: 'test@example.com', name: 'Test User', companies: [] });
    const request = { headers: { origin: 'http://localhost:3000' }, cookies: { auth_token: authToken } };

    const responses = await Promise.all([
      app.inject({ method: 'PATCH', url: '/households/household-1/transactions/transaction-1', payload: { note: 'change' }, ...request }),
      app.inject({ method: 'DELETE', url: '/households/household-1/transactions/transaction-1', ...request }),
      app.inject({ method: 'PATCH', url: '/households/household-1/transactions/transaction-1/recategorize', payload: { categoryId: 'category-1' }, ...request })
    ]);

    expect(responses.map((response) => ({ statusCode: response.statusCode, code: response.json().code }))).toEqual([
      { statusCode: 409, code: 'TRANSACTION_IMMUTABLE' },
      { statusCode: 409, code: 'TRANSACTION_IMMUTABLE' },
      { statusCode: 409, code: 'TRANSACTION_IMMUTABLE' }
    ]);

    await app.close();
  });
});
