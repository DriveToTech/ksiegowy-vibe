import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { assertCompanyAccess, contractorParamsSchema, type ContractorParams } from './contractors.js';

// ── JSON Schema definitions ─────────────────────────────────────────────────

const serviceRateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    contractorId: { type: 'string' },
    serviceTemplateId: { type: 'string' },
    unitNetPrice: { type: 'string' },
    currency: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    serviceTemplate: {
      type: 'object',
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        unit: { type: 'string' },
        vatRate: { type: 'string' },
        description: { type: ['string', 'null'] },
      },
      required: ['id', 'name', 'unit', 'vatRate', 'description'],
    },
  },
  required: ['id', 'contractorId', 'serviceTemplateId', 'unitNetPrice', 'currency', 'createdAt', 'updatedAt', 'serviceTemplate'],
} as const;

const rateParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 },
    rid: { type: 'string', minLength: 1 },
  },
  required: ['companyId', 'id', 'rid'],
} as const;

const createRateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceTemplateId', 'unitNetPrice'],
  properties: {
    serviceTemplateId: { type: 'string', minLength: 1 },
    unitNetPrice: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    currency: { type: 'string', default: 'PLN' },
  },
} as const;

const patchRateBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    unitNetPrice: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    currency: { type: 'string' },
  },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface RateParams { companyId: string; id: string; rid: string }
interface CreateRateBody { serviceTemplateId: string; unitNetPrice: string; currency?: string }
interface PatchRateBody { unitNetPrice?: string; currency?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeRate = (rate: {
  id: string;
  contractorId: string;
  serviceTemplateId: string;
  unitNetPrice: { toString(): string };
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  serviceTemplate: { id: string; name: string; unit: string; vatRate: string; description: string | null };
}) => ({
  id: rate.id,
  contractorId: rate.contractorId,
  serviceTemplateId: rate.serviceTemplateId,
  unitNetPrice: rate.unitNetPrice.toString(),
  currency: rate.currency,
  createdAt: rate.createdAt.toISOString(),
  updatedAt: rate.updatedAt.toISOString(),
  serviceTemplate: {
    id: rate.serviceTemplate.id,
    name: rate.serviceTemplate.name,
    unit: rate.serviceTemplate.unit,
    vatRate: rate.serviceTemplate.vatRate,
    description: rate.serviceTemplate.description,
  },
});

// ── Plugin ───────────────────────────────────────────────────────────────────
// Rate overrides per contractor + service template. Split out from
// contractors.ts to keep contractor CRUD/financials focused (single concern).

export const contractorServiceRatesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/contractors/:id/service-rates
   * Lists all rate overrides for a contractor (with template info).
   */
  fastify.get<{ Params: ContractorParams }>(
    '/companies/:companyId/contractors/:id/service-rates',
    {
      onRequest: [fastify.authenticate],
      schema: { params: contractorParamsSchema, response: { 200: { type: 'array', items: serviceRateSchema } } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertCompanyAccess(user, companyId, fastify);

      const contractor = await fastify.prisma.contractor.findUnique({ where: { id } });
      if (!contractor || contractor.companyId !== companyId) throw fastify.httpErrors.notFound('Contractor not found');

      const rates = await fastify.prisma.contractorServiceRate.findMany({
        where: { contractorId: id },
        include: { serviceTemplate: { select: { id: true, name: true, unit: true, vatRate: true, description: true } } },
        orderBy: { serviceTemplate: { name: 'asc' } },
      });

      return rates.map(serializeRate);
    },
  );

  /**
   * POST /companies/:companyId/contractors/:id/service-rates
   * Creates or upserts a rate override for a contractor + template pair.
   */
  fastify.post<{ Params: ContractorParams; Body: CreateRateBody }>(
    '/companies/:companyId/contractors/:id/service-rates',
    {
      onRequest: [fastify.authenticate],
      schema: { params: contractorParamsSchema, body: createRateBodySchema, response: { 201: serviceRateSchema } },
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const contractor = await fastify.prisma.contractor.findUnique({ where: { id } });
      if (!contractor || contractor.companyId !== companyId) throw fastify.httpErrors.notFound('Contractor not found');

      const template = await fastify.prisma.serviceTemplate.findUnique({ where: { id: body.serviceTemplateId } });
      if (!template || template.companyId !== companyId) throw fastify.httpErrors.notFound('Service template not found');

      const rate = await fastify.prisma.contractorServiceRate.upsert({
        where: { contractorId_serviceTemplateId: { contractorId: id, serviceTemplateId: body.serviceTemplateId } },
        create: { contractorId: id, serviceTemplateId: body.serviceTemplateId, unitNetPrice: body.unitNetPrice, currency: body.currency ?? 'PLN' },
        update: { unitNetPrice: body.unitNetPrice, currency: body.currency ?? 'PLN' },
        include: { serviceTemplate: { select: { id: true, name: true, unit: true, vatRate: true, description: true } } },
      });

      return reply.code(201).send(serializeRate(rate));
    },
  );

  /**
   * PATCH /companies/:companyId/contractors/:id/service-rates/:rid
   * Updates unitNetPrice and/or currency for an existing rate override.
   */
  fastify.patch<{ Params: RateParams; Body: PatchRateBody }>(
    '/companies/:companyId/contractors/:id/service-rates/:rid',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rateParamsSchema, body: patchRateBodySchema, response: { 200: serviceRateSchema } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id, rid } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const contractor = await fastify.prisma.contractor.findUnique({ where: { id } });
      if (!contractor || contractor.companyId !== companyId) throw fastify.httpErrors.notFound('Contractor not found');

      const existing = await fastify.prisma.contractorServiceRate.findUnique({ where: { id: rid } });
      if (!existing || existing.contractorId !== id) throw fastify.httpErrors.notFound('Rate not found');

      const data: Record<string, string> = {};
      if (body.unitNetPrice !== undefined) data.unitNetPrice = body.unitNetPrice;
      if (body.currency !== undefined) data.currency = body.currency;

      if (Object.keys(data).length === 0) throw fastify.httpErrors.badRequest('No updatable fields provided');

      const updated = await fastify.prisma.contractorServiceRate.update({
        where: { id: rid },
        data,
        include: { serviceTemplate: { select: { id: true, name: true, unit: true, vatRate: true, description: true } } },
      });

      return serializeRate(updated);
    },
  );

  /**
   * DELETE /companies/:companyId/contractors/:id/service-rates/:rid
   * Deletes a rate override.
   */
  fastify.delete<{ Params: RateParams }>(
    '/companies/:companyId/contractors/:id/service-rates/:rid',
    {
      onRequest: [fastify.authenticate],
      schema: { params: rateParamsSchema, response: { 204: { type: 'null' } } },
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id, rid } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const contractor = await fastify.prisma.contractor.findUnique({ where: { id } });
      if (!contractor || contractor.companyId !== companyId) throw fastify.httpErrors.notFound('Contractor not found');

      const existing = await fastify.prisma.contractorServiceRate.findUnique({ where: { id: rid } });
      if (!existing || existing.contractorId !== id) throw fastify.httpErrors.notFound('Rate not found');

      await fastify.prisma.contractorServiceRate.delete({ where: { id: rid } });
      return reply.code(204).send();
    },
  );
};
