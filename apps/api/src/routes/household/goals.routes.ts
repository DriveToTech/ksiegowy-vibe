import type { FastifyPluginAsync } from 'fastify';
import {
  createGoal,
  createGoalAutomationRule,
  createGoalMovement,
  deleteGoalAutomationRule,
  getGoalDetail,
  getGoalsOverview,
  GoalServiceError,
  listGoalAutomationRules,
  listGoalMovements,
  listGoals,
  updateGoal,
  updateGoalAutomationRule,
  type GoalAutomationRule,
  type GoalDetail,
  type GoalMovement,
  type GoalWithAccount,
  type HouseholdTransaction,
} from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';
import { transactionSchema } from './transactions.routes.js';

const GOAL_KINDS = ['ONE_OFF', 'ONGOING', 'NO_CEILING'] as const;
const GOAL_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'] as const;
const MOVEMENT_DIRECTIONS = ['ADD', 'WITHDRAW'] as const;
const RULE_TYPES = ['FIXED_ON_DAY', 'PERCENT_OF_INCOME_OVER_THRESHOLD', 'ROUND_UP'] as const;

const householdParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId']
} as const;
const goalParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 }, goalId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId', 'goalId']
} as const;
const ruleParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 }, goalId: { type: 'string', minLength: 1, maxLength: 128 }, ruleId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId', 'goalId', 'ruleId']
} as const;

const ruleSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 128 }, householdId: { type: 'string', maxLength: 128 }, goalId: { type: 'string', maxLength: 128 }, ruleType: { type: 'string', enum: RULE_TYPES }, automationIdentity: { type: 'string', maxLength: 128 }, fundingAccountId: { type: 'string', maxLength: 128 },
    triggerAccountId: { type: ['string', 'null'], minLength: 1, maxLength: 128 }, createdByUserId: { type: 'string', maxLength: 128 }, startsOn: { type: 'string', format: 'date' }, isActive: { type: 'boolean' },
    fixedAmount: { type: ['string', 'null'] }, dayOfMonth: { type: ['integer', 'null'] }, percentage: { type: ['string', 'null'] }, incomeThreshold: { type: ['string', 'null'] },
    roundUpToAmount: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'goalId', 'ruleType', 'automationIdentity', 'fundingAccountId', 'triggerAccountId', 'createdByUserId', 'startsOn', 'isActive', 'fixedAmount', 'dayOfMonth', 'percentage', 'incomeThreshold', 'roundUpToAmount', 'createdAt', 'updatedAt']
} as const;

const goalSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 128 }, householdId: { type: 'string', maxLength: 128 }, accountId: { type: 'string', maxLength: 128 }, name: { type: 'string', maxLength: 160 }, description: { type: ['string', 'null'], maxLength: 2000 },
    kind: { type: 'string', enum: GOAL_KINDS }, status: { type: 'string', enum: GOAL_STATUSES }, targetAmount: { type: ['string', 'null'] }, currentAmount: { type: 'string' },
    targetDate: { type: ['string', 'null'], format: 'date' }, monthlyAmount: { type: ['string', 'null'] }, accountBalance: { type: 'string' }, activeRules: { type: 'array', items: ruleSchema },
    createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'accountId', 'name', 'description', 'kind', 'status', 'targetAmount', 'currentAmount', 'targetDate', 'monthlyAmount', 'accountBalance', 'activeRules', 'createdAt', 'updatedAt']
} as const;

const movementSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', maxLength: 128 }, householdId: { type: 'string', maxLength: 128 }, goalId: { type: 'string', maxLength: 128 }, amount: { type: 'string', maxLength: 64 }, source: { type: 'string', enum: ['MANUAL', 'AUTOMATION', 'ROUND_UP'] },
    effectiveDate: { type: 'string', format: 'date' }, note: { type: ['string', 'null'], maxLength: 500 }, createdByUserId: { type: ['string', 'null'], maxLength: 128 }, automationRuleId: { type: ['string', 'null'], maxLength: 128 },
    sourceTransactionId: { type: ['string', 'null'], maxLength: 128 }, transferGroupId: { type: 'string', maxLength: 128 }, idempotencyKey: { type: 'string', maxLength: 128 }, calculationWindowStart: { type: ['string', 'null'], format: 'date' },
    calculationWindowEnd: { type: ['string', 'null'], format: 'date' }, balanceAfter: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'goalId', 'amount', 'source', 'effectiveDate', 'note', 'createdByUserId', 'automationRuleId', 'sourceTransactionId', 'transferGroupId', 'idempotencyKey', 'calculationWindowStart', 'calculationWindowEnd', 'balanceAfter', 'createdAt']
} as const;

const goalDetailSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    goal: goalSchema,
    movements: { type: 'array', items: movementSchema },
    totals: {
      type: 'object', additionalProperties: false,
      properties: { added: { type: 'string' }, withdrawn: { type: 'string' } },
      required: ['added', 'withdrawn']
    }
  },
  required: ['goal', 'movements', 'totals']
} as const;

const goalOverviewSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    goals: {
      type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: {
          goal: goalSchema, monthlyDemand: { type: 'string' }, allocation: { type: 'string' }, shortfall: { type: 'string' },
          forecastDate: { type: ['string', 'null'], format: 'date' }, forecastBasis: { type: 'string', enum: ['FIXED_RULES_ONLY', 'NONE'] }, hasVariableRules: { type: 'boolean' }
        },
        required: ['goal', 'monthlyDemand', 'allocation', 'shortfall', 'forecastDate', 'forecastBasis', 'hasVariableRules']
      }
    },
    averageMonthlySurplus: { type: 'string' }, availableForGoals: { type: 'string' }, scheduledMonthlyDemand: { type: 'string' }, fixedAutomationMonthlyDemand: { type: 'string' },
    forecastBasis: { type: 'string', enum: ['FIXED_RULES_ONLY', 'NONE'] }, hasVariableRules: { type: 'boolean' }, lookbackMonths: { type: 'array', items: { type: 'string' } }
  },
  required: ['goals', 'averageMonthlySurplus', 'availableForGoals', 'scheduledMonthlyDemand', 'fixedAutomationMonthlyDemand', 'forecastBasis', 'hasVariableRules', 'lookbackMonths']
} as const;

const goalMovementResultSchema = {
  type: 'object', additionalProperties: false,
  properties: { movement: movementSchema, sourceTransaction: transactionSchema, goalTransaction: transactionSchema, replayed: { type: 'boolean' } },
  required: ['movement', 'sourceTransaction', 'goalTransaction', 'replayed']
} as const;

const createGoalBodySchema = {
  type: 'object', additionalProperties: false, required: ['accountId', 'name', 'kind'], properties: {
    accountId: { type: 'string', minLength: 1, maxLength: 128 }, name: { type: 'string', minLength: 1, maxLength: 160 }, description: { type: 'string', maxLength: 2000 }, kind: { type: 'string', enum: GOAL_KINDS },
    targetAmount: { type: 'string' }, targetDate: { type: 'string', format: 'date' }, monthlyAmount: { type: 'string' }
  }
} as const;
const updateGoalBodySchema = {
  type: 'object', additionalProperties: false, properties: {
    accountId: { type: 'string', minLength: 1, maxLength: 128 }, name: { type: 'string', minLength: 1, maxLength: 160 }, description: { type: ['string', 'null'], maxLength: 2000 }, kind: { type: 'string', enum: GOAL_KINDS },
    targetAmount: { type: ['string', 'null'] }, targetDate: { type: ['string', 'null'], format: 'date' }, monthlyAmount: { type: ['string', 'null'] }, status: { type: 'string', enum: GOAL_STATUSES }
  }
} as const;
const movementBodySchema = {
  type: 'object', additionalProperties: false, required: ['accountId', 'direction', 'amount', 'effectiveDate', 'operationId'], properties: {
    accountId: { type: 'string', minLength: 1, maxLength: 128 }, direction: { type: 'string', enum: MOVEMENT_DIRECTIONS }, amount: { type: 'string', minLength: 1, maxLength: 64 }, effectiveDate: { type: 'string', format: 'date' },
    operationId: { type: 'string', minLength: 1, maxLength: 128 }, note: { type: 'string', maxLength: 500 }
  }
} as const;
const createRuleBodySchema = {
  type: 'object', additionalProperties: false, required: ['ruleType', 'fundingAccountId', 'startsOn'], properties: {
    ruleType: { type: 'string', enum: RULE_TYPES }, automationIdentity: { type: 'string', minLength: 1, maxLength: 128 }, fundingAccountId: { type: 'string', minLength: 1, maxLength: 128 }, triggerAccountId: { type: 'string', minLength: 1, maxLength: 128 }, startsOn: { type: 'string', format: 'date' }, isActive: { type: 'boolean' },
    fixedAmount: { type: 'string' }, dayOfMonth: { type: 'integer', minimum: 1, maximum: 28 }, percentage: { type: 'string' }, incomeThreshold: { type: 'string' }, roundUpToAmount: { type: 'string' }
  }
} as const;
const updateRuleBodySchema = {
  type: 'object', additionalProperties: false, properties: {
    fundingAccountId: { type: 'string', minLength: 1, maxLength: 128 }, triggerAccountId: { type: ['string', 'null'], minLength: 1, maxLength: 128 }, startsOn: { type: 'string', format: 'date' }, isActive: { type: 'boolean' },
    fixedAmount: { type: ['string', 'null'] }, dayOfMonth: { type: ['integer', 'null'], minimum: 1, maximum: 28 }, percentage: { type: ['string', 'null'] }, incomeThreshold: { type: ['string', 'null'] }, roundUpToAmount: { type: ['string', 'null'] }
  }
} as const;

interface HouseholdParams { householdId: string }
interface GoalParams extends HouseholdParams { goalId: string }
interface RuleParams extends GoalParams { ruleId: string }
interface CreateGoalBody { accountId: string; name: string; description?: string; kind: (typeof GOAL_KINDS)[number]; targetAmount?: string; targetDate?: string; monthlyAmount?: string }
interface UpdateGoalBody { accountId?: string; name?: string; description?: string | null; kind?: (typeof GOAL_KINDS)[number]; targetAmount?: string | null; targetDate?: string | null; monthlyAmount?: string | null; status?: (typeof GOAL_STATUSES)[number] }
interface MovementBody { accountId: string; direction: (typeof MOVEMENT_DIRECTIONS)[number]; amount: string; effectiveDate: string; operationId: string; note?: string }
interface CreateRuleBody { ruleType: (typeof RULE_TYPES)[number]; automationIdentity?: string; fundingAccountId: string; triggerAccountId?: string; startsOn: string; isActive?: boolean; fixedAmount?: string; dayOfMonth?: number; percentage?: string; incomeThreshold?: string; roundUpToAmount?: string }
interface UpdateRuleBody { fundingAccountId?: string; triggerAccountId?: string | null; startsOn?: string; isActive?: boolean; fixedAmount?: string | null; dayOfMonth?: number | null; percentage?: string | null; incomeThreshold?: string | null; roundUpToAmount?: string | null }
interface MovementQuery { cursor?: string; limit?: number }
interface OverviewQuery { asOfDate?: string }

const serializeRule = (rule: GoalAutomationRule) => ({
  id: rule.id, householdId: rule.householdId, goalId: rule.goalId, ruleType: rule.ruleType, automationIdentity: rule.automationIdentity, fundingAccountId: rule.fundingAccountId, triggerAccountId: rule.triggerAccountId,
  createdByUserId: rule.createdByUserId, startsOn: rule.startsOn.toISOString().slice(0, 10), isActive: rule.isActive, fixedAmount: rule.fixedAmount?.toString() ?? null, dayOfMonth: rule.dayOfMonth,
  percentage: rule.percentage?.toString() ?? null, incomeThreshold: rule.incomeThreshold?.toString() ?? null, roundUpToAmount: rule.roundUpToAmount?.toString() ?? null, createdAt: rule.createdAt.toISOString(), updatedAt: rule.updatedAt.toISOString()
});

const serializeGoal = (goal: GoalWithAccount) => ({
  id: goal.id, householdId: goal.householdId, accountId: goal.accountId, name: goal.name, description: goal.description, kind: goal.kind, status: goal.status,
  targetAmount: goal.targetAmount?.toString() ?? null, currentAmount: goal.currentAmount.toString(), targetDate: goal.targetDate?.toISOString().slice(0, 10) ?? null, monthlyAmount: goal.monthlyAmount?.toString() ?? null,
  accountBalance: goal.accountBalance, activeRules: goal.activeRules.map(serializeRule), createdAt: goal.createdAt.toISOString(), updatedAt: goal.updatedAt.toISOString()
});

const serializeMovement = (movement: GoalMovement) => ({
  id: movement.id, householdId: movement.householdId, goalId: movement.goalId, amount: movement.amount.toString(), source: movement.source, effectiveDate: movement.effectiveDate.toISOString().slice(0, 10),
  note: movement.note, createdByUserId: movement.createdByUserId, automationRuleId: movement.automationRuleId, sourceTransactionId: movement.sourceTransactionId, transferGroupId: movement.transferGroupId,
  idempotencyKey: movement.idempotencyKey, calculationWindowStart: movement.calculationWindowStart?.toISOString().slice(0, 10) ?? null, calculationWindowEnd: movement.calculationWindowEnd?.toISOString().slice(0, 10) ?? null,
  balanceAfter: movement.balanceAfter.toString(), createdAt: movement.createdAt.toISOString()
});

const serializeTransaction = (transaction: HouseholdTransaction) => ({
  id: transaction.id, householdId: transaction.householdId, accountId: transaction.accountId, categoryId: transaction.categoryId, payee: transaction.payee,
  payerUserId: transaction.payerUserId, bankDescription: transaction.bankDescription, amount: transaction.amount.toString(), date: transaction.date.toISOString().slice(0, 10),
  tag: transaction.tag, note: transaction.note, isRecurring: transaction.isRecurring, commitmentId: transaction.commitmentId, goalMovementId: transaction.goalMovementId,
  categorizationSource: transaction.categorizationSource, importBatchId: transaction.importBatchId, transferGroupId: transaction.transferGroupId, createdAt: transaction.createdAt.toISOString(), updatedAt: transaction.updatedAt.toISOString()
});

const serializeGoalDetail = (detail: GoalDetail) => ({
  goal: serializeGoal(detail.goal), movements: detail.movements.map(serializeMovement), totals: detail.totals
});

const throwMappedGoalError = (fastify: Parameters<FastifyPluginAsync>[0], error: unknown): never => {
  if (!(error instanceof GoalServiceError)) throw error;
  const statusCode = error.code === 'GOAL_NOT_FOUND' ? 404 : error.code === 'ACCOUNT_NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : 409;
  const httpError = fastify.httpErrors.createError(statusCode, error.message);
  httpError.code = error.code;
  throw httpError;
};

const runGoalOperation = async <Result>(fastify: Parameters<FastifyPluginAsync>[0], operation: () => Promise<Result>): Promise<Result> => operation().catch((error: unknown) => throwMappedGoalError(fastify, error));

const parseAsOfDate = (value?: string): Date | undefined => value === undefined ? undefined : new Date(`${value}T12:00:00.000Z`);

export const goalsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: OverviewQuery }>('/households/:householdId/goals/overview', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: { type: 'object', additionalProperties: false, properties: { asOfDate: { type: 'string', format: 'date' } } }, response: { 200: goalOverviewSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      const overview = await getGoalsOverview(fastify.householdDatabase, request.params.householdId, user.sub, parseAsOfDate(request.query.asOfDate));
      return { ...overview, goals: overview.goals.map((item) => ({ ...item, goal: serializeGoal(item.goal) })) };
    });
  });

  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/goals', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, response: { 200: { type: 'array', items: goalSchema } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => (await listGoals(fastify.householdDatabase, request.params.householdId, user.sub)).map(serializeGoal));
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateGoalBody }>('/households/:householdId/goals', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, body: createGoalBodySchema, response: { 201: goalSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      const createdGoal = await createGoal(fastify.householdDatabase, { householdId: request.params.householdId, userId: user.sub, ...request.body });
      const detail = await getGoalDetail(fastify.householdDatabase, request.params.householdId, user.sub, createdGoal.id);
      if (!detail) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
      return reply.code(201).send(serializeGoal(detail.goal));
    });
  });

  fastify.get<{ Params: GoalParams }>('/households/:householdId/goals/:goalId', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, response: { 200: goalDetailSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      const detail = await getGoalDetail(fastify.householdDatabase, request.params.householdId, user.sub, request.params.goalId);
      if (!detail) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
      return serializeGoalDetail(detail);
    });
  });

  fastify.patch<{ Params: GoalParams; Body: UpdateGoalBody }>('/households/:householdId/goals/:goalId', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, body: updateGoalBodySchema, response: { 200: goalDetailSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      await updateGoal(fastify.householdDatabase, request.params.householdId, request.params.goalId, { userId: user.sub, ...request.body });
      const detail = await getGoalDetail(fastify.householdDatabase, request.params.householdId, user.sub, request.params.goalId);
      if (!detail) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
      return serializeGoalDetail(detail);
    });
  });

  fastify.post<{ Params: GoalParams; Body: MovementBody }>('/households/:householdId/goals/:goalId/transfers', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, body: movementBodySchema, response: { 200: goalMovementResultSchema, 201: goalMovementResultSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      const result = await createGoalMovement(fastify.householdDatabase, { householdId: request.params.householdId, userId: user.sub, goalId: request.params.goalId, ...request.body, idempotencyKey: request.body.operationId });
      if (!result) throw new GoalServiceError('GOAL_INVALID_STATE', 'The goal cannot accept this movement');
      return reply.code(result.replayed ? 200 : 201).send({ movement: serializeMovement(result.movement), sourceTransaction: serializeTransaction(result.sourceTransaction), goalTransaction: serializeTransaction(result.goalTransaction), replayed: result.replayed });
    });
  });

  fastify.get<{ Params: GoalParams; Querystring: MovementQuery }>('/households/:householdId/goals/:goalId/movements', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, querystring: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 512 }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 } } }, response: { 200: { type: 'object', additionalProperties: false, properties: { data: { type: 'array', items: movementSchema }, nextCursor: { type: ['string', 'null'], maxLength: 512 } }, required: ['data', 'nextCursor'] } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => {
      const result = await listGoalMovements(fastify.householdDatabase, request.params.householdId, user.sub, request.params.goalId, request.query);
      return { data: result.data.map(serializeMovement), nextCursor: result.nextCursor };
    });
  });

  fastify.get<{ Params: GoalParams }>('/households/:householdId/goals/:goalId/automation-rules', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, response: { 200: { type: 'array', items: ruleSchema } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => (await listGoalAutomationRules(fastify.householdDatabase, request.params.householdId, user.sub, request.params.goalId)).map(serializeRule));
  });

  fastify.post<{ Params: GoalParams; Body: CreateRuleBody }>('/households/:householdId/goals/:goalId/automation-rules', {
    onRequest: [fastify.authenticate], schema: { params: goalParamsSchema, body: createRuleBodySchema, response: { 201: ruleSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => reply.code(201).send(serializeRule(await createGoalAutomationRule(fastify.householdDatabase, { householdId: request.params.householdId, userId: user.sub, goalId: request.params.goalId, ...request.body }))));
  });

  fastify.patch<{ Params: RuleParams; Body: UpdateRuleBody }>('/households/:householdId/goals/:goalId/automation-rules/:ruleId', {
    onRequest: [fastify.authenticate], schema: { params: ruleParamsSchema, body: updateRuleBodySchema, response: { 200: ruleSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runGoalOperation(fastify, async () => serializeRule(await updateGoalAutomationRule(fastify.householdDatabase, request.params.householdId, request.params.ruleId, { userId: user.sub, ...request.body }, request.params.goalId)));
  });

  fastify.delete<{ Params: RuleParams }>('/households/:householdId/goals/:goalId/automation-rules/:ruleId', {
    onRequest: [fastify.authenticate], schema: { params: ruleParamsSchema, response: { 204: { type: 'null' } } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    await runGoalOperation(fastify, () => deleteGoalAutomationRule(fastify.householdDatabase, request.params.householdId, request.params.ruleId, user.sub, request.params.goalId));
    return reply.code(204).send();
  });
};
