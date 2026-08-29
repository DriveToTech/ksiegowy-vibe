import crypto from 'node:crypto';
import { Prisma, type Goal, type GoalAutomationRule, type GoalMovement, type HouseholdAccount, type HouseholdTransaction, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';
import { findHouseholdMembership } from './household.service.js';

export type GoalErrorCode =
  | 'GOAL_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'GOAL_INVALID_STATE'
  | 'GOAL_TARGET_EXCEEDED'
  | 'GOAL_BALANCE_INSUFFICIENT'
  | 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT'
  | 'GOAL_RULE_CONFLICT'
  | 'GOAL_RECONCILIATION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'VALIDATION_ERROR';

export class GoalServiceError extends Error {
  public readonly code: GoalErrorCode;

  public constructor(code: GoalErrorCode, message: string) {
    super(message);
    this.name = 'GoalServiceError';
    this.code = code;
  }
}

export interface CreateGoalInput {
  householdId: string;
  userId: string;
  accountId: string;
  name: string;
  description?: string;
  kind: 'ONE_OFF' | 'ONGOING' | 'NO_CEILING';
  targetAmount?: string;
  targetDate?: string;
  monthlyAmount?: string;
}

export interface UpdateGoalInput {
  userId: string;
  accountId?: string;
  name?: string;
  description?: string | null;
  kind?: 'ONE_OFF' | 'ONGOING' | 'NO_CEILING';
  targetAmount?: string | null;
  targetDate?: string | null;
  monthlyAmount?: string | null;
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';
}

export interface GoalWithAccount extends Goal {
  account: HouseholdAccount;
  activeRules: GoalAutomationRule[];
  accountBalance: string;
}

export interface GoalMovementResult {
  movement: GoalMovement;
  sourceTransaction: HouseholdTransaction;
  goalTransaction: HouseholdTransaction;
  replayed: boolean;
}

export interface GoalDetail {
  goal: GoalWithAccount;
  movements: GoalMovement[];
  totals: { added: string; withdrawn: string };
}

const zero = (): Prisma.Decimal => new Prisma.Decimal(0);
const MAX_GOAL_NAME_LENGTH = 160;
const MAX_GOAL_DESCRIPTION_LENGTH = 2_000;
const MAX_MOVEMENT_NOTE_LENGTH = 500;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const MAX_MONEY_INPUT_LENGTH = 64;
const MAX_SERIALIZABLE_RETRIES = 3;

const assertTextLength = (value: string | null | undefined, fieldName: string, maximumLength: number): void => {
  if (value !== undefined && value !== null && value.length > maximumLength) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be at most ${maximumLength} characters`);
  }
};

const parseMoney = (value: string, fieldName: string): Prisma.Decimal => {
  const normalizedValue = value.trim();
  if (normalizedValue.length > MAX_MONEY_INPUT_LENGTH) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} is too long`);
  }
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalizedValue)) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be a decimal amount with at most two decimal places`);
  }

  const parsed = new Prisma.Decimal(normalizedValue);
  if (!parsed.isFinite()) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be finite`);
  }

  return parsed;
};

const parseOptionalMoney = (value: string | null | undefined, fieldName: string): Prisma.Decimal | null => {
  if (value === undefined || value === null) return null;
  return parseMoney(value, fieldName);
};

const requirePositiveMoney = (value: string | null | undefined, fieldName: string): Prisma.Decimal => {
  const parsed = parseOptionalMoney(value, fieldName);
  if (parsed === null || parsed.lte(0)) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be greater than zero`);
  }
  return parsed;
};

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
};

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

const isPrismaErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === code;

const runSerializableTransaction = async <Result>(
  prisma: PrismaClient,
  operation: (transactionClient: Prisma.TransactionClient) => Promise<Result>
): Promise<Result> => {
  for (let retry = 0; retry <= MAX_SERIALIZABLE_RETRIES; retry += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      if (!isPrismaErrorCode(error, 'P2034') || retry === MAX_SERIALIZABLE_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, (retry + 1) * 10));
    }
  }

  throw new Error('Serializable transaction retry limit reached');
};

const ensureAllowedAccount = (account: HouseholdAccount | null, code: 'ACCOUNT_NOT_FOUND' | 'VALIDATION_ERROR' = 'ACCOUNT_NOT_FOUND'): HouseholdAccount => {
  if (!account) {
    throw new GoalServiceError(code, 'Account was not found or is not visible');
  }
  if (account.type === 'CREDIT_CARD') {
    throw new GoalServiceError('VALIDATION_ERROR', 'Credit card accounts cannot fund or hold goals');
  }
  return account;
};

const validateGoalShape = (
  kind: CreateGoalInput['kind'],
  targetAmount: Prisma.Decimal | null,
  targetDate: Date | null,
  monthlyAmount: Prisma.Decimal | null,
  currentAmount = zero()
): void => {
  if (currentAmount.lt(0)) {
    throw new GoalServiceError('VALIDATION_ERROR', 'currentAmount cannot be negative');
  }

  if (targetAmount !== null && currentAmount.gt(targetAmount)) {
    throw new GoalServiceError('GOAL_TARGET_EXCEEDED', 'Current amount cannot exceed the goal target');
  }

  if (kind === 'ONE_OFF') {
    if (targetAmount === null || targetAmount.lte(0) || (targetDate === null && (monthlyAmount === null || monthlyAmount.lte(0))) || (targetDate !== null && monthlyAmount !== null)) {
      throw new GoalServiceError('VALIDATION_ERROR', 'ONE_OFF goals require a positive targetAmount and exactly one of targetDate or monthlyAmount');
    }
    return;
  }

  if (kind === 'ONGOING') {
    if (targetAmount === null || targetAmount.lte(0) || targetDate !== null || monthlyAmount === null || monthlyAmount.lte(0)) {
      throw new GoalServiceError('VALIDATION_ERROR', 'ONGOING goals require positive targetAmount and monthlyAmount and no targetDate');
    }
    return;
  }

  if (targetAmount !== null || targetDate !== null || monthlyAmount === null || monthlyAmount.lte(0)) {
    throw new GoalServiceError('VALIDATION_ERROR', 'NO_CEILING goals require positive monthlyAmount and no targetAmount or targetDate');
  }
};

const getAccountBalance = async (prisma: PrismaClient | Prisma.TransactionClient, householdId: string, account: HouseholdAccount): Promise<Prisma.Decimal> => {
  const result = await prisma.householdTransaction.aggregate({
    where: { householdId, accountId: account.id },
    _sum: { amount: true }
  });
  return account.openingBalance.add(result._sum.amount ?? zero());
};

const assertGoalReconciled = (currentAmount: Prisma.Decimal, movementSum: Prisma.Decimal): void => {
  if (!currentAmount.eq(movementSum)) {
    throw new GoalServiceError('GOAL_RECONCILIATION_CONFLICT', 'Goal balance does not match its movement history');
  }
};

const filterRulesForCurrentMember = async (prisma: PrismaClient, householdId: string, userId: string, accountIds: string[], rules: GoalAutomationRule[]): Promise<GoalAutomationRule[]> => {
  if (rules.length === 0) return [];
  const creatorIds = [...new Set(rules.map((rule) => rule.createdByUserId))];
  const memberships = await prisma.householdMembership.findMany({ where: { householdId, userId: { in: creatorIds } }, select: { userId: true } });
  const memberIds = new Set(memberships.map((membership) => membership.userId));
  return rules.filter((rule) => memberIds.has(rule.createdByUserId) && accountIds.includes(rule.fundingAccountId) && (rule.triggerAccountId === null || accountIds.includes(rule.triggerAccountId)));
};

export const createGoal = async (prisma: PrismaClient, input: CreateGoalInput): Promise<Goal> => {
  if (input.name.trim().length === 0) throw new GoalServiceError('VALIDATION_ERROR', 'name is required');
  assertTextLength(input.name.trim(), 'name', MAX_GOAL_NAME_LENGTH);
  assertTextLength(input.description, 'description', MAX_GOAL_DESCRIPTION_LENGTH);
  const accountIds = await visibleAccountIds(prisma, input.householdId, input.userId);
  const account = accountIds.includes(input.accountId)
    ? await prisma.householdAccount.findFirst({ where: { householdId: input.householdId, id: input.accountId } })
    : null;
  ensureAllowedAccount(account);

  const targetAmount = parseOptionalMoney(input.targetAmount, 'targetAmount');
  const targetDate = input.targetDate === undefined ? null : parseDate(input.targetDate, 'targetDate');
  const monthlyAmount = parseOptionalMoney(input.monthlyAmount, 'monthlyAmount');
  validateGoalShape(input.kind, targetAmount, targetDate, monthlyAmount);

  return prisma.goal.create({
    data: {
      householdId: input.householdId,
      accountId: input.accountId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      kind: input.kind,
      targetAmount,
      currentAmount: zero(),
      targetDate,
      monthlyAmount
    }
  });
};

export const listGoalsForVisibleAccountIds = async (prisma: PrismaClient, householdId: string, userId: string, accountIds: string[]): Promise<GoalWithAccount[]> => {
  if (accountIds.length === 0) return [];

  const goals = await prisma.goal.findMany({
    where: { householdId, accountId: { in: accountIds } },
    include: {
      account: true,
      automationRules: {
        where: { deletedAt: null, isActive: true, fundingAccountId: { in: accountIds }, OR: [{ triggerAccountId: null }, { triggerAccountId: { in: accountIds } }] },
        orderBy: { createdAt: 'asc' }
      }
    },
    orderBy: { createdAt: 'asc' }
  });
  if (goals.length === 0) return [];

  const balances = await prisma.householdTransaction.groupBy({
    by: ['accountId'],
    where: { householdId, accountId: { in: [...new Set(goals.map((goal) => goal.accountId))] } },
    _sum: { amount: true }
  });
  const movementSums = await prisma.goalMovement.groupBy({
    by: ['goalId'],
    where: { householdId, goalId: { in: goals.map((goal) => goal.id) } },
    _sum: { amount: true }
  });
  const movementSumByGoalId = new Map(movementSums.map((movementSum) => [movementSum.goalId, movementSum._sum.amount ?? zero()]));
  for (const goal of goals) assertGoalReconciled(goal.currentAmount, movementSumByGoalId.get(goal.id) ?? zero());
  const balanceByAccountId = new Map(balances.map((balance) => [balance.accountId, balance._sum.amount ?? zero()]));

  return Promise.all(goals.map(async (goal) => ({
    ...goal,
    activeRules: await filterRulesForCurrentMember(prisma, householdId, userId, accountIds, goal.automationRules),
    accountBalance: goal.account.openingBalance.add(balanceByAccountId.get(goal.accountId) ?? zero()).toFixed(2)
  })));
};

export const listGoals = async (prisma: PrismaClient, householdId: string, userId: string): Promise<GoalWithAccount[]> => {
  return listGoalsForVisibleAccountIds(prisma, householdId, userId, await visibleAccountIds(prisma, householdId, userId));
};

export const getGoalDetail = async (prisma: PrismaClient, householdId: string, userId: string, goalId: string): Promise<GoalDetail | null> => {
  if (!(await findHouseholdMembership(prisma, householdId, userId))) return null;
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  if (accountIds.length === 0) return null;

  const goal = await prisma.goal.findFirst({
    where: { id: goalId, householdId, accountId: { in: accountIds } },
    include: {
      account: true,
      automationRules: {
        where: { deletedAt: null, fundingAccountId: { in: accountIds }, OR: [{ triggerAccountId: null }, { triggerAccountId: { in: accountIds } }] },
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  if (!goal) return null;

  const [movements, accountBalance, movementSum, added, withdrawn] = await Promise.all([
    prisma.goalMovement.findMany({ where: { householdId, goalId }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], take: 101 }),
    getAccountBalance(prisma, householdId, goal.account),
    prisma.goalMovement.aggregate({ where: { householdId, goalId }, _sum: { amount: true } }),
    prisma.goalMovement.aggregate({ where: { householdId, goalId, amount: { gte: 0 } }, _sum: { amount: true } }),
    prisma.goalMovement.aggregate({ where: { householdId, goalId, amount: { lt: 0 } }, _sum: { amount: true } })
  ]);
  assertGoalReconciled(goal.currentAmount, movementSum._sum.amount ?? zero());

  return {
    goal: { ...goal, activeRules: (await filterRulesForCurrentMember(prisma, householdId, userId, accountIds, goal.automationRules)).filter((rule) => rule.isActive), accountBalance: accountBalance.toFixed(2) },
    movements: movements.slice(0, 100),
    totals: { added: (added._sum.amount ?? zero()).toFixed(2), withdrawn: (withdrawn._sum.amount ?? zero()).abs().toFixed(2) }
  };
};

export const updateGoal = async (prisma: PrismaClient, householdId: string, goalId: string, input: UpdateGoalInput): Promise<Goal> => {
  if (input.name !== undefined && input.name.trim().length === 0) throw new GoalServiceError('VALIDATION_ERROR', 'name is required');
  assertTextLength(input.name?.trim(), 'name', MAX_GOAL_NAME_LENGTH);
  assertTextLength(input.description, 'description', MAX_GOAL_DESCRIPTION_LENGTH);
  const accountIds = await visibleAccountIds(prisma, householdId, input.userId);
  if (accountIds.length === 0) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');

  const goal = await prisma.goal.findFirst({ where: { id: goalId, householdId, accountId: { in: accountIds } } });
  if (!goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  const movementSum = await prisma.goalMovement.aggregate({ where: { householdId, goalId }, _sum: { amount: true } });
  assertGoalReconciled(goal.currentAmount, movementSum._sum.amount ?? zero());
  if (goal.status === 'ARCHIVED') {
    throw new GoalServiceError('GOAL_INVALID_STATE', 'Archived goals are read-only');
  }

  const hasImmutableChange = input.accountId !== undefined && input.accountId !== goal.accountId || input.kind !== undefined && input.kind !== goal.kind;
  if (hasImmutableChange) {
    const movementCount = await prisma.goalMovement.count({ where: { householdId, goalId } });
    if (movementCount > 0) throw new GoalServiceError('GOAL_INVALID_STATE', 'Account and kind cannot change after the first movement');
  }

  let accountId = goal.accountId;
  if (input.accountId !== undefined) {
    const account = accountIds.includes(input.accountId)
      ? await prisma.householdAccount.findFirst({ where: { householdId, id: input.accountId } })
      : null;
    ensureAllowedAccount(account);
    accountId = input.accountId;
  }

  const kind = input.kind ?? goal.kind;
  const targetAmount = 'targetAmount' in input ? parseOptionalMoney(input.targetAmount, 'targetAmount') : goal.targetAmount;
  const targetDate = 'targetDate' in input ? input.targetDate === null ? null : parseDate(input.targetDate!, 'targetDate') : goal.targetDate;
  const monthlyAmount = 'monthlyAmount' in input ? parseOptionalMoney(input.monthlyAmount, 'monthlyAmount') : goal.monthlyAmount;
  validateGoalShape(kind, targetAmount, targetDate, monthlyAmount, goal.currentAmount);

  const nextStatus = input.status ?? goal.status;
  if (goal.status === 'COMPLETED' && nextStatus !== 'COMPLETED') {
    throw new GoalServiceError('GOAL_INVALID_STATE', 'A completed goal can be reactivated only by a withdrawal');
  }
  if (nextStatus === 'ARCHIVED' && !goal.currentAmount.eq(0)) {
    throw new GoalServiceError('GOAL_INVALID_STATE', 'A goal can be archived only with zero current amount');
  }
  if (nextStatus === 'COMPLETED' && (kind !== 'ONE_OFF' || targetAmount === null || !goal.currentAmount.eq(targetAmount))) {
    throw new GoalServiceError('GOAL_INVALID_STATE', 'Only a fully funded ONE_OFF goal can be completed');
  }

  const data: Prisma.GoalUpdateInput = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.description !== undefined ? { description: input.description?.trim() ?? null } : {}),
    ...(input.accountId !== undefined ? { account: { connect: { id: accountId } } } : {}),
    ...(input.kind !== undefined ? { kind } : {}),
    ...(input.targetAmount !== undefined ? { targetAmount } : {}),
    ...(input.targetDate !== undefined ? { targetDate } : {}),
    ...(input.monthlyAmount !== undefined ? { monthlyAmount } : {}),
    ...(input.status !== undefined ? { status: nextStatus } : {})
  };

  return prisma.goal.update({ where: { id: goalId }, data });
};

export const setGoalStatus = async (prisma: PrismaClient, householdId: string, goalId: string, userId: string, status: UpdateGoalInput['status']): Promise<Goal> => {
  if (status === undefined) throw new GoalServiceError('VALIDATION_ERROR', 'status is required');
  return updateGoal(prisma, householdId, goalId, { userId, status });
};

const compareExistingMovement = (
  existing: GoalMovement & { transactions: HouseholdTransaction[]; goal: Pick<Goal, 'accountId'> },
  input: CreateGoalMovementInput,
  signedAmount: Prisma.Decimal
): boolean => {
  const sourceTransaction = (input.source ?? 'MANUAL') === 'MANUAL'
    ? existing.transactions.find((transaction) => transaction.accountId === input.accountId)
    : existing.transactions.find((transaction) => transaction.accountId !== existing.goal.accountId);
  const requestedAmountMatches = (input.source ?? 'MANUAL') === 'MANUAL'
    ? existing.amount.eq(signedAmount)
    : existing.amount.mul(signedAmount).gt(0) && existing.amount.abs().lte(signedAmount.abs());
  const existingSourceAmount = existing.amount.negated();
  return existing.householdId === input.householdId
    && existing.goalId === input.goalId
    && requestedAmountMatches
    && existing.source === (input.source ?? 'MANUAL')
    && dateKey(existing.effectiveDate) === input.effectiveDate
    && existing.note === (input.note?.trim() ?? null)
    && ((input.source ?? 'MANUAL') === 'MANUAL' ? existing.automationRuleId === null : true)
    && existing.sourceTransactionId === (input.sourceTransactionId ?? null)
    && dateKey(existing.calculationWindowStart ?? new Date(0)) === (input.calculationWindowStart ?? dateKey(new Date(0)))
    && dateKey(existing.calculationWindowEnd ?? new Date(0)) === (input.calculationWindowEnd ?? dateKey(new Date(0)))
    && sourceTransaction !== undefined
    && sourceTransaction.amount.eq(existingSourceAmount);
};

export interface CreateGoalMovementInput {
  householdId: string;
  userId: string;
  goalId: string;
  accountId: string;
  direction: 'ADD' | 'WITHDRAW';
  amount: string;
  effectiveDate: string;
  idempotencyKey: string;
  source?: 'MANUAL' | 'AUTOMATION' | 'ROUND_UP';
  note?: string;
  createdByUserId?: string;
  automationRuleId?: string;
  sourceTransactionId?: string;
  sourceTransactionAccountId?: string;
  calculationWindowStart?: string;
  calculationWindowEnd?: string;
}

export const createGoalMovement = async (prisma: PrismaClient, input: CreateGoalMovementInput): Promise<GoalMovementResult | null> => {
  const accountIds = await visibleAccountIds(prisma, input.householdId, input.userId);
  if (accountIds.length === 0) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  if (!accountIds.includes(input.accountId)) throw new GoalServiceError('ACCOUNT_NOT_FOUND', 'Account was not found or is not visible');
  const requestedAmount = requirePositiveMoney(input.amount, 'amount');
  const signedAmount = input.direction === 'ADD' ? requestedAmount : requestedAmount.negated();
  const source = input.source ?? 'MANUAL';
  const effectiveDate = parseDate(input.effectiveDate, 'effectiveDate');
  const calculationWindowStart = input.calculationWindowStart === undefined ? null : parseDate(input.calculationWindowStart, 'calculationWindowStart');
  const calculationWindowEnd = input.calculationWindowEnd === undefined ? null : parseDate(input.calculationWindowEnd, 'calculationWindowEnd');
  const idempotencyKey = input.idempotencyKey.trim();
  if (idempotencyKey.length === 0) throw new GoalServiceError('VALIDATION_ERROR', 'idempotencyKey is required');
  assertTextLength(idempotencyKey, 'idempotencyKey', MAX_IDEMPOTENCY_KEY_LENGTH);
  assertTextLength(input.note?.trim(), 'note', MAX_MOVEMENT_NOTE_LENGTH);

  const execute = async (transactionClient: Prisma.TransactionClient): Promise<GoalMovementResult | null> => {
    const existing = await transactionClient.goalMovement.findUnique({ where: { idempotencyKey }, include: { transactions: true, goal: { select: { accountId: true } } } });
    if (existing) {
      if (!accountIds.includes(existing.goal.accountId)) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
      if (!compareExistingMovement(existing, input, signedAmount)) throw new GoalServiceError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used with a different payload');
      const sourceTransaction = source === 'MANUAL'
        ? existing.transactions.find((transaction) => transaction.accountId === input.accountId)
        : existing.transactions.find((transaction) => transaction.accountId !== existing.goal.accountId);
      const goalTransaction = existing.transactions.find((transaction) => transaction.accountId === existing.goal.accountId);
      if (!sourceTransaction || !goalTransaction) throw new GoalServiceError('IDEMPOTENCY_CONFLICT', 'The existing goal movement is incomplete');
      return { movement: existing, sourceTransaction, goalTransaction, replayed: true };
    }

    const goal = await transactionClient.goal.findFirst({ where: { id: input.goalId, householdId: input.householdId, accountId: { in: accountIds } }, include: { account: true } });
    if (!goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
    const movementSum = await transactionClient.goalMovement.aggregate({ where: { householdId: input.householdId, goalId: input.goalId }, _sum: { amount: true } });
    assertGoalReconciled(goal.currentAmount, movementSum._sum.amount ?? zero());
    ensureAllowedAccount(goal.account, 'VALIDATION_ERROR');
    if (goal.status === 'ARCHIVED') throw new GoalServiceError('GOAL_INVALID_STATE', 'Archived goals are read-only');
    if (source !== 'MANUAL' && goal.status !== 'ACTIVE') return null;

    const counterpartyAccountCandidate = accountIds.includes(input.accountId)
      ? await transactionClient.householdAccount.findFirst({ where: { householdId: input.householdId, id: input.accountId } })
      : null;
    const counterpartyAccount = ensureAllowedAccount(counterpartyAccountCandidate);
    if (counterpartyAccount.id === goal.accountId) throw new GoalServiceError('VALIDATION_ERROR', 'Funding and goal accounts must be different');

    let movementAmount = signedAmount;
    if (movementAmount.gt(0) && goal.status === 'COMPLETED') {
      if (source !== 'MANUAL') return null;
      throw new GoalServiceError('GOAL_INVALID_STATE', 'Completed goals cannot accept positive movements');
    }
    if (movementAmount.gt(0) && goal.targetAmount !== null) {
      const headroom = goal.targetAmount.sub(goal.currentAmount);
      if (headroom.lte(0)) {
        if (source !== 'MANUAL') return null;
        throw new GoalServiceError('GOAL_TARGET_EXCEEDED', 'The goal has no remaining target headroom');
      }
      if (movementAmount.gt(headroom)) {
        if (source !== 'MANUAL') movementAmount = headroom;
        else throw new GoalServiceError('GOAL_TARGET_EXCEEDED', 'The movement would exceed the goal target');
      }
    }

    const nextAmount = goal.currentAmount.add(movementAmount);
    if (nextAmount.lt(0)) throw new GoalServiceError('GOAL_BALANCE_INSUFFICIENT', 'The goal balance is insufficient');
    if (goal.targetAmount !== null && nextAmount.gt(goal.targetAmount)) throw new GoalServiceError('GOAL_TARGET_EXCEEDED', 'The movement would exceed the goal target');

    if (movementAmount.gt(0)) {
      const sourceBalance = await getAccountBalance(transactionClient, input.householdId, counterpartyAccount);
      if (sourceBalance.lt(movementAmount)) throw new GoalServiceError('SOURCE_ACCOUNT_FUNDS_INSUFFICIENT', 'The source account does not have enough available funds');
    } else {
      const goalAccountBalance = await getAccountBalance(transactionClient, input.householdId, goal.account);
      if (goalAccountBalance.lt(movementAmount.abs())) throw new GoalServiceError('GOAL_BALANCE_INSUFFICIENT', 'The goal account does not have enough available funds');
    }

    if (input.sourceTransactionId !== undefined) {
      const sourceTransactionAccountId = input.sourceTransactionAccountId ?? counterpartyAccount.id;
      if (!accountIds.includes(sourceTransactionAccountId)) throw new GoalServiceError('ACCOUNT_NOT_FOUND', 'Source transaction account was not found or is not visible');
      const sourceTransaction = await transactionClient.householdTransaction.findFirst({ where: { id: input.sourceTransactionId, householdId: input.householdId, accountId: sourceTransactionAccountId, transferGroupId: null, amount: { lt: 0 } } });
      if (!sourceTransaction) throw new GoalServiceError('VALIDATION_ERROR', 'The source transaction is invalid');
    }

    const transferGroupId = crypto.randomUUID();
    const movement = await transactionClient.goalMovement.create({
      data: {
        householdId: input.householdId,
        goalId: input.goalId,
        amount: movementAmount,
        source,
        effectiveDate,
        note: input.note?.trim() ?? null,
        createdByUserId: input.createdByUserId ?? input.userId,
        automationRuleId: input.automationRuleId ?? null,
        sourceTransactionId: input.sourceTransactionId ?? null,
        transferGroupId,
        idempotencyKey,
        calculationWindowStart,
        calculationWindowEnd,
        balanceAfter: nextAmount
      }
    });
    const sourceTransaction = await transactionClient.householdTransaction.create({
      data: {
        householdId: input.householdId,
        accountId: counterpartyAccount.id,
        payee: `Goal: ${goal.name}`,
        payerUserId: input.userId,
        amount: movementAmount.negated(),
        date: effectiveDate,
        note: input.note?.trim() ?? null,
        transferGroupId,
        goalMovementId: movement.id
      }
    });
    const goalTransaction = await transactionClient.householdTransaction.create({
      data: {
        householdId: input.householdId,
        accountId: goal.accountId,
        payee: input.direction === 'ADD' ? `Goal funding: ${goal.name}` : `Goal withdrawal: ${goal.name}`,
        payerUserId: input.userId,
        amount: movementAmount,
        date: effectiveDate,
        note: input.note?.trim() ?? null,
        transferGroupId,
        goalMovementId: movement.id
      }
    });
    await transactionClient.goal.update({
      where: { id: goal.id },
      data: {
        currentAmount: nextAmount,
        ...(movementAmount.gt(0) && goal.kind === 'ONE_OFF' && goal.targetAmount !== null && nextAmount.eq(goal.targetAmount) ? { status: 'COMPLETED' as const } : {}),
        ...(movementAmount.lt(0) && goal.status === 'COMPLETED' ? { status: 'ACTIVE' as const } : {})
      }
    });

    return { movement, sourceTransaction, goalTransaction, replayed: false };
  };

  return runSerializableTransaction(prisma, execute).catch(async (error: unknown) => {
    if (!isPrismaErrorCode(error, 'P2002')) throw error;
    const existing = await prisma.goalMovement.findUnique({ where: { idempotencyKey }, include: { transactions: true, goal: { select: { accountId: true } } } });
    if (existing && !accountIds.includes(existing.goal.accountId)) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
    if (!existing || !compareExistingMovement(existing, input, signedAmount)) {
      throw new GoalServiceError('IDEMPOTENCY_CONFLICT', 'The idempotency key was already used with a different payload');
    }
    const sourceTransaction = source === 'MANUAL'
      ? existing.transactions.find((transaction) => transaction.accountId === input.accountId)
      : existing.transactions.find((transaction) => transaction.accountId !== existing.goal.accountId);
    const goalTransaction = existing.transactions.find((transaction) => transaction.accountId === existing.goal.accountId);
    if (!sourceTransaction || !goalTransaction) throw new GoalServiceError('IDEMPOTENCY_CONFLICT', 'The existing goal movement is incomplete');
    return { movement: existing, sourceTransaction, goalTransaction, replayed: true };
  });
};
