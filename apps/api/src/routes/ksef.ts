import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';

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

      const invoices = await fastify.prisma.invoice.findMany({
        where: { companyId, ksefStatus: 'OFFLINE_QUEUED' },
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          invoiceNumber: true,
          issueDate: true,
          totalGross: true,
          currency: true,
          ksefStatus: true,
          updatedAt: true
        }
      });

      return invoices.map((inv: (typeof invoices)[number]) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate.toISOString().slice(0, 10),
        totalGross: inv.totalGross.toString(),
        currency: inv.currency,
        ksefStatus: inv.ksefStatus,
        updatedAt: inv.updatedAt.toISOString()
      }));
    }
  );
};
