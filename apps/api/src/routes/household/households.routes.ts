import type { FastifyPluginAsync } from 'fastify';
import { createHousehold, getHousehold, listHouseholdMembers, listHouseholdsForUser } from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const householdSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    currency: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: ['id', 'name', 'currency', 'createdAt', 'updatedAt']
} as const;

const householdMembershipSummarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    householdId: { type: 'string' },
    role: { type: 'string', enum: ['OWNER', 'MEMBER'] },
    name: { type: 'string' }
  },
  required: ['householdId', 'role', 'name']
} as const;

const householdMemberSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    userId: { type: 'string' },
    role: { type: 'string', enum: ['OWNER', 'MEMBER'] },
    displayName: { type: ['string', 'null'] },
    userEmail: { type: 'string' }
  },
  required: ['userId', 'role', 'displayName', 'userEmail']
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const createHouseholdBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    currency: { type: 'string', minLength: 3, maxLength: 3 }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams {
  householdId: string;
}

interface CreateHouseholdBody {
  name: string;
  currency?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeHousehold = (household: { id: string; name: string; currency: string; createdAt: Date; updatedAt: Date }) => ({
  id: household.id,
  name: household.name,
  currency: household.currency,
  createdAt: household.createdAt.toISOString(),
  updatedAt: household.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const householdsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /households
   * Lists every household the authenticated user belongs to, with role and name.
   */
  fastify.get('/households', {
    onRequest: [fastify.authenticate],
    schema: {
      response: { 200: { type: 'array', items: householdMembershipSummarySchema } }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    return listHouseholdsForUser(fastify.householdDatabase, user.sub);
  });

  /**
   * POST /households
   * Creates a household, seeds its default categories, and makes the
   * authenticated user its OWNER — all atomically.
   */
  fastify.post<{ Body: CreateHouseholdBody }>('/households', {
    onRequest: [fastify.authenticate],
    schema: {
      body: createHouseholdBodySchema,
      response: { 201: householdSchema }
    }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;

    const { household } = await createHousehold(fastify.householdDatabase, {
      name: request.body.name,
      ...(request.body.currency ? { currency: request.body.currency } : {}),
      ownerUserId: user.sub,
      ownerUserEmail: user.email,
      ...(user.name ? { ownerDisplayName: user.name } : {})
    });

    fastify.log.info({ householdId: household.id, userId: user.sub }, 'Household created');

    return reply.code(201).send(serializeHousehold(household));
  });

  /**
   * GET /households/:householdId
   * Returns a single household the user is a member of.
   */
  fastify.get<{ Params: HouseholdParams }>('/households/:householdId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      response: { 200: householdSchema }
    }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const household = await getHousehold(fastify.householdDatabase, request.params.householdId);
    if (!household) {
      throw fastify.httpErrors.notFound('Household not found');
    }

    return serializeHousehold(household);
  });

  /**
   * GET /households/:householdId/members
   * Lists every member of a household the user belongs to, with role and
   * identity snapshot.
   */
  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/members', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      response: { 200: { type: 'array', items: householdMemberSchema } }
    }
  }, async (request) => {
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    return listHouseholdMembers(fastify.householdDatabase, request.params.householdId);
  });
};
