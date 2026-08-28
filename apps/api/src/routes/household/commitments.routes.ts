import type { FastifyPluginAsync } from 'fastify';
import {
  calculateAmortizationSchedule,
  createCommitment,
  getCommitment,
  listCommitments,
  listUpcomingCommitments,
  updateCommitment,
  type Commitment
} from '@ksiegowy/household-service';
import { requireHouseholdMembership } from './household-membership-guard.js';

const COMMITMENT_TYPES = ['INSURANCE', 'LOAN', 'SUBSCRIPTION', 'UTILITY', 'OTHER'] as const;
const BILLING_FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
const COMMITMENT_STATUSES = ['ACTIVE', 'PAUSED', 'CANCELLED'] as const;

// ── Schemas ──────────────────────────────────────────────────────────────────

const commitmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    accountId: { type: 'string' },
    type: { type: 'string', enum: COMMITMENT_TYPES },
    name: { type: 'string' },
    amount: { type: 'string' },
    billingFrequency: { type: 'string', enum: BILLING_FREQUENCIES },
    nextDueDate: { type: 'string', format: 'date' },
    status: { type: 'string', enum: COMMITMENT_STATUSES },
    provider: { type: ['string', 'null'] },
    policyNumber: { type: ['string', 'null'] },
    insuredObject: { type: ['string', 'null'] },
    sumInsured: { type: ['string', 'null'] },
    coverBreakdown: {},
    principal: { type: ['string', 'null'] },
    outstandingBalance: { type: ['string', 'null'] },
    interestRate: { type: ['string', 'null'] },
    termMonths: { type: ['number', 'null'] },
    isAutomatic: { type: 'boolean' },
    lastUsedAt: { type: ['string', 'null'], format: 'date-time' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id', 'householdId', 'accountId', 'type', 'name', 'amount', 'billingFrequency', 'nextDueDate', 'status',
    'provider', 'policyNumber', 'insuredObject', 'sumInsured', 'coverBreakdown',
    'principal', 'outstandingBalance', 'interestRate', 'termMonths', 'isAutomatic', 'lastUsedAt', 'createdAt', 'updatedAt'
  ]
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const commitmentParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    commitmentId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'commitmentId']
} as const;

const listCommitmentsQuerySchema = {
  type: 'object',
  properties: { status: { type: 'string', enum: COMMITMENT_STATUSES } }
} as const;

const upcomingQuerySchema = {
  type: 'object',
  properties: { withinDays: { type: 'number', minimum: 1, maximum: 365 } }
} as const;

const createCommitmentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['accountId', 'type', 'name', 'amount', 'billingFrequency', 'nextDueDate'],
  properties: {
    accountId: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: COMMITMENT_TYPES },
    name: { type: 'string', minLength: 1 },
    amount: { type: 'string', minLength: 1 },
    billingFrequency: { type: 'string', enum: BILLING_FREQUENCIES },
    nextDueDate: { type: 'string', format: 'date' },
    provider: { type: 'string' },
    policyNumber: { type: 'string' },
    insuredObject: { type: 'string' },
    sumInsured: { type: 'string' },
    principal: { type: 'string' },
    outstandingBalance: { type: 'string' },
    interestRate: { type: 'string' },
    termMonths: { type: 'number', minimum: 1 },
    isAutomatic: { type: 'boolean' }
  }
} as const;

const updateCommitmentBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    amount: { type: 'string', minLength: 1 },
    billingFrequency: { type: 'string', enum: BILLING_FREQUENCIES },
    nextDueDate: { type: 'string', format: 'date' },
    status: { type: 'string', enum: COMMITMENT_STATUSES },
    outstandingBalance: { type: 'string' },
    lastUsedAt: { type: 'string', format: 'date-time' },
    isAutomatic: { type: 'boolean' }
  }
} as const;

const amortizationScheduleResponseSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      month: { type: 'number' },
      payment: { type: 'string' },
      principalPortion: { type: 'string' },
      interestPortion: { type: 'string' },
      remainingBalance: { type: 'string' }
    },
    required: ['month', 'payment', 'principalPortion', 'interestPortion', 'remainingBalance']
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams { householdId: string }
interface CommitmentParams { householdId: string; commitmentId: string }
interface ListCommitmentsQuery { status?: (typeof COMMITMENT_STATUSES)[number] }
interface UpcomingQuery { withinDays?: number }

interface CreateCommitmentBody {
  accountId: string;
  type: (typeof COMMITMENT_TYPES)[number];
  name: string;
  amount: string;
  billingFrequency: (typeof BILLING_FREQUENCIES)[number];
  nextDueDate: string;
  provider?: string;
  policyNumber?: string;
  insuredObject?: string;
  sumInsured?: string;
  principal?: string;
  outstandingBalance?: string;
  interestRate?: string;
  termMonths?: number;
  isAutomatic?: boolean;
}

interface UpdateCommitmentBody {
  name?: string;
  amount?: string;
  billingFrequency?: (typeof BILLING_FREQUENCIES)[number];
  nextDueDate?: string;
  status?: (typeof COMMITMENT_STATUSES)[number];
  outstandingBalance?: string;
  lastUsedAt?: string;
  isAutomatic?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeCommitment = (commitment: Commitment) => ({
  id: commitment.id,
  householdId: commitment.householdId,
  accountId: commitment.accountId,
  type: commitment.type,
  name: commitment.name,
  amount: commitment.amount.toString(),
  billingFrequency: commitment.billingFrequency,
  nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
  status: commitment.status,
  provider: commitment.provider,
  policyNumber: commitment.policyNumber,
  insuredObject: commitment.insuredObject,
  sumInsured: commitment.sumInsured?.toString() ?? null,
  coverBreakdown: commitment.coverBreakdown,
  principal: commitment.principal?.toString() ?? null,
  outstandingBalance: commitment.outstandingBalance?.toString() ?? null,
  interestRate: commitment.interestRate?.toString() ?? null,
  termMonths: commitment.termMonths,
  isAutomatic: commitment.isAutomatic,
  lastUsedAt: commitment.lastUsedAt?.toISOString() ?? null,
  createdAt: commitment.createdAt.toISOString(),
  updatedAt: commitment.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const commitmentsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: ListCommitmentsQuery }>('/households/:householdId/commitments', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, querystring: listCommitmentsQuerySchema, response: { 200: { type: 'array', items: commitmentSchema } } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const commitments = await listCommitments(fastify.householdDatabase, request.params.householdId, request.query.status);
    return commitments.map(serializeCommitment);
  });

  fastify.get<{ Params: HouseholdParams; Querystring: UpcomingQuery }>('/households/:householdId/commitments/upcoming', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      querystring: upcomingQuerySchema,
      response: { 200: { type: 'array', items: { ...commitmentSchema, properties: { ...commitmentSchema.properties, daysUntilDue: { type: 'number' } }, required: [...commitmentSchema.required, 'daysUntilDue'] } } }
    }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const commitments = await listUpcomingCommitments(fastify.householdDatabase, request.params.householdId, request.query.withinDays);
    return commitments.map((commitment) => ({ ...serializeCommitment(commitment), daysUntilDue: commitment.daysUntilDue }));
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateCommitmentBody }>('/households/:householdId/commitments', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createCommitmentBodySchema, response: { 201: commitmentSchema } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const commitment = await createCommitment(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    return reply.code(201).send(serializeCommitment(commitment));
  });

  fastify.get<{ Params: CommitmentParams }>('/households/:householdId/commitments/:commitmentId', {
    onRequest: [fastify.authenticate],
    schema: { params: commitmentParamsSchema, response: { 200: commitmentSchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const commitment = await getCommitment(fastify.householdDatabase, request.params.householdId, request.params.commitmentId);
    if (!commitment) {
      throw fastify.httpErrors.notFound('Commitment not found');
    }
    return serializeCommitment(commitment);
  });

  fastify.patch<{ Params: CommitmentParams; Body: UpdateCommitmentBody }>('/households/:householdId/commitments/:commitmentId', {
    onRequest: [fastify.authenticate],
    schema: { params: commitmentParamsSchema, body: updateCommitmentBodySchema, response: { 200: commitmentSchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);
    const commitment = await updateCommitment(fastify.householdDatabase, request.params.householdId, request.params.commitmentId, request.body);
    return serializeCommitment(commitment);
  });

  /** Loan-only: the amortization schedule is always computed on read, never stored. */
  fastify.get<{ Params: CommitmentParams }>('/households/:householdId/commitments/:commitmentId/amortization-schedule', {
    onRequest: [fastify.authenticate],
    schema: { params: commitmentParamsSchema, response: { 200: amortizationScheduleResponseSchema } }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const commitment = await getCommitment(fastify.householdDatabase, request.params.householdId, request.params.commitmentId);
    if (!commitment) {
      throw fastify.httpErrors.notFound('Commitment not found');
    }
    if (commitment.type !== 'LOAN' || !commitment.principal || !commitment.interestRate || !commitment.termMonths) {
      throw fastify.httpErrors.badRequest('Commitment is not a fully specified loan');
    }

    return calculateAmortizationSchedule(Number(commitment.principal), Number(commitment.interestRate), commitment.termMonths);
  });
};
