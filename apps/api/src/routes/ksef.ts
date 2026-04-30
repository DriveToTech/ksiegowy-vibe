import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { resolveEffectiveKsefEnvironment } from '../lib/ksef-environment.js';

const companyParamsSchema = {
  type: 'object',
  properties: { companyId: { type: 'string', minLength: 1 } },
  required: ['companyId']
} as const;

interface CompanyParams { companyId: string }

export const ksefRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/ksef/queue
   * Lists invoices with ksefStatus=OFFLINE_QUEUED for the company.
   */
  fastify.get<{ Params: CompanyParams }>(
    '/companies/:companyId/ksef/queue',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyParamsSchema,
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                invoiceNumber: { type: ['string', 'null'] },
                issueDate: { type: 'string' },
                totalGross: { type: 'string' },
                currency: { type: 'string' },
                ksefStatus: { type: 'string' },
                updatedAt: { type: 'string' }
              },
              required: ['id', 'invoiceNumber', 'issueDate', 'totalGross', 'currency', 'ksefStatus', 'updatedAt']
            }
          }
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;

      if (!user.companies.find((c) => c.id === companyId)) {
        throw fastify.httpErrors.forbidden('Access denied');
      }

    const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

    const queuedStates = await fastify.prisma.invoiceKsefState.findMany({
      where: {
        environment: selectedEnvironment,
        status: 'OFFLINE_QUEUED',
        invoice: { companyId }
      },
      orderBy: { updatedAt: 'asc' },
      select: {
        status: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            issueDate: true,
            totalGross: true,
            currency: true,
            updatedAt: true,
          }
        }
      }
    });

    return queuedStates.map((state) => ({
      id: state.invoice.id,
      invoiceNumber: state.invoice.invoiceNumber,
      issueDate: state.invoice.issueDate.toISOString().slice(0, 10),
      totalGross: state.invoice.totalGross.toString(),
      currency: state.invoice.currency,
      ksefStatus: state.status,
      updatedAt: state.invoice.updatedAt.toISOString()
    }));
    }
  );
};
