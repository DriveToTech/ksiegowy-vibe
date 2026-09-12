import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { resolveEffectiveKsefEnvironment } from '../lib/ksef-environment.js';
import { buildDashboardSummary } from '../services/dashboard-summary.service.js';

const companyIdParamsSchema = {
  type: 'object',
  properties: { companyId: { type: 'string', minLength: 1 } },
  required: ['companyId'],
} as const;

const moneySchema = { type: 'string' } as const;

const dashboardSummarySchema = {
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      properties: {
        environment: { type: 'string', enum: ['TEST', 'PRODUCTION'] },
        totalInvoices: { type: 'integer' },
        contractorCount: { type: 'integer' },
        ksefCounts: {
          type: 'object',
          additionalProperties: false,
          properties: {
            accepted: { type: 'integer' },
            pending: { type: 'integer' },
            rejected: { type: 'integer' },
            notSubmitted: { type: 'integer' },
          },
          required: ['accepted', 'pending', 'rejected', 'notSubmitted'],
        },
        salesByMonth: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              year: { type: 'integer' },
              month: { type: 'integer', minimum: 1, maximum: 12 },
              gross: moneySchema,
              vat: moneySchema,
              invoiceCount: { type: 'integer' },
            },
            required: ['year', 'month', 'gross', 'vat', 'invoiceCount'],
          },
        },
        currentMonth: {
          type: 'object',
          additionalProperties: false,
          properties: {
            gross: moneySchema,
            vat: moneySchema,
            invoiceCount: { type: 'integer' },
          },
          required: ['gross', 'vat', 'invoiceCount'],
        },
        attention: {
          type: 'object',
          additionalProperties: false,
          properties: {
            rejected: { type: 'integer' },
            notSubmitted: { type: 'integer' },
            incoming: { type: 'integer' },
          },
          required: ['rejected', 'notSubmitted', 'incoming'],
        },
        recentInvoices: { type: 'array' },
      },
      required: [
        'environment', 'totalInvoices', 'contractorCount', 'ksefCounts',
        'salesByMonth', 'currentMonth', 'attention', 'recentInvoices',
      ],
    },
  },
} as const;

export const dashboardSummaryRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Params: { companyId: string } }>(
    '/companies/:companyId/dashboard-summary',
    {
      onRequest: [fastify.authenticate],
      schema: { params: companyIdParamsSchema, ...dashboardSummarySchema },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      if (!user.companies.some((company) => company.id === companyId)) {
        throw fastify.httpErrors.forbidden('Access denied');
      }

      const environment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);
      return buildDashboardSummary(fastify.prisma, { companyId, environment });
    },
  );
};
