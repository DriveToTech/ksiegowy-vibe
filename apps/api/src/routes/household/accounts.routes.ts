import type { FastifyPluginAsync } from 'fastify';
import { createAccount, getVisibleAccount, listVisibleAccounts, updateAccount, type HouseholdAccountWithBalance } from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';

const ACCOUNT_TYPES = ['CURRENT', 'SAVINGS', 'CREDIT_CARD', 'CASH'] as const;
const ACCOUNT_VISIBILITIES = ['SHARED', 'PRIVATE'] as const;

// ── Schemas ──────────────────────────────────────────────────────────────────

export const accountSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    householdId: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string', enum: ACCOUNT_TYPES },
    accountNumberMask: { type: ['string', 'null'] },
    visibility: { type: 'string', enum: ACCOUNT_VISIBILITIES },
    ownerUserId: { type: ['string', 'null'] },
    openingBalance: { type: 'string' },
    creditLimit: { type: ['string', 'null'] },
    statementDay: { type: ['number', 'null'] },
    balance: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id', 'householdId', 'name', 'type', 'accountNumberMask', 'visibility', 'ownerUserId',
    'openingBalance', 'creditLimit', 'statementDay', 'balance', 'createdAt', 'updatedAt'
  ]
} as const;

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const accountParamsSchema = {
  type: 'object',
  properties: {
    householdId: { type: 'string', minLength: 1 },
    accountId: { type: 'string', minLength: 1 }
  },
  required: ['householdId', 'accountId']
} as const;

const createAccountBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'type'],
  properties: {
    name: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ACCOUNT_TYPES },
    accountNumberMask: { type: 'string' },
    visibility: { type: 'string', enum: ACCOUNT_VISIBILITIES },
    ownerUserId: { type: 'string' },
    openingBalance: { type: 'string' },
    creditLimit: { type: 'string' },
    statementDay: { type: 'number', minimum: 1, maximum: 31 }
  }
} as const;

const updateAccountBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    accountNumberMask: { type: ['string', 'null'] },
    creditLimit: { type: ['string', 'null'] },
    statementDay: { type: ['number', 'null'], minimum: 1, maximum: 31 }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams {
  householdId: string;
}

interface AccountParams {
  householdId: string;
  accountId: string;
}

interface CreateAccountBody {
  name: string;
  type: (typeof ACCOUNT_TYPES)[number];
  accountNumberMask?: string;
  visibility?: (typeof ACCOUNT_VISIBILITIES)[number];
  ownerUserId?: string;
  openingBalance?: string;
  creditLimit?: string;
  statementDay?: number;
}

interface UpdateAccountBody {
  name?: string;
  accountNumberMask?: string | null;
  creditLimit?: string | null;
  statementDay?: number | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export const serializeAccount = (account: HouseholdAccountWithBalance) => ({
  id: account.id,
  householdId: account.householdId,
  name: account.name,
  type: account.type,
  accountNumberMask: account.accountNumberMask,
  visibility: account.visibility,
  ownerUserId: account.ownerUserId,
  openingBalance: account.openingBalance.toString(),
  creditLimit: account.creditLimit?.toString() ?? null,
  statementDay: account.statementDay,
  balance: account.balance,
  createdAt: account.createdAt.toISOString(),
  updatedAt: account.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

/**
 * A dedicated GET /households/:id/accounts endpoint, distinct from the
 * dashboard aggregate — the household shell's nav rail and the AccountPicker
 * need balances on every page, not just the dashboard.
 */
export const accountsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams }>('/households/:householdId/accounts', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      response: { 200: { type: 'array', items: accountSchema } }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const accounts = await listVisibleAccounts(fastify.householdDatabase, request.params.householdId, user.sub);
    return accounts.map(serializeAccount);
  });

  fastify.post<{ Params: HouseholdParams; Body: CreateAccountBody }>('/households/:householdId/accounts', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      body: createAccountBodySchema,
      response: { 201: accountSchema }
    }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const account = await createAccount(fastify.householdDatabase, {
      householdId: request.params.householdId,
      ...request.body
    });

    const [withBalance] = await listVisibleAccounts(fastify.householdDatabase, request.params.householdId, user.sub).then(
      (accounts) => accounts.filter((candidate) => candidate.id === account.id)
    );

    return reply.code(201).send(serializeAccount(withBalance!));
  });

  fastify.get<{ Params: AccountParams }>('/households/:householdId/accounts/:accountId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: accountParamsSchema,
      response: { 200: accountSchema }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    const account = await getVisibleAccount(fastify.householdDatabase, request.params.householdId, user.sub, request.params.accountId);
    if (!account) {
      throw fastify.httpErrors.notFound('Account not found');
    }

    return serializeAccount(account);
  });

  fastify.patch<{ Params: AccountParams; Body: UpdateAccountBody }>('/households/:householdId/accounts/:accountId', {
    onRequest: [fastify.authenticate],
    schema: {
      params: accountParamsSchema,
      body: updateAccountBodySchema,
      response: { 200: accountSchema }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    await requireHouseholdMembership(fastify, request, request.params.householdId);

    await updateAccount(fastify.householdDatabase, request.params.householdId, request.params.accountId, request.body);

    const account = await getVisibleAccount(fastify.householdDatabase, request.params.householdId, user.sub, request.params.accountId);
    if (!account) {
      throw fastify.httpErrors.notFound('Account not found');
    }

    return serializeAccount(account);
  });
};
