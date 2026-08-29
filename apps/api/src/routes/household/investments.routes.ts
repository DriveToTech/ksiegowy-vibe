import type { FastifyPluginAsync } from 'fastify';
import {
  createInvestmentPosition,
  getInvestmentContributions,
  getInvestmentPortfolio,
  getInvestmentValueHistory,
  InvestmentServiceError,
  listInvestmentTransactions,
  recordInvestmentTransaction,
  updateInvestmentPosition,
  voidInvestmentTransaction,
  type InvestmentPosition,
  type InvestmentPortfolioPosition,
  type InvestmentTransaction
} from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

const WRAPPERS = ['TAXABLE', 'IKE', 'IKZE'] as const;
const VISIBILITIES = ['SHARED', 'PRIVATE'] as const;
const TRANSACTION_TYPES = ['BUY', 'SELL', 'VALUATION_UPDATE', 'CONTRIBUTION'] as const;

const householdParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId']
} as const;
const positionParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 }, positionId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId', 'positionId']
} as const;
const transactionParamsSchema = {
  type: 'object', properties: { householdId: { type: 'string', minLength: 1, maxLength: 128 }, positionId: { type: 'string', minLength: 1, maxLength: 128 }, transactionId: { type: 'string', minLength: 1, maxLength: 128 } }, required: ['householdId', 'positionId', 'transactionId']
} as const;
const dateRangeQuerySchema = {
  type: 'object', additionalProperties: false, properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } }
} as const;

const positionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string' }, householdId: { type: 'string' }, ownerUserId: { type: 'string' }, wrapper: { type: 'string', enum: WRAPPERS }, visibility: { type: 'string', enum: VISIBILITIES }, instrument: { type: 'string' }, units: { type: 'string' }, costBasis: { type: 'string' }, currentValue: { type: ['string', 'null'] }, targetAllocationPercent: { type: ['string', 'null'] }, lastValuedAt: { type: ['string', 'null'], format: 'date-time' }, archivedAt: { type: ['string', 'null'], format: 'date-time' }, createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'ownerUserId', 'wrapper', 'visibility', 'instrument', 'units', 'costBasis', 'currentValue', 'targetAllocationPercent', 'lastValuedAt', 'archivedAt', 'createdAt', 'updatedAt']
} as const;
export const investmentTransactionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string' }, householdId: { type: 'string' }, positionId: { type: 'string' }, type: { type: 'string', enum: TRANSACTION_TYPES }, units: { type: ['string', 'null'] }, amount: { type: 'string' }, date: { type: 'string', format: 'date' }, operationId: { type: 'string' }, voidedAt: { type: ['string', 'null'], format: 'date-time' }, voidedByUserId: { type: ['string', 'null'] }, createdAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'positionId', 'type', 'units', 'amount', 'date', 'operationId', 'voidedAt', 'voidedByUserId', 'createdAt']
} as const;
const portfolioSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    positions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { position: positionSchema, currentAllocationPercent: { type: ['string', 'null'] }, driftPercent: { type: ['string', 'null'] } }, required: ['position', 'currentAllocationPercent', 'driftPercent'] } },
    totalCurrentValue: { type: 'string' }, valuedCurrentValue: { type: 'string' }, missingValuationCount: { type: 'integer' }, dataQuality: { type: 'string', enum: ['COMPLETE', 'PARTIAL'] },
    targetAllocation: { type: 'object', additionalProperties: false, properties: { status: { type: 'string', enum: ['COMPLETE', 'INCOMPLETE', 'NONE'] }, totalPercent: { type: 'string' } }, required: ['status', 'totalPercent'] }
  },
  required: ['positions', 'totalCurrentValue', 'valuedCurrentValue', 'missingValuationCount', 'dataQuality', 'targetAllocation']
} as const;
const transactionResultSchema = {
  type: 'object', additionalProperties: false, properties: { transaction: investmentTransactionSchema, position: positionSchema, replayed: { type: 'boolean' } }, required: ['transaction', 'position', 'replayed']
} as const;
const valueHistorySchema = {
  type: 'object', additionalProperties: false,
  properties: {
    data: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { transactionId: { type: 'string' }, positionId: { type: 'string' }, instrument: { type: 'string' }, wrapper: { type: 'string', enum: WRAPPERS }, date: { type: 'string', format: 'date' }, value: { type: 'string' } }, required: ['transactionId', 'positionId', 'instrument', 'wrapper', 'date', 'value'] } },
    from: { type: ['string', 'null'], format: 'date' }, to: { type: ['string', 'null'], format: 'date' }, missingValuationPositionIds: { type: 'array', items: { type: 'string' } }
  },
  required: ['data', 'from', 'to', 'missingValuationPositionIds']
} as const;
const contributionsSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    data: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { transaction: investmentTransactionSchema, positionId: { type: 'string' }, instrument: { type: 'string' }, wrapper: { type: 'string', enum: WRAPPERS } }, required: ['transaction', 'positionId', 'instrument', 'wrapper'] } },
    totalContribution: { type: 'string' }, ikzeContribution: { type: 'string' }, year: { type: ['integer', 'null'] }, annualLimit: { type: ['string', 'null'] }, annualLimitSource: { type: ['string', 'null'] }, annualLimitConfirmation: { type: ['string', 'null'], enum: ['USER_CONFIRMED', null] }, ikzeHeadroom: { type: ['string', 'null'] }
  },
  required: ['data', 'totalContribution', 'ikzeContribution', 'year', 'annualLimit', 'annualLimitSource', 'annualLimitConfirmation', 'ikzeHeadroom']
} as const;

interface HouseholdParams { householdId: string }
interface PositionParams extends HouseholdParams { positionId: string }
interface TransactionParams extends PositionParams { transactionId: string }
interface DateRangeQuery { from?: string; to?: string }
interface ContributionsQuery { year?: number; annualLimit?: string; annualLimitSource?: string; annualLimitConfirmation?: 'USER_CONFIRMED' }
interface CreatePositionBody { wrapper: (typeof WRAPPERS)[number]; instrument: string; visibility?: (typeof VISIBILITIES)[number]; targetAllocationPercent?: string | null }
interface UpdatePositionBody { wrapper?: (typeof WRAPPERS)[number]; instrument?: string; visibility?: (typeof VISIBILITIES)[number]; targetAllocationPercent?: string | null; archive?: boolean }
interface CreateTransactionBody { type: (typeof TRANSACTION_TYPES)[number]; units?: string; amount: string; date: string; operationId: string }

const serializePosition = (position: InvestmentPosition) => ({
  id: position.id, householdId: position.householdId, ownerUserId: position.ownerUserId, wrapper: position.wrapper, visibility: position.visibility, instrument: position.instrument,
  units: position.units.toString(), costBasis: position.costBasis.toString(), currentValue: position.currentValue?.toString() ?? null, targetAllocationPercent: position.targetAllocationPercent?.toString() ?? null,
  lastValuedAt: position.lastValuedAt?.toISOString() ?? null, archivedAt: position.archivedAt?.toISOString() ?? null, createdAt: position.createdAt.toISOString(), updatedAt: position.updatedAt.toISOString()
});

const serializeTransaction = (transaction: InvestmentTransaction) => ({
  id: transaction.id, householdId: transaction.householdId, positionId: transaction.positionId, type: transaction.type, units: transaction.units?.toString() ?? null, amount: transaction.amount.toString(), date: transaction.date.toISOString().slice(0, 10), operationId: transaction.operationId,
  voidedAt: transaction.voidedAt?.toISOString() ?? null, voidedByUserId: transaction.voidedByUserId, createdAt: transaction.createdAt.toISOString()
});

const serializePortfolioPosition = (item: InvestmentPortfolioPosition) => ({ position: serializePosition(item.position), currentAllocationPercent: item.currentAllocationPercent, driftPercent: item.driftPercent });

const mapInvestmentError = (fastify: Parameters<FastifyPluginAsync>[0], error: unknown): never => {
  if (!(error instanceof InvestmentServiceError)) throw error;
  const statusCode = error.code === 'INVESTMENT_NOT_FOUND' || error.code === 'INVESTMENT_TRANSACTION_NOT_FOUND' ? 404 : error.code === 'VALIDATION_ERROR' ? 400 : error.code === 'WORKLOAD_LIMIT_EXCEEDED' ? 413 : 409;
  const httpError = fastify.httpErrors.createError(statusCode, error.message);
  httpError.code = error.code;
  throw httpError;
};

const runInvestmentOperation = async <Result>(fastify: Parameters<FastifyPluginAsync>[0], operation: () => Promise<Result>): Promise<Result> => operation().catch((error: unknown) => mapInvestmentError(fastify, error));

export const investmentsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/investments', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, response: { 200: portfolioSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => {
      const portfolio = await getInvestmentPortfolio(fastify.householdDatabase, request.params.householdId, user.sub);
      return { ...portfolio, positions: portfolio.positions.map(serializePortfolioPosition) };
    });
  });

  fastify.post<{ Params: HouseholdParams; Body: CreatePositionBody }>('/households/:householdId/investments', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, body: { type: 'object', additionalProperties: false, required: ['wrapper', 'instrument'], properties: { wrapper: { type: 'string', enum: WRAPPERS }, instrument: { type: 'string', minLength: 1, maxLength: 160 }, visibility: { type: 'string', enum: VISIBILITIES }, targetAllocationPercent: { type: ['string', 'null'] } } }, response: { 201: positionSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => reply.code(201).send(serializePosition(await createInvestmentPosition(fastify.householdDatabase, { householdId: request.params.householdId, userId: user.sub, ...request.body }))));
  });

  fastify.get<{ Params: HouseholdParams; Querystring: DateRangeQuery }>('/households/:householdId/investments/value-history', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: dateRangeQuerySchema, response: { 200: valueHistorySchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => {
      const result = await getInvestmentValueHistory(fastify.householdDatabase, request.params.householdId, user.sub, request.query.from, request.query.to);
      return { ...result, data: result.data.map((point) => ({ ...point, date: point.date.toISOString().slice(0, 10), value: point.value.toString() })) };
    });
  });

  fastify.get<{ Params: HouseholdParams; Querystring: ContributionsQuery }>('/households/:householdId/investments/contributions', {
    onRequest: [fastify.authenticate], schema: { params: householdParamsSchema, querystring: { type: 'object', additionalProperties: false, properties: { year: { type: 'integer', minimum: 2000, maximum: 2100 }, annualLimit: { type: 'string' }, annualLimitSource: { type: 'string', minLength: 1, maxLength: 300 }, annualLimitConfirmation: { type: 'string', enum: ['USER_CONFIRMED'] } } }, response: { 200: contributionsSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => {
      const result = await getInvestmentContributions(fastify.householdDatabase, request.params.householdId, user.sub, request.query);
      return { ...result, data: result.data.map((item) => ({ ...item, transaction: serializeTransaction(item.transaction) })) };
    });
  });

  fastify.patch<{ Params: PositionParams; Body: UpdatePositionBody }>('/households/:householdId/investments/:positionId', {
    onRequest: [fastify.authenticate], schema: { params: positionParamsSchema, body: { type: 'object', additionalProperties: false, properties: { wrapper: { type: 'string', enum: WRAPPERS }, instrument: { type: 'string', minLength: 1, maxLength: 160 }, visibility: { type: 'string', enum: VISIBILITIES }, targetAllocationPercent: { type: ['string', 'null'] }, archive: { type: 'boolean' } } }, response: { 200: positionSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => serializePosition(await updateInvestmentPosition(fastify.householdDatabase, request.params.householdId, request.params.positionId, { userId: user.sub, ...request.body })));
  });

  fastify.get<{ Params: PositionParams }>('/households/:householdId/investments/:positionId/transactions', {
    onRequest: [fastify.authenticate], schema: { params: positionParamsSchema, response: { 200: { type: 'array', items: investmentTransactionSchema } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => (await listInvestmentTransactions(fastify.householdDatabase, request.params.householdId, user.sub, request.params.positionId)).map(serializeTransaction));
  });

  fastify.post<{ Params: PositionParams; Body: CreateTransactionBody }>('/households/:householdId/investments/:positionId/transactions', {
    onRequest: [fastify.authenticate], schema: { params: positionParamsSchema, body: { type: 'object', additionalProperties: false, required: ['type', 'amount', 'date', 'operationId'], properties: { type: { type: 'string', enum: TRANSACTION_TYPES }, units: { type: 'string' }, amount: { type: 'string', minLength: 1 }, date: { type: 'string', format: 'date' }, operationId: { type: 'string', minLength: 1, maxLength: 128 } } }, response: { 200: transactionResultSchema, 201: transactionResultSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => {
      const result = await recordInvestmentTransaction(fastify.householdDatabase, { householdId: request.params.householdId, userId: user.sub, positionId: request.params.positionId, ...request.body });
      return reply.code(result.replayed ? 200 : 201).send({ transaction: serializeTransaction(result.transaction), position: serializePosition(result.position), replayed: result.replayed });
    });
  });

  fastify.post<{ Params: TransactionParams }>('/households/:householdId/investments/:positionId/transactions/:transactionId/void', {
    onRequest: [fastify.authenticate], schema: { params: transactionParamsSchema, response: { 200: transactionResultSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    return runInvestmentOperation(fastify, async () => {
      const result = await voidInvestmentTransaction(fastify.householdDatabase, request.params.householdId, user.sub, request.params.positionId, request.params.transactionId);
      return { transaction: serializeTransaction(result.transaction), position: serializePosition(result.position), replayed: result.replayed };
    });
  });
};
