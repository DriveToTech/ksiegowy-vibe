import type { FastifyPluginAsync } from 'fastify';
import { calculateSafeToSpend, createEnvelope, deleteEnvelope, listEnvelopesWithSpend, updateEnvelope, type BudgetEnvelopeWithSpend } from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

export const envelopeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    categoryId: { type: 'string' },
    categoryName: { type: 'string' },
    monthlyLimit: { type: 'string' },
    spent: { type: 'string' },
    remaining: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'householdId', 'categoryId', 'categoryName', 'monthlyLimit', 'spent', 'remaining', 'createdAt', 'updatedAt']
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const envelopeParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    envelopeId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'envelopeId']
} as const;

const monthQuerySchema = {
  type: 'object',
  properties: { month: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } }
} as const;

const createEnvelopeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['categoryId', 'monthlyLimit'],
  properties: {
    categoryId: { type: 'string', minLength: 1 },
    monthlyLimit: { type: 'string', minLength: 1 }
  }
} as const;

const updateEnvelopeBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['monthlyLimit'],
  properties: { monthlyLimit: { type: 'string', minLength: 1 } }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams { householdId: string }
interface EnvelopeParams { householdId: string; envelopeId: string }
interface MonthQuery { month?: string }
interface CreateEnvelopeBody { categoryId: string; monthlyLimit: string }
interface UpdateEnvelopeBody { monthlyLimit: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

export const serializeEnvelope = (envelope: BudgetEnvelopeWithSpend) => ({
  id: envelope.id,
  householdId: envelope.householdId,
  categoryId: envelope.categoryId,
  categoryName: envelope.categoryName,
  monthlyLimit: envelope.monthlyLimit.toString(),
  spent: envelope.spent,
  remaining: envelope.remaining,
  createdAt: envelope.createdAt.toISOString(),
  updatedAt: envelope.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const envelopesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: MonthQuery }>('/households/:householdId/envelopes', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, querystring: monthQuerySchema, response: { 200: { type: 'array', items: envelopeSchema } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const envelopes = await listEnvelopesWithSpend(fastify.householdDatabase, request.params.householdId, user.sub, request.query.month);
    return envelopes.map(serializeEnvelope);
  });

  fastify.get<{ Params: HouseholdParams; Querystring: MonthQuery }>('/households/:householdId/envelopes/safe-to-spend', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, querystring: monthQuerySchema, response: { 200: { type: 'object', additionalProperties: false, properties: { safeToSpend: { type: 'string' } }, required: ['safeToSpend'] } } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const safeToSpend = await calculateSafeToSpend(fastify.householdDatabase, request.params.householdId, user.sub, request.query.month);
    return { safeToSpend };
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateEnvelopeBody }>('/households/:householdId/envelopes', {
    onRequest: [fastify.authenticate],
    schema: { params: householdParamsSchema, body: createEnvelopeBodySchema, response: { 201: envelopeSchema } }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    await createEnvelope(fastify.householdDatabase, { householdId: request.params.householdId, ...request.body });
    const [envelope] = await listEnvelopesWithSpend(fastify.householdDatabase, request.params.householdId, user.sub).then(
      (envelopes) => envelopes.filter((candidate) => candidate.categoryId === request.body.categoryId)
    );

    return reply.code(201).send(serializeEnvelope(envelope!));
  });

  fastify.patch<{ Params: EnvelopeParams; Body: UpdateEnvelopeBody }>('/households/:householdId/envelopes/:envelopeId', {
    onRequest: [fastify.authenticate],
    schema: { params: envelopeParamsSchema, body: updateEnvelopeBodySchema, response: { 200: envelopeSchema } }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const updated = await updateEnvelope(fastify.householdDatabase, request.params.householdId, request.params.envelopeId, request.body.monthlyLimit);
    const [envelope] = await listEnvelopesWithSpend(fastify.householdDatabase, request.params.householdId, user.sub).then(
      (envelopes) => envelopes.filter((candidate) => candidate.id === updated.id)
    );

    return serializeEnvelope(envelope!);
  });

  fastify.delete<{ Params: EnvelopeParams }>('/households/:householdId/envelopes/:envelopeId', {
    onRequest: [fastify.authenticate],
    schema: { params: envelopeParamsSchema, response: { 204: { type: 'null' } } }
  }, async (request, reply) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    await deleteEnvelope(fastify.householdDatabase, request.params.householdId, request.params.envelopeId);
    return reply.code(204).send();
  });
};
