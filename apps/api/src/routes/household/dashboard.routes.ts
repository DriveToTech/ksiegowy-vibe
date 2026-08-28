import type { FastifyPluginAsync } from 'fastify';
import {
  calculateMoneySummary,
  calculateSafeToSpend,
  getMonthlyInOutSummary,
  listEnvelopesWithSpend,
  listUpcomingCommitments,
  listVisibleAccounts
} from '@ksiegowy/household-service';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { requireHouseholdMembership } from './household-membership-guard.js';
import { accountSchema, serializeAccount } from './accounts.routes.js';
import { envelopeSchema, serializeEnvelope } from './envelopes.routes.js';

// ── Schemas ──────────────────────────────────────────────────────────────────

const householdParamsSchema = {
  type: 'object',
  properties: { householdId: { type: 'string', minLength: 1 } },
  required: ['householdId']
} as const;

const monthQuerySchema = {
  type: 'object',
  properties: { month: { type: 'string', pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$' } }
} as const;

const upcomingCommitmentSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    type: { type: 'string' },
    amount: { type: 'string' },
    nextDueDate: { type: 'string', format: 'date' },
    daysUntilDue: { type: 'number' }
  },
  required: ['id', 'name', 'type', 'amount', 'nextDueDate', 'daysUntilDue']
} as const;

const monthlyInOutEntrySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    month: { type: 'string' },
    income: { type: 'string' },
    expense: { type: 'string' }
  },
  required: ['month', 'income', 'expense']
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface HouseholdParams { householdId: string }
interface MonthQuery { month?: string }

// ── Plugin ───────────────────────────────────────────────────────────────────

/**
 * One aggregating endpoint — composes accounts summary, safe-to-spend,
 * envelopes, upcoming commitments, and the 6-month in/out chart in one round
 * trip, per CLAUDE.md's "minimize database round trips" guidance. Still a
 * thin controller: no business logic here, just concurrent calls into the
 * package's already-existing service functions, the money-summary numbers
 * derived from that same data by calculateMoneySummary, and one combined
 * response reusing the same serializers as the accounts/envelopes endpoints.
 */
export const dashboardRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: HouseholdParams; Querystring: MonthQuery }>('/households/:householdId/dashboard', {
    onRequest: [fastify.authenticate],
    schema: {
      params: householdParamsSchema,
      querystring: monthQuerySchema,
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          properties: {
            accounts: { type: 'array', items: accountSchema },
            safeToSpend: { type: 'string' },
            moneyIn: { type: 'string' },
            moneyOut: { type: 'string' },
            netWorth: { type: 'string' },
            netWorthChangePercent: { type: 'string' },
            savingsRatePercent: { type: 'string' },
            savingsAmountThisMonth: { type: 'string' },
            envelopes: { type: 'array', items: envelopeSchema },
            upcomingCommitments: { type: 'array', items: upcomingCommitmentSchema },
            monthlyInOut: { type: 'array', items: monthlyInOutEntrySchema }
          },
          required: [
            'accounts', 'safeToSpend', 'moneyIn', 'moneyOut', 'netWorth', 'netWorthChangePercent',
            'savingsRatePercent', 'savingsAmountThisMonth', 'envelopes', 'upcomingCommitments', 'monthlyInOut'
          ]
        }
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { householdId } = request.params;
    await requireHouseholdMembership(fastify, request, householdId);

    const householdDatabase = fastify.householdDatabase;

    const [accounts, safeToSpend, envelopes, upcomingCommitments, monthlyInOut] = await Promise.all([
      listVisibleAccounts(householdDatabase, householdId, user.sub),
      calculateSafeToSpend(householdDatabase, householdId, user.sub, request.query.month),
      listEnvelopesWithSpend(householdDatabase, householdId, user.sub, request.query.month),
      listUpcomingCommitments(householdDatabase, householdId),
      getMonthlyInOutSummary(householdDatabase, householdId, user.sub, 6, request.query.month)
    ]);

    return {
      accounts: accounts.map(serializeAccount),
      safeToSpend,
      ...calculateMoneySummary(accounts, monthlyInOut),
      envelopes: envelopes.map(serializeEnvelope),
      upcomingCommitments: upcomingCommitments.map((commitment) => ({
        id: commitment.id,
        name: commitment.name,
        type: commitment.type,
        amount: commitment.amount.toString(),
        nextDueDate: commitment.nextDueDate.toISOString().slice(0, 10),
        daysUntilDue: commitment.daysUntilDue
      })),
      monthlyInOut
    };
  });
};
