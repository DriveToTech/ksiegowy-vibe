import type { FastifyPluginAsync } from 'fastify';
import { isValidNip } from '@ksiegowy/shared-utils';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import {
  KSEF_ENVIRONMENT_HEADER_SCHEMA,
  requireExplicitKsefEnvironment,
} from '../lib/ksef-environment.js';
import { buildContractorSummary, sumTurnoverByContractor } from '../services/contractor-financials.service.js';

// ── JSON Schema definitions ─────────────────────────────────────────────────

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

const contractorWithTurnoverSchema = {
  ...contractorSchema,
  properties: {
    ...contractorSchema.properties,
    turnover: { type: 'string' },
    turnoverYear: { type: 'integer' }
  },
  required: [...contractorSchema.required, 'turnover', 'turnoverYear']
} as const;

export const companyIdParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 }
  },
  required: ['companyId']
} as const;

export const contractorParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 }
  },
  required: ['companyId', 'id']
} as const;

const listContractorsQuerystringSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['active', 'inactive', 'all'], default: 'active' },
    year: { type: 'integer' }
  }
} as const;

const contractorSummaryQuerystringSchema = {
  type: 'object',
  properties: {
    year: { type: 'integer' }
  }
} as const;

const contractorSummarySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contractorId: { type: 'string' },
    year: { type: 'integer' },
    turnover: { type: 'string' },
    paidThisYear: { type: 'string' },
    outstanding: { type: 'string' },
    recentDocuments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          invoiceNumber: { type: ['string', 'null'] },
          invoiceType: { type: 'string', enum: ['VAT', 'KOR', 'ZAL', 'ROZ', 'UPR'] },
          issueDate: { type: 'string' },
          totalGross: { type: 'string' }
        },
        required: ['id', 'invoiceNumber', 'invoiceType', 'issueDate', 'totalGross']
      }
    }
  },
  required: ['contractorId', 'year', 'turnover', 'paidThisYear', 'outstanding', 'recentDocuments']
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

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompanyIdParams {
  companyId: string;
}

export interface ContractorParams {
  companyId: string;
  id: string;
}

interface ListContractorsQuery {
  status?: 'active' | 'inactive' | 'all';
  year?: number;
}

interface ContractorSummaryQuery {
  year?: number;
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

export const assertCompanyAccess = (user: AccessTokenPayload, companyId: string, fastify: { httpErrors: { forbidden: (msg: string) => Error } }) => {
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
   * Lists contractors for the company (active by default), with each
   * contractor's year-to-date gross turnover attached.
   */
  fastify.get<{ Params: CompanyIdParams; Querystring: ListContractorsQuery }>('/companies/:companyId/contractors', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyIdParamsSchema,
      headers: KSEF_ENVIRONMENT_HEADER_SCHEMA,
      querystring: listContractorsQuerystringSchema,
      response: {
        200: {
          type: 'array',
          items: contractorWithTurnoverSchema
        }
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { companyId } = request.params;
    const { status = 'active', year = new Date().getUTCFullYear() } = request.query;

    assertCompanyAccess(user, companyId, fastify);

    const environment = requireExplicitKsefEnvironment(request);
    const isActiveFilter = status === 'all' ? {} : { isActive: status === 'active' };

    const [contractors, turnoverByContractor] = await Promise.all([
      fastify.prisma.contractor.findMany({
        where: { companyId, ...isActiveFilter },
        orderBy: { name: 'asc' }
      }),
      sumTurnoverByContractor(fastify.prisma, { companyId, environment, year })
    ]);

    return contractors.map((contractor) => ({
      ...serializeContractor(contractor),
      turnover: (turnoverByContractor.get(contractor.id)?.toFixed(2)) ?? '0.00',
      turnoverYear: year
    }));
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
   * GET /companies/:companyId/contractors/:id/summary
   * Returns year-scoped turnover/paid, all-time outstanding balance, and the
   * most recent documents for a single contractor.
   */
  fastify.get<{ Params: ContractorParams; Querystring: ContractorSummaryQuery }>(
    '/companies/:companyId/contractors/:id/summary',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: contractorParamsSchema,
        headers: KSEF_ENVIRONMENT_HEADER_SCHEMA,
        querystring: contractorSummaryQuerystringSchema,
        response: { 200: contractorSummarySchema }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;
      const { year = new Date().getUTCFullYear() } = request.query;

      assertCompanyAccess(user, companyId, fastify);

      const contractor = await fastify.prisma.contractor.findUnique({ where: { id } });
      if (!contractor || contractor.companyId !== companyId) {
        throw fastify.httpErrors.notFound('Contractor not found');
      }

      const environment = requireExplicitKsefEnvironment(request);

      return buildContractorSummary(fastify.prisma, { companyId, contractorId: id, environment, year });
    }
  );
};
