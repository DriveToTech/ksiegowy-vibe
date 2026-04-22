import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';

// ── JSON Schema definitions ─────────────────────────────────────────────────

const serviceTemplateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    name: { type: 'string' },
    unit: { type: 'string' },
    vatRate: { type: 'string' },
    description: { type: ['string', 'null'] },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  required: ['id', 'companyId', 'name', 'unit', 'vatRate', 'description', 'isActive', 'createdAt', 'updatedAt'],
} as const;

const companyIdParamsSchema = {
  type: 'object',
  properties: { companyId: { type: 'string', minLength: 1 } },
  required: ['companyId'],
} as const;

const templateParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    tid: { type: 'string', minLength: 1 },
  },
  required: ['companyId', 'tid'],
} as const;

const createBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    unit: { type: 'string', minLength: 1 },
    vatRate: { type: 'string', enum: ['23', '8', '5', '0', 'zw', 'np', 'oo'] },
    description: { type: 'string' },
  },
} as const;

const patchBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    unit: { type: 'string', minLength: 1 },
    vatRate: { type: 'string', enum: ['23', '8', '5', '0', 'zw', 'np', 'oo'] },
    description: { type: 'string' },
    isActive: { type: 'boolean' },
  },
} as const;

const listQuerySchema = {
  type: 'object',
  properties: { includeInactive: { type: 'string', enum: ['true', 'false'] } },
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyIdParams { companyId: string }
interface TemplateParams { companyId: string; tid: string }
interface CreateBody { name: string; unit?: string; vatRate?: string; description?: string }
interface PatchBody { name?: string; unit?: string; vatRate?: string; description?: string; isActive?: boolean }
interface ListQuery { includeInactive?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeTemplate = (t: {
  id: string; companyId: string; name: string; unit: string; vatRate: string;
  description: string | null; isActive: boolean; createdAt: Date; updatedAt: Date;
}) => ({
  id: t.id,
  companyId: t.companyId,
  name: t.name,
  unit: t.unit,
  vatRate: t.vatRate,
  description: t.description,
  isActive: t.isActive,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
});

const assertCompanyAccess = (user: AccessTokenPayload, companyId: string, fastify: { httpErrors: { forbidden: (msg: string) => Error } }) => {
  const membership = user.companies.find((c) => c.id === companyId);
  if (!membership) throw fastify.httpErrors.forbidden('Access denied');
  return membership;
};

// ── Plugin ───────────────────────────────────────────────────────────────────

export const serviceTemplatesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/service-templates
   * Lists service templates. By default only active ones.
   */
  fastify.get<{ Params: CompanyIdParams; Querystring: ListQuery }>(
    '/companies/:companyId/service-templates',
    {
      onRequest: [fastify.authenticate],
      schema: { params: companyIdParamsSchema, querystring: listQuerySchema, response: { 200: { type: 'array', items: serviceTemplateSchema } } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const includeInactive = request.query.includeInactive === 'true';

      assertCompanyAccess(user, companyId, fastify);

      const templates = await fastify.prisma.serviceTemplate.findMany({
        where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
        orderBy: { name: 'asc' },
      });

      return templates.map(serializeTemplate);
    },
  );

  /**
   * POST /companies/:companyId/service-templates
   * Creates a new service template.
   */
  fastify.post<{ Params: CompanyIdParams; Body: CreateBody }>(
    '/companies/:companyId/service-templates',
    {
      onRequest: [fastify.authenticate],
      schema: { params: companyIdParamsSchema, body: createBodySchema, response: { 201: serviceTemplateSchema } },
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const template = await fastify.prisma.serviceTemplate.create({
        data: {
          companyId,
          name: body.name,
          unit: body.unit ?? 'szt.',
          vatRate: body.vatRate ?? '23',
          description: body.description ?? null,
        },
      });

      return reply.code(201).send(serializeTemplate(template));
    },
  );

  /**
   * PATCH /companies/:companyId/service-templates/:tid
   * Updates a service template. Soft-delete by setting isActive: false.
   */
  fastify.patch<{ Params: TemplateParams; Body: PatchBody }>(
    '/companies/:companyId/service-templates/:tid',
    {
      onRequest: [fastify.authenticate],
      schema: { params: templateParamsSchema, body: patchBodySchema, response: { 200: serviceTemplateSchema } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, tid } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const existing = await fastify.prisma.serviceTemplate.findUnique({ where: { id: tid } });
      if (!existing || existing.companyId !== companyId) throw fastify.httpErrors.notFound('Service template not found');

      const data: Record<string, string | boolean | null | undefined> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.unit !== undefined) data.unit = body.unit;
      if (body.vatRate !== undefined) data.vatRate = body.vatRate;
      if ('description' in body) data.description = body.description ?? null;
      if (body.isActive !== undefined) data.isActive = body.isActive;

      if (Object.keys(data).length === 0) throw fastify.httpErrors.badRequest('No updatable fields provided');

      const updated = await fastify.prisma.serviceTemplate.update({ where: { id: tid }, data });
      return serializeTemplate(updated);
    },
  );

  /**
   * DELETE /companies/:companyId/service-templates/:tid
   * Soft-deletes a service template (sets isActive: false).
   */
  fastify.delete<{ Params: TemplateParams }>(
    '/companies/:companyId/service-templates/:tid',
    {
      onRequest: [fastify.authenticate],
      schema: { params: templateParamsSchema, response: { 204: { type: 'null' } } },
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, tid } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const existing = await fastify.prisma.serviceTemplate.findUnique({ where: { id: tid } });
      if (!existing || existing.companyId !== companyId) throw fastify.httpErrors.notFound('Service template not found');

      await fastify.prisma.serviceTemplate.update({ where: { id: tid }, data: { isActive: false } });
      return reply.code(204).send();
    },
  );
};
