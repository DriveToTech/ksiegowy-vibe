import crypto from 'node:crypto';
import { Prisma, type Goal, type GoalAutomationRule, type HouseholdAccount, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';
import { findHouseholdMembership } from './household.service.js';
import { createGoalMovement, GoalServiceError, listGoalsForVisibleAccountIds, type GoalWithAccount } from './goal.service.js';

export interface CreateGoalAutomationRuleInput {
  householdId: string;
  userId: string;
  goalId: string;
  ruleType: 'FIXED_ON_DAY' | 'PERCENT_OF_INCOME_OVER_THRESHOLD' | 'ROUND_UP';
  fundingAccountId: string;
  triggerAccountId?: string;
  startsOn: string;
  isActive?: boolean;
  fixedAmount?: string;
  dayOfMonth?: number;
  percentage?: string;
  incomeThreshold?: string;
  roundUpToAmount?: string;
  automationIdentity?: string;
}

export interface UpdateGoalAutomationRuleInput {
  userId: string;
  fundingAccountId?: string;
  triggerAccountId?: string | null;
  startsOn?: string;
  isActive?: boolean;
  fixedAmount?: string | null;
  dayOfMonth?: number | null;
  percentage?: string | null;
  incomeThreshold?: string | null;
  roundUpToAmount?: string | null;
}

export interface GoalOverviewItem {
  goal: GoalWithAccount;
  monthlyDemand: string;
  allocation: string;
  shortfall: string;
  forecastDate: string | null;
  forecastBasis: 'FIXED_RULES_ONLY' | 'NONE';
  hasVariableRules: boolean;
}

export interface GoalsOverview {
  goals: GoalOverviewItem[];
  averageMonthlySurplus: string;
  availableForGoals: string;
  scheduledMonthlyDemand: string;
  fixedAutomationMonthlyDemand: string;
  forecastBasis: 'FIXED_RULES_ONLY' | 'NONE';
  hasVariableRules: boolean;
  lookbackMonths: string[];
}

export interface RunGoalAutomationsResult {
  processedRules: number;
  createdMovementCount: number;
  skippedMovementCount: number;
  failedOperationCount: number;
}

// ponytail: cap missed automation catch-up at 36 calendar periods per rule;
// older periods can be replayed by a dedicated backfill if that becomes needed.
const MAX_AUTOMATION_CATCH_UP_MONTHS = 36;
const MAX_ROUND_UP_TRANSACTIONS_PER_RULE_PER_RUN = 500;
const MAX_MONEY_INPUT_LENGTH = 64;
const MAX_AUTOMATION_IDENTITY_LENGTH = 128;

const zero = (): Prisma.Decimal => new Prisma.Decimal(0);

const parseMoney = (value: string, fieldName: string): Prisma.Decimal => {
  const normalizedValue = value.trim();
  if (normalizedValue.length > MAX_MONEY_INPUT_LENGTH || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(normalizedValue)) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be a decimal amount with at most two decimal places`);
  }
  const parsed = new Prisma.Decimal(value);
  if (!parsed.isFinite()) throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be finite`);
  return parsed;
};

const optionalMoney = (value: string | null | undefined, fieldName: string): Prisma.Decimal | null => value === undefined || value === null ? null : parseMoney(value, fieldName);

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new GoalServiceError('VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
};

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

const stableAutomationEventKey = (rule: GoalAutomationRule, eventIdentity: string): string => `goal-automation:${crypto.createHash('sha256').update([
  rule.householdId, rule.goalId, rule.automationIdentity, eventIdentity
].join(':')).digest('hex')}`;

const isUniqueConstraintViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';

const isVisibleAccountForUser = (account: HouseholdAccount | null, userId: string): account is HouseholdAccount =>
  account !== null && (account.visibility === 'SHARED' || account.ownerUserId === userId) && account.type !== 'CREDIT_CARD';

const loadRuleAccounts = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  goalId: string,
  fundingAccountId: string,
  triggerAccountId: string | null
): Promise<{ goal: Goal; goalAccount: HouseholdAccount; fundingAccount: HouseholdAccount; triggerAccount: HouseholdAccount | null }> => {
  const membership = await findHouseholdMembership(prisma, householdId, userId);
  if (!membership) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const goal = await prisma.goal.findFirst({ where: { id: goalId, householdId, accountId: { in: accountIds } }, include: { account: true } });
  if (!goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  if (goal.status === 'ARCHIVED') throw new GoalServiceError('GOAL_INVALID_STATE', 'Archived goals are read-only');
  if (!isVisibleAccountForUser(goal.account, userId)) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');

  const requestedAccountIds = [fundingAccountId, ...(triggerAccountId ? [triggerAccountId] : [])];
  const accounts = await prisma.householdAccount.findMany({ where: { householdId, id: { in: requestedAccountIds } } });
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const fundingAccount = accountById.get(fundingAccountId) ?? null;
  const triggerAccount = triggerAccountId ? accountById.get(triggerAccountId) ?? null : null;
  if (!isVisibleAccountForUser(fundingAccount, userId)) throw new GoalServiceError('ACCOUNT_NOT_FOUND', 'Funding account was not found or is not visible');
  if (triggerAccountId && !isVisibleAccountForUser(triggerAccount, userId)) throw new GoalServiceError('ACCOUNT_NOT_FOUND', 'Trigger account was not found or is not visible');
  if (fundingAccount.id === goal.accountId) throw new GoalServiceError('VALIDATION_ERROR', 'Funding and goal accounts must be different');
  return { goal, goalAccount: goal.account, fundingAccount, triggerAccount };
};

const validateRuleShape = (input: {
  ruleType: CreateGoalAutomationRuleInput['ruleType'];
  fixedAmount: Prisma.Decimal | null;
  dayOfMonth: number | null;
  percentage: Prisma.Decimal | null;
  incomeThreshold: Prisma.Decimal | null;
  roundUpToAmount: Prisma.Decimal | null;
  triggerAccountId: string | null;
}): void => {
  if (input.ruleType === 'FIXED_ON_DAY') {
    if (input.fixedAmount === null || input.fixedAmount.lte(0) || input.dayOfMonth === null || !Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28 || input.triggerAccountId !== null || input.percentage !== null || input.incomeThreshold !== null || input.roundUpToAmount !== null) {
      throw new GoalServiceError('VALIDATION_ERROR', 'FIXED_ON_DAY requires positive fixedAmount, dayOfMonth from 1 to 28, and no trigger account');
    }
    return;
  }

  if (input.ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD') {
    if (input.triggerAccountId === null || input.percentage === null || input.percentage.lte(0) || input.percentage.gt(100) || input.incomeThreshold === null || input.incomeThreshold.lt(0) || input.fixedAmount !== null || input.dayOfMonth !== null || input.roundUpToAmount !== null) {
      throw new GoalServiceError('VALIDATION_ERROR', 'PERCENT_OF_INCOME_OVER_THRESHOLD requires a trigger, percentage from 0 to 100, and non-negative incomeThreshold');
    }
    return;
  }

  if (input.triggerAccountId === null || input.roundUpToAmount === null || input.roundUpToAmount.lte(0) || input.fixedAmount !== null || input.dayOfMonth !== null || input.percentage !== null || input.incomeThreshold !== null) {
    throw new GoalServiceError('VALIDATION_ERROR', 'ROUND_UP requires a trigger account and positive roundUpToAmount');
  }
};

export const createGoalAutomationRule = async (prisma: PrismaClient, input: CreateGoalAutomationRuleInput): Promise<GoalAutomationRule> => {
  const startsOn = parseDate(input.startsOn, 'startsOn');
  const triggerAccountId = input.triggerAccountId ?? null;
  await loadRuleAccounts(prisma, input.householdId, input.userId, input.goalId, input.fundingAccountId, triggerAccountId);
  const fixedAmount = optionalMoney(input.fixedAmount, 'fixedAmount');
  const dayOfMonth = input.dayOfMonth ?? null;
  const percentage = optionalMoney(input.percentage, 'percentage');
  const incomeThreshold = optionalMoney(input.incomeThreshold, 'incomeThreshold');
  const roundUpToAmount = optionalMoney(input.roundUpToAmount, 'roundUpToAmount');
  validateRuleShape({ ruleType: input.ruleType, fixedAmount, dayOfMonth, percentage, incomeThreshold, roundUpToAmount, triggerAccountId });

  const requestedAutomationIdentity = input.automationIdentity?.trim();
  if (requestedAutomationIdentity !== undefined && (requestedAutomationIdentity.length === 0 || requestedAutomationIdentity.length > MAX_AUTOMATION_IDENTITY_LENGTH)) {
    throw new GoalServiceError('VALIDATION_ERROR', 'automationIdentity must be between 1 and 128 characters');
  }

  // Deleted rules remain as tombstones. Recreating the same configuration reuses
  // its immutable series identity; a different configuration must provide a new
  // explicit identity so it is a deliberate new automation series, not a replay.
  const deletedRule = requestedAutomationIdentity
    ? await prisma.goalAutomationRule.findFirst({ where: { householdId: input.householdId, automationIdentity: requestedAutomationIdentity, deletedAt: { not: null } } })
    : await prisma.goalAutomationRule.findFirst({
      where: {
        householdId: input.householdId,
        goalId: input.goalId,
        ruleType: input.ruleType,
        deletedAt: { not: null },
        fundingAccountId: input.fundingAccountId,
        triggerAccountId,
        startsOn,
        fixedAmount,
        dayOfMonth,
        percentage,
        incomeThreshold,
        roundUpToAmount
      }
    });

  if (deletedRule && (deletedRule.goalId !== input.goalId || deletedRule.ruleType !== input.ruleType)) {
    throw new GoalServiceError('GOAL_RULE_CONFLICT', 'automationIdentity belongs to a different goal rule');
  }

  if (!requestedAutomationIdentity && !deletedRule) {
    const previousSeries = await prisma.goalAutomationRule.findFirst({
      where: { householdId: input.householdId, goalId: input.goalId, ruleType: input.ruleType, deletedAt: { not: null } },
      select: { id: true }
    });
    if (previousSeries) {
      throw new GoalServiceError('GOAL_RULE_CONFLICT', 'Recreating a deleted automation requires its automationIdentity');
    }
  }

  const data = {
    goalId: input.goalId,
    ruleType: input.ruleType,
    fundingAccountId: input.fundingAccountId,
    triggerAccountId,
    createdByUserId: input.userId,
    startsOn,
    isActive: input.isActive ?? true,
    fixedAmount,
    dayOfMonth,
    percentage,
    incomeThreshold,
    roundUpToAmount,
     automationIdentity: deletedRule?.automationIdentity ?? requestedAutomationIdentity ?? crypto.randomUUID(),
    ...(deletedRule ? { deletedAt: null, roundUpCursorDate: null, roundUpCursorId: null } : {})
  };

  const saveRule = deletedRule
    ? prisma.goalAutomationRule.update({ where: { id: deletedRule.id }, data })
    : prisma.goalAutomationRule.create({ data: { householdId: input.householdId, ...data } });

  return saveRule.catch((error: unknown) => {
    if (isUniqueConstraintViolation(error)) throw new GoalServiceError('GOAL_RULE_CONFLICT', 'An active rule with the same configuration already exists');
    throw error;
  });
};

export const listGoalAutomationRules = async (prisma: PrismaClient, householdId: string, userId: string, goalId?: string): Promise<GoalAutomationRule[]> => {
  if (!(await findHouseholdMembership(prisma, householdId, userId))) return [];
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  if (accountIds.length === 0) return [];
  if (goalId !== undefined) {
    const goal = await prisma.goal.findFirst({ where: { id: goalId, householdId, accountId: { in: accountIds } }, select: { id: true } });
    if (!goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  }
  const rules = await prisma.goalAutomationRule.findMany({
    where: { householdId, deletedAt: null, goal: { accountId: { in: accountIds } }, fundingAccountId: { in: accountIds }, OR: [{ triggerAccountId: null }, { triggerAccountId: { in: accountIds } }], ...(goalId ? { goalId } : {}) },
    orderBy: { createdAt: 'asc' }
  });
  const creatorIds = [...new Set(rules.map((rule) => rule.createdByUserId))];
  const memberships = creatorIds.length === 0 ? [] : await prisma.householdMembership.findMany({ where: { householdId, userId: { in: creatorIds } }, select: { userId: true } });
  const memberIds = new Set(memberships.map((membership) => membership.userId));
  return rules.filter((rule) => memberIds.has(rule.createdByUserId) && accountIds.includes(rule.fundingAccountId) && (rule.triggerAccountId === null || accountIds.includes(rule.triggerAccountId)));
};

export const updateGoalAutomationRule = async (prisma: PrismaClient, householdId: string, ruleId: string, input: UpdateGoalAutomationRuleInput, goalId?: string): Promise<GoalAutomationRule> => {
  const existing = await prisma.goalAutomationRule.findFirst({ where: { id: ruleId, householdId, deletedAt: null }, include: { goal: { include: { account: true } } } });
  if (!existing || goalId !== undefined && existing.goalId !== goalId) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  if (!(await findHouseholdMembership(prisma, householdId, existing.createdByUserId))) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');

  const accountIds = await visibleAccountIds(prisma, householdId, input.userId);
  if (!accountIds.includes(existing.goal.accountId)) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  const fundingAccountId = input.fundingAccountId ?? existing.fundingAccountId;
  const triggerAccountId = 'triggerAccountId' in input ? input.triggerAccountId ?? null : existing.triggerAccountId;
  const triggerAccountChanged = triggerAccountId !== existing.triggerAccountId;
  await loadRuleAccounts(prisma, householdId, input.userId, existing.goalId, fundingAccountId, triggerAccountId);

  const fixedAmount = 'fixedAmount' in input ? optionalMoney(input.fixedAmount, 'fixedAmount') : existing.fixedAmount;
  const dayOfMonth = 'dayOfMonth' in input ? input.dayOfMonth ?? null : existing.dayOfMonth;
  const percentage = 'percentage' in input ? optionalMoney(input.percentage, 'percentage') : existing.percentage;
  const incomeThreshold = 'incomeThreshold' in input ? optionalMoney(input.incomeThreshold, 'incomeThreshold') : existing.incomeThreshold;
  const roundUpToAmount = 'roundUpToAmount' in input ? optionalMoney(input.roundUpToAmount, 'roundUpToAmount') : existing.roundUpToAmount;
  validateRuleShape({ ruleType: existing.ruleType, fixedAmount, dayOfMonth, percentage, incomeThreshold, roundUpToAmount, triggerAccountId });

  return prisma.goalAutomationRule.update({
    where: { id: ruleId },
    data: {
      fundingAccountId,
      triggerAccountId,
      startsOn: input.startsOn === undefined ? existing.startsOn : parseDate(input.startsOn, 'startsOn'),
      isActive: input.isActive ?? existing.isActive,
      fixedAmount,
      dayOfMonth,
      percentage,
      incomeThreshold,
      roundUpToAmount,
      ...(triggerAccountChanged ? { roundUpCursorDate: null, roundUpCursorId: null } : {})
    }
  }).catch((error: unknown) => {
    if (isUniqueConstraintViolation(error)) throw new GoalServiceError('GOAL_RULE_CONFLICT', 'An active rule with the same configuration already exists');
    throw error;
  });
};

export const deleteGoalAutomationRule = async (prisma: PrismaClient, householdId: string, ruleId: string, userId: string, goalId?: string): Promise<void> => {
  if (!(await findHouseholdMembership(prisma, householdId, userId))) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const goal = goalId === undefined ? null : await prisma.goal.findFirst({ where: { id: goalId, householdId, accountId: { in: accountIds } }, select: { id: true, status: true } });
  if (goalId !== undefined && !goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  if (goal?.status === 'ARCHIVED') throw new GoalServiceError('GOAL_INVALID_STATE', 'Archived goals are read-only');
  const rule = await prisma.goalAutomationRule.findFirst({
    where: {
      id: ruleId,
      householdId,
      deletedAt: null,
      ...(goalId ? { goalId } : {}),
      goal: { accountId: { in: accountIds } },
      fundingAccountId: { in: accountIds },
      OR: [{ triggerAccountId: null }, { triggerAccountId: { in: accountIds } }]
    },
    select: { id: true, createdByUserId: true }
  });
  if (!rule) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  if (!(await findHouseholdMembership(prisma, householdId, rule.createdByUserId))) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal automation rule was not found');
  await prisma.goalAutomationRule.update({ where: { id: ruleId }, data: { isActive: false, deletedAt: new Date(), roundUpCursorDate: null, roundUpCursorId: null } });
};

const getWarsawDate = (asOfDate: Date): Date => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(asOfDate);
  const values = new Map(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return new Date(`${values.get('year')}-${values.get('month')}-${values.get('day')}T00:00:00.000Z`);
};

const monthStart = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const monthEnd = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));

const monthKey = (value: Date): string => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;

const completedMonthStarts = (asOfDate: Date, startsOn: Date): Date[] => {
  const first = monthStart(startsOn);
  const last = monthStart(asOfDate);
  const months: Date[] = [];
  for (let cursor = new Date(first); cursor < last; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) months.push(cursor);
  return months.slice(-MAX_AUTOMATION_CATCH_UP_MONTHS);
};

const addMonths = (value: Date, months: number): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, value.getUTCDate()));

export const getGoalsOverview = async (prisma: PrismaClient, householdId: string, userId: string, asOfDate = new Date()): Promise<GoalsOverview> => {
  const visibleIds = await visibleAccountIds(prisma, householdId, userId);
  const goals = await listGoalsForVisibleAccountIds(prisma, householdId, userId, visibleIds);
  const calendarDate = getWarsawDate(asOfDate);
  const completedMonths = [0, 1, 2].map((offset) => new Date(Date.UTC(calendarDate.getUTCFullYear(), calendarDate.getUTCMonth() - offset - 1, 1))).reverse();
  const lookbackStart = completedMonths[0] ?? monthStart(calendarDate);
  const lookbackEnd = completedMonths[2] ? monthEnd(completedMonths[2]!) : monthEnd(lookbackStart);
  const transactions = visibleIds.length === 0 ? [] : await prisma.householdTransaction.findMany({
    where: { householdId, accountId: { in: visibleIds }, transferGroupId: null, date: { gte: lookbackStart, lte: lookbackEnd } },
    select: { amount: true, date: true }
  });

  const surplusByMonth = new Map(completedMonths.map((month) => [monthKey(month), { income: zero(), expense: zero() }]));
  for (const transaction of transactions) {
    const bucket = surplusByMonth.get(monthKey(transaction.date));
    if (!bucket) continue;
    if (transaction.amount.gte(0)) bucket.income = bucket.income.add(transaction.amount);
    else bucket.expense = bucket.expense.add(transaction.amount.abs());
  }
  let totalSurplus = zero();
  for (const bucket of surplusByMonth.values()) totalSurplus = totalSurplus.add(bucket.income.sub(bucket.expense));
  const averageMonthlySurplus = totalSurplus.div(3).toDecimalPlaces(2);
  const availableForGoals = averageMonthlySurplus.gt(0) ? averageMonthlySurplus : zero();

  const activeGoals = goals.filter((goal) => goal.status === 'ACTIVE');
  let scheduledMonthlyDemand = zero();
  let fixedAutomationMonthlyDemand = zero();
  let hasVariableRules = false;
  const demandByGoal = new Map<string, Prisma.Decimal>();
  for (const goal of activeGoals) {
    const demand = goal.monthlyAmount ?? zero();
    demandByGoal.set(goal.id, demand);
    scheduledMonthlyDemand = scheduledMonthlyDemand.add(demand);
    for (const rule of goal.activeRules) {
      if (rule.ruleType === 'FIXED_ON_DAY') fixedAutomationMonthlyDemand = fixedAutomationMonthlyDemand.add(rule.fixedAmount ?? zero());
      else hasVariableRules = true;
    }
  }

  const items = goals.map((goal) => {
    const demand = demandByGoal.get(goal.id) ?? zero();
    const allocation = scheduledMonthlyDemand.gt(0) && demand.gt(0) ? availableForGoals.mul(demand).div(scheduledMonthlyDemand).toDecimalPlaces(2) : zero();
    const shortfall = demand.sub(allocation).gt(0) ? demand.sub(allocation).toDecimalPlaces(2) : zero();
    const fixedAmount = goal.activeRules.filter((rule) => rule.ruleType === 'FIXED_ON_DAY').reduce((sum, rule) => sum.add(rule.fixedAmount ?? zero()), zero());
    const headroom = goal.targetAmount?.sub(goal.currentAmount) ?? null;
    const forecastDate = headroom !== null && headroom.gt(0) && fixedAmount.gt(0)
      ? dateKey(addMonths(calendarDate, Number(headroom.div(fixedAmount).ceil())))
      : null;
    return {
      goal,
      monthlyDemand: demand.toFixed(2),
      allocation: allocation.toFixed(2),
      shortfall: shortfall.toFixed(2),
      forecastDate,
      forecastBasis: forecastDate ? 'FIXED_RULES_ONLY' as const : 'NONE' as const,
      hasVariableRules: goal.activeRules.some((rule) => rule.ruleType !== 'FIXED_ON_DAY')
    };
  });

  return {
    goals: items,
    averageMonthlySurplus: averageMonthlySurplus.toFixed(2),
    availableForGoals: availableForGoals.toFixed(2),
    scheduledMonthlyDemand: scheduledMonthlyDemand.toFixed(2),
    fixedAutomationMonthlyDemand: fixedAutomationMonthlyDemand.toFixed(2),
    forecastBasis: goals.some((goal) => goal.activeRules.some((rule) => rule.ruleType === 'FIXED_ON_DAY')) ? 'FIXED_RULES_ONLY' : 'NONE',
    hasVariableRules,
    lookbackMonths: completedMonths.map(monthKey)
  };
};

const buildFixedDates = (rule: GoalAutomationRule, asOfDate: Date): Date[] => {
  const firstMonth = monthStart(rule.startsOn);
  const lastMonth = monthStart(asOfDate);
  const months: Date[] = [];
  for (let cursor = new Date(firstMonth); cursor <= lastMonth; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) months.push(cursor);
  return months.slice(-MAX_AUTOMATION_CATCH_UP_MONTHS).map((month) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), rule.dayOfMonth!))).filter((date) => date >= rule.startsOn && date <= asOfDate);
};

export const runGoalAutomations = async (prisma: PrismaClient, asOfDate = new Date()): Promise<RunGoalAutomationsResult> => {
  const calendarDate = getWarsawDate(asOfDate);
  const candidateRules = await prisma.goalAutomationRule.findMany({
    where: { deletedAt: null, isActive: true, startsOn: { lte: calendarDate } },
    include: { goal: { include: { account: true } }, fundingAccount: true, triggerAccount: true },
    orderBy: { createdAt: 'asc' }
  });
  if (candidateRules.length === 0) return { processedRules: 0, createdMovementCount: 0, skippedMovementCount: 0, failedOperationCount: 0 };

  const activeMemberships = await prisma.householdMembership.findMany({
    where: { householdId: { in: [...new Set(candidateRules.map((rule) => rule.householdId))] }, userId: { in: [...new Set(candidateRules.map((rule) => rule.createdByUserId))] } },
    select: { householdId: true, userId: true }
  });
  const activeMembershipKeys = new Set(activeMemberships.map((membership) => `${membership.householdId}:${membership.userId}`));
  const rules = candidateRules.filter((rule) => activeMembershipKeys.has(`${rule.householdId}:${rule.createdByUserId}`));
  if (rules.length === 0) return { processedRules: candidateRules.length, createdMovementCount: 0, skippedMovementCount: candidateRules.length, failedOperationCount: 0 };

  let createdMovementCount = 0;
  let skippedMovementCount = 0;
  let failedOperationCount = 0;
  for (const rule of rules) {
    if (!isVisibleAccountForUser(rule.goal.account, rule.createdByUserId) || !isVisibleAccountForUser(rule.fundingAccount, rule.createdByUserId) || rule.fundingAccountId === rule.goal.accountId || rule.triggerAccount && !isVisibleAccountForUser(rule.triggerAccount, rule.createdByUserId)) {
      skippedMovementCount += 1;
      continue;
    }

    const operations: Array<{ amount: Prisma.Decimal; effectiveDate: Date; idempotencyKey: string; sourceTransactionId?: string; calculationWindowStart?: Date; calculationWindowEnd?: Date }> = [];
    if (rule.ruleType === 'FIXED_ON_DAY') {
      for (const effectiveDate of buildFixedDates(rule, calendarDate)) {
        operations.push({ amount: rule.fixedAmount!, effectiveDate, idempotencyKey: stableAutomationEventKey(rule, `fixed:${monthKey(effectiveDate)}`) });
      }
    } else if (rule.ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD') {
      for (const month of completedMonthStarts(calendarDate, rule.startsOn)) {
        const incomeStart = rule.startsOn > month ? rule.startsOn : month;
        const incomeResult = await prisma.householdTransaction.aggregate({
          where: { householdId: rule.householdId, accountId: rule.triggerAccountId!, transferGroupId: null, amount: { gt: 0 }, date: { gte: incomeStart, lte: monthEnd(month) } },
          _sum: { amount: true }
        });
        const income = incomeResult._sum.amount ?? zero();
        const excess = income.sub(rule.incomeThreshold!).gt(0) ? income.sub(rule.incomeThreshold!) : zero();
        const amount = excess.mul(rule.percentage!).div(100).toDecimalPlaces(2);
        if (amount.gt(0)) operations.push({ amount, effectiveDate: monthEnd(month), idempotencyKey: stableAutomationEventKey(rule, `income:${monthKey(month)}`), calculationWindowStart: month, calculationWindowEnd: monthEnd(month) });
      }
    } else {
      const sourceTransactions = await prisma.householdTransaction.findMany({
        where: {
          householdId: rule.householdId,
          accountId: rule.triggerAccountId!,
          transferGroupId: null,
          amount: { lt: 0 },
          date: { gte: rule.startsOn, lte: calendarDate },
          ...(rule.roundUpCursorDate && rule.roundUpCursorId ? { OR: [{ date: { gt: rule.roundUpCursorDate } }, { date: rule.roundUpCursorDate, id: { gt: rule.roundUpCursorId } }] } : {})
        },
        select: { id: true, accountId: true, amount: true, date: true },
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        take: MAX_ROUND_UP_TRANSACTIONS_PER_RULE_PER_RUN + 1
      });
      for (const transaction of sourceTransactions.slice(0, MAX_ROUND_UP_TRANSACTIONS_PER_RULE_PER_RUN)) {
        const transactionAmount = transaction.amount.abs();
        const amount = transactionAmount.div(rule.roundUpToAmount!).ceil().mul(rule.roundUpToAmount!).sub(transactionAmount).toDecimalPlaces(2);
        if (amount.gt(0)) operations.push({ amount, effectiveDate: transaction.date, idempotencyKey: stableAutomationEventKey(rule, `round-up:${transaction.id}`), sourceTransactionId: transaction.id, calculationWindowStart: transaction.date, calculationWindowEnd: transaction.date });
      }

      // Advance only after the page is handled. A failed source operation stays
      // at the cursor so a later sweep can retry it instead of losing it.
      let canAdvanceCursor = true;
      for (const operation of operations) {
        const result = await createGoalMovement(prisma, {
          householdId: rule.householdId,
          userId: rule.createdByUserId,
          goalId: rule.goalId,
          accountId: rule.fundingAccountId,
          direction: 'ADD',
          amount: operation.amount.toFixed(2),
          effectiveDate: dateKey(operation.effectiveDate),
          idempotencyKey: operation.idempotencyKey,
          source: 'ROUND_UP',
          createdByUserId: rule.createdByUserId,
          automationRuleId: rule.id,
          ...(operation.sourceTransactionId ? { sourceTransactionId: operation.sourceTransactionId } : {}),
          ...(operation.sourceTransactionId && rule.triggerAccountId ? { sourceTransactionAccountId: rule.triggerAccountId } : {}),
          ...(operation.calculationWindowStart ? { calculationWindowStart: dateKey(operation.calculationWindowStart) } : {}),
          ...(operation.calculationWindowEnd ? { calculationWindowEnd: dateKey(operation.calculationWindowEnd) } : {})
        }).catch((error: unknown) => {
          if (error instanceof GoalServiceError && (error.code === 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT' || error.code === 'GOAL_INVALID_STATE' || error.code === 'GOAL_TARGET_EXCEEDED')) {
            if (error.code === 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT') canAdvanceCursor = false;
            return null;
          }
          failedOperationCount += 1;
          canAdvanceCursor = false;
          return null;
        });
        if (result?.replayed) skippedMovementCount += 1;
        else if (result) createdMovementCount += 1;
        else skippedMovementCount += 1;
        if (!canAdvanceCursor) break;
      }

      const lastProcessedSourceTransaction = sourceTransactions[Math.min(sourceTransactions.length, MAX_ROUND_UP_TRANSACTIONS_PER_RULE_PER_RUN) - 1];
      if (canAdvanceCursor && lastProcessedSourceTransaction) {
        await prisma.goalAutomationRule.update({ where: { id: rule.id }, data: { roundUpCursorDate: lastProcessedSourceTransaction.date, roundUpCursorId: lastProcessedSourceTransaction.id } });
      }
      continue;
    }

    for (const operation of operations) {
      const result = await createGoalMovement(prisma, {
        householdId: rule.householdId,
        userId: rule.createdByUserId,
        goalId: rule.goalId,
        accountId: rule.fundingAccountId,
        direction: 'ADD',
        amount: operation.amount.toFixed(2),
        effectiveDate: dateKey(operation.effectiveDate),
        idempotencyKey: operation.idempotencyKey,
        source: 'AUTOMATION',
        createdByUserId: rule.createdByUserId,
        automationRuleId: rule.id,
        ...(operation.sourceTransactionId ? { sourceTransactionId: operation.sourceTransactionId } : {}),
        ...(operation.sourceTransactionId && rule.triggerAccountId ? { sourceTransactionAccountId: rule.triggerAccountId } : {}),
        ...(operation.calculationWindowStart ? { calculationWindowStart: dateKey(operation.calculationWindowStart) } : {}),
        ...(operation.calculationWindowEnd ? { calculationWindowEnd: dateKey(operation.calculationWindowEnd) } : {})
      }).catch((error: unknown) => {
        if (error instanceof GoalServiceError && (error.code === 'SOURCE_ACCOUNT_FUNDS_INSUFFICIENT' || error.code === 'GOAL_INVALID_STATE' || error.code === 'GOAL_TARGET_EXCEEDED')) return null;
        failedOperationCount += 1;
        return null;
      });
      if (result?.replayed) skippedMovementCount += 1;
      else if (result) createdMovementCount += 1;
      else skippedMovementCount += 1;
    }
  }

  return { processedRules: rules.length, createdMovementCount, skippedMovementCount, failedOperationCount };
};
