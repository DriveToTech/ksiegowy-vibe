import type { FastifyPluginAsync } from 'fastify';
import { isValidNip } from '@ksiegowy/shared-utils';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { fetchGusCompanyByNip } from '../services/company-registry.service.js';

// ── JSON Schema definitions ─────────────────────────────────────────────────
// (contractors + contractor service rates)

const contractorSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    name: { type: 'string' },
    nip: { type: ['string', 'null'] },
    pesel: { type: ['string', 'null'] },
    addressLine1: { type: ['string', 'null'] },
    addressLine2: { type: ['string', 'null'] },
    countryCode: { type: 'string' },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    bankAccount: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    isActive: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id', 'companyId', 'name', 'nip', 'pesel',
    'addressLine1', 'addressLine2', 'countryCode',
    'email', 'phone', 'bankAccount', 'notes',
    'isActive', 'createdAt', 'updatedAt'
  ]
} as const;

const companyIdParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 }
  },
  required: ['companyId']
} as const;

const contractorParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 }
  },
  required: ['companyId', 'id']
} as const;

const createContractorBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1 },
    nip: { type: 'string' },
    pesel: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    countryCode: { type: 'string', default: 'PL' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    bankAccount: { type: 'string' },
    notes: { type: 'string' }
  }
} as const;

const patchContractorBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    nip: { type: 'string' },
    pesel: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: 'string' },
    countryCode: { type: 'string' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    bankAccount: { type: 'string' },
    notes: { type: 'string' },
    isActive: { type: 'boolean' }
  }
} as const;

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

interface CompanyIdParams {
  companyId: string;
}

interface ContractorParams {
  companyId: string;
  id: string;
}

interface CreateContractorBody {
  name: string;
  nip?: string;
  pesel?: string;
  addressLine1?: string;
  addressLine2?: string;
  countryCode?: string;
  email?: string;
  phone?: string;
  bankAccount?: string;
  notes?: string;
}

interface PatchContractorBody {
  name?: string;
  nip?: string;
  pesel?: string;
  addressLine1?: string;
  addressLine2?: string;
  countryCode?: string;
  email?: string;
  phone?: string;
  bankAccount?: string;
  notes?: string;
  isActive?: boolean;
}

interface RateParams { companyId: string; id: string; rid: string }
interface CreateRateBody { serviceTemplateId: string; unitNetPrice: string; currency?: string }
interface PatchRateBody { unitNetPrice?: string; currency?: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeContractor = (contractor: {
  id: string;
  companyId: string;
  name: string;
  nip: string | null;
  pesel: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  countryCode: string;
  email: string | null;
  phone: string | null;
  bankAccount: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: contractor.id,
  companyId: contractor.companyId,
  name: contractor.name,
  nip: contractor.nip,
  pesel: contractor.pesel,
  addressLine1: contractor.addressLine1,
  addressLine2: contractor.addressLine2,
  countryCode: contractor.countryCode,
  email: contractor.email,
  phone: contractor.phone,
  bankAccount: contractor.bankAccount,
  notes: contractor.notes,
  isActive: contractor.isActive,
  createdAt: contractor.createdAt.toISOString(),
  updatedAt: contractor.updatedAt.toISOString()
});

const assertCompanyAccess = (user: AccessTokenPayload, companyId: string, fastify: { httpErrors: { forbidden: (msg: string) => Error } }) => {
  const membership = user.companies.find((c) => c.id === companyId);
  if (!membership) {
    throw fastify.httpErrors.forbidden('Access denied');
  }
  return membership;
};

// ── Plugin ───────────────────────────────────────────────────────────────────

export const contractorsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * GET /companies/:companyId/contractors
   * Lists active contractors for the company.
   */
  fastify.get<{ Params: CompanyIdParams }>('/companies/:companyId/contractors', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyIdParamsSchema,
      response: {
        200: {
          type: 'array',
          items: contractorSchema
        }
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { companyId } = request.params;

    assertCompanyAccess(user, companyId, fastify);

    const contractors = await fastify.prisma.contractor.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' }
    });

    return contractors.map(serializeContractor);
  });

  /**
   * POST /companies/:companyId/contractors
   * Creates a new contractor. Validates NIP if provided.
   */
  fastify.post<{ Params: CompanyIdParams; Body: CreateContractorBody }>('/companies/:companyId/contractors', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyIdParamsSchema,
      body: createContractorBodySchema,
      response: {
        201: contractorSchema
      }
    }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    const { companyId } = request.params;
    const body = request.body;

    const membership = assertCompanyAccess(user, companyId, fastify);

    if (membership.role === 'VIEWER') {
      throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot create contractors');
    }

    if (body.nip !== undefined && body.nip.length > 0 && !isValidNip(body.nip)) {
      throw fastify.httpErrors.badRequest(`Invalid NIP: ${body.nip}`);
    }

    const contractor = await fastify.prisma.contractor.create({
      data: {
        companyId,
        name: body.name,
        nip: body.nip ?? null,
        pesel: body.pesel ?? null,
        addressLine1: body.addressLine1 ?? null,
        addressLine2: body.addressLine2 ?? null,
        countryCode: body.countryCode ?? 'PL',
        email: body.email ?? null,
        phone: body.phone ?? null,
        bankAccount: body.bankAccount ?? null,
        notes: body.notes ?? null
      }
    });

    return reply.code(201).send(serializeContractor(contractor));
  });

  /**
   * GET /companies/:companyId/contractors/:id
   * Returns a single contractor (active or inactive).
   */
  fastify.get<{ Params: ContractorParams }>('/companies/:companyId/contractors/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: contractorParamsSchema,
      response: {
        200: contractorSchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { companyId, id } = request.params;

    assertCompanyAccess(user, companyId, fastify);

    const contractor = await fastify.prisma.contractor.findUnique({
      where: { id }
    });

    if (!contractor || contractor.companyId !== companyId) {
      throw fastify.httpErrors.notFound('Contractor not found');
    }

    return serializeContractor(contractor);
  });

  /**
   * PATCH /companies/:companyId/contractors/:id
   * Updates contractor fields. Validates NIP if supplied.
   */
  fastify.patch<{ Params: ContractorParams; Body: PatchContractorBody }>('/companies/:companyId/contractors/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: contractorParamsSchema,
      body: patchContractorBodySchema,
      response: {
        200: contractorSchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { companyId, id } = request.params;
    const body = request.body;

    const membership = assertCompanyAccess(user, companyId, fastify);

    if (membership.role === 'VIEWER') {
      throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot update contractors');
    }

    if (body.nip !== undefined && body.nip.length > 0 && !isValidNip(body.nip)) {
      throw fastify.httpErrors.badRequest(`Invalid NIP: ${body.nip}`);
    }

    const existing = await fastify.prisma.contractor.findUnique({
      where: { id }
    });

    if (!existing || existing.companyId !== companyId) {
      throw fastify.httpErrors.notFound('Contractor not found');
    }

    // Build only-defined update payload
    const data: Record<string, string | boolean | null | undefined> = {};

    if (body.name !== undefined) data.name = body.name;
    if ('nip' in body) data.nip = body.nip ?? null;
    if ('pesel' in body) data.pesel = body.pesel ?? null;
    if ('addressLine1' in body) data.addressLine1 = body.addressLine1 ?? null;
    if ('addressLine2' in body) data.addressLine2 = body.addressLine2 ?? null;
    if (body.countryCode !== undefined) data.countryCode = body.countryCode;
    if ('email' in body) data.email = body.email ?? null;
    if ('phone' in body) data.phone = body.phone ?? null;
    if ('bankAccount' in body) data.bankAccount = body.bankAccount ?? null;
    if ('notes' in body) data.notes = body.notes ?? null;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    if (Object.keys(data).length === 0) {
      throw fastify.httpErrors.badRequest('No updatable fields provided');
    }

    const updated = await fastify.prisma.contractor.update({
      where: { id },
      data
    });

    return serializeContractor(updated);
  });

  /**
   * GET /companies/:companyId/contractors/gus-lookup?nip=XXXXXXXXXX
   * Looks up company data from the GUS BIR1 API by NIP.
   * Requires GUS_API_KEY environment variable.
   */
  fastify.get<{ Params: CompanyIdParams; Querystring: { nip?: string } }>(
    '/companies/:companyId/contractors/gus-lookup',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        querystring: {
          type: 'object',
          required: ['nip'],
          properties: { nip: { type: 'string', pattern: '^[0-9]{10}$' } }
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              nip: { type: 'string' },
              addressLine1: { type: 'string' }
            },
            required: ['name', 'nip', 'addressLine1']
          }
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { nip } = request.query as { nip: string };

      if (!user.companies.find((c) => c.id === companyId)) {
        throw fastify.httpErrors.forbidden('Access denied');
      }

      const apiKey = process.env['GUS_API_KEY'];
      if (!apiKey) {
        throw fastify.httpErrors.notImplemented('GUS_API_KEY is not configured');
      }

      return fetchGusCompanyByNip(nip, apiKey)
        .then((company) => ({
          name: company.name,
          nip: company.nip,
          addressLine1: [company.addressLine1, company.addressLine2].filter(Boolean).join(', '),
        }))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'GUS search failed';

          if (message === 'Invalid NIP') {
            throw fastify.httpErrors.badRequest(message);
          }

          if (message.includes('No GUS record found')) {
            throw fastify.httpErrors.notFound(message);
          }

          throw fastify.httpErrors.badGateway(message);
        });
    }
  );

  // ── Service rates ──────────────────────────────────────────────────────────

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
