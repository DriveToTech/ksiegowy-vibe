import type { FastifyPluginAsync } from 'fastify';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { fetchCompanyByNip } from '../services/company-registry.service.js';
import { encrypt } from '@ksiegowy/shared-utils';

// ── JSON Schema definitions ─────────────────────────────────────────────────

const companySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    nip: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    bankName: { type: ['string', 'null'] },
    bankAccount: { type: ['string', 'null'] },
    vatStatus: { type: 'string', enum: ['ACTIVE', 'EXEMPT', 'NO_VAT'] },
    ksefEnv: { type: 'string', enum: ['TEST', 'PRODUCTION'] },
    invoiceNumberPattern: { type: ['string', 'null'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  },
  required: [
    'id', 'name', 'nip', 'addressLine1', 'addressLine2',
    'email', 'phone', 'bankName', 'bankAccount',
    'vatStatus', 'ksefEnv', 'invoiceNumberPattern', 'createdAt', 'updatedAt'
  ]
} as const;

const companyParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 }
  },
  required: ['id']
} as const;

const companyLookupQuerySchema = {
  type: 'object',
  properties: {
    nip: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{10}$' }
  },
  required: ['nip']
} as const;

const companyLookupResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    nip: { type: 'string' },
    addressLine1: { type: 'string' },
    addressLine2: { type: ['string', 'null'] },
    vatStatus: { type: 'string', enum: ['ACTIVE', 'EXEMPT', 'NO_VAT'] }
  },
  required: ['name', 'nip', 'addressLine1', 'addressLine2', 'vatStatus']
} as const;

const patchCompanyBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1 },
    addressLine1: { type: 'string', minLength: 1 },
    addressLine2: { type: 'string' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    bankName: { type: 'string' },
    bankAccount: { type: 'string' },
    invoiceNumberPattern: { type: ['string', 'null'], minLength: 1, maxLength: 100 }
  }
} as const;

const createCompanyBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'nip', 'addressLine1'],
  properties: {
    name: { type: 'string', minLength: 1 },
    nip: { type: 'string', minLength: 10, maxLength: 10, pattern: '^[0-9]{10}$' },
    addressLine1: { type: 'string', minLength: 1 },
    addressLine2: { type: 'string' },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    bankName: { type: 'string' },
    bankAccount: { type: 'string' },
    vatStatus: { type: 'string', enum: ['ACTIVE', 'EXEMPT', 'NO_VAT'] },
    ksefEnv: { type: 'string', enum: ['TEST', 'PRODUCTION'] }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyParams {
  id: string;
}

interface CompanyLookupQuery {
  nip: string;
}

interface PatchCompanyBody {
  name?: string;
  addressLine1?: string;
  addressLine2?: string;
  email?: string;
  phone?: string;
  bankName?: string;
  bankAccount?: string;
  invoiceNumberPattern?: string | null;
}

interface CreateCompanyBody {
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2?: string;
  email?: string;
  phone?: string;
  bankName?: string;
  bankAccount?: string;
  vatStatus?: 'ACTIVE' | 'EXEMPT' | 'NO_VAT';
  ksefEnv?: 'TEST' | 'PRODUCTION';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const serializeCompany = (company: {
  id: string;
  name: string;
  nip: string;
  addressLine1: string;
  addressLine2: string | null;
  email: string | null;
  phone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  vatStatus: string;
  ksefEnv: string;
  invoiceNumberPattern: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: company.id,
  name: company.name,
  nip: company.nip,
  addressLine1: company.addressLine1,
  addressLine2: company.addressLine2,
  email: company.email,
  phone: company.phone,
  bankName: company.bankName,
  bankAccount: company.bankAccount,
  vatStatus: company.vatStatus,
  ksefEnv: company.ksefEnv,
  invoiceNumberPattern: company.invoiceNumberPattern,
  createdAt: company.createdAt.toISOString(),
  updatedAt: company.updatedAt.toISOString()
});

// ── Plugin ───────────────────────────────────────────────────────────────────

export const companiesRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  fastify.get<{ Querystring: CompanyLookupQuery }>('/companies/lookup', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: companyLookupQuerySchema,
      response: {
        200: companyLookupResponseSchema
      }
    }
  }, async (request) => {
    return fetchCompanyByNip(request.query.nip, {
      ...(process.env['GUS_API_KEY'] ? { gusApiKey: process.env['GUS_API_KEY'] } : {}),
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Company lookup failed';

      if (message === 'Invalid NIP') {
        throw fastify.httpErrors.badRequest(message);
      }

      if (message.includes('was not found')) {
        throw fastify.httpErrors.notFound(message);
      }

      throw fastify.httpErrors.badGateway(message);
    });
  });

  /**
   * GET /companies
   * Lists all companies the authenticated user is a member of.
   */
  fastify.get('/companies', {
    onRequest: [fastify.authenticate],
    schema: {
      response: {
        200: {
          type: 'array',
          items: companySchema
        }
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const companyIds = user.companies.map((c) => c.id);

    if (companyIds.length === 0) {
      return [];
    }

    const companies = await fastify.prisma.company.findMany({
      where: { id: { in: companyIds } },
      orderBy: { name: 'asc' }
    });

    return companies.map(serializeCompany);
  });

  /**
   * GET /companies/:id
   * Returns a single company the user is a member of.
   */
  fastify.get<{ Params: CompanyParams }>('/companies/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyParamsSchema,
      response: {
        200: companySchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { id } = request.params;

    const membership = user.companies.find((c) => c.id === id);
    if (!membership) {
      throw fastify.httpErrors.forbidden('Access denied');
    }

    const company = await fastify.prisma.company.findUnique({
      where: { id }
    });

    if (!company) {
      throw fastify.httpErrors.notFound('Company not found');
    }

    return serializeCompany(company);
  });

  /**
   * PATCH /companies/:id
   * Updates mutable company fields. Requires ADMIN or ACCOUNTANT role.
   * NIP and vatStatus are not patchable — those require manual DB changes.
   */
  fastify.patch<{ Params: CompanyParams; Body: PatchCompanyBody }>('/companies/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyParamsSchema,
      body: patchCompanyBodySchema,
      response: {
        200: companySchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { id } = request.params;

    const membership = user.companies.find((c) => c.id === id);
    if (!membership) {
      throw fastify.httpErrors.forbidden('Access denied');
    }

    if (membership.role === 'VIEWER') {
      throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot update company details');
    }

    const body = request.body;

    // Build only-defined update payload — undefined fields must not overwrite DB values
    const data: Record<string, string | null | undefined> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.addressLine1 !== undefined) data.addressLine1 = body.addressLine1;
    if ('addressLine2' in body) data.addressLine2 = body.addressLine2 ?? null;
    if ('email' in body) data.email = body.email ?? null;
    if ('phone' in body) data.phone = body.phone ?? null;
    if ('bankName' in body) data.bankName = body.bankName ?? null;
    if ('bankAccount' in body) data.bankAccount = body.bankAccount ?? null;
    if ('invoiceNumberPattern' in body) {
      if (body.invoiceNumberPattern !== null && !body.invoiceNumberPattern!.includes('{SEQ}')) {
        throw fastify.httpErrors.badRequest('Invoice number pattern must include the {SEQ} token');
      }
      data.invoiceNumberPattern = body.invoiceNumberPattern ?? null;
    }

    if (Object.keys(data).length === 0) {
      throw fastify.httpErrors.badRequest('No updatable fields provided');
    }

    const updated = await fastify.prisma.company.update({
      where: { id },
      data
    });

    return serializeCompany(updated);
  });

  /**
   * PATCH /companies/:id/ksef-settings
   * Saves the KSeF API token (encrypted) and environment for a company.
   * Requires ADMIN role.
   */
  fastify.patch<{ Params: CompanyParams; Body: { ksefToken: string; ksefEnv: 'TEST' | 'PRODUCTION' } }>(
    '/companies/:id/ksef-settings',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['ksefToken', 'ksefEnv'],
          additionalProperties: false,
          properties: {
            ksefToken: { type: 'string', minLength: 1 },
            ksefEnv: { type: 'string', enum: ['TEST', 'PRODUCTION'] }
          }
        },
        response: { 204: { type: 'null' } }
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { id } = request.params;

      const membership = user.companies.find((c) => c.id === id);
      if (!membership) throw fastify.httpErrors.forbidden('Access denied');
      if (membership.role !== 'ADMIN') throw fastify.httpErrors.forbidden('Only ADMIN can update KSeF settings');

      const encryptionKey = process.env['ENCRYPTION_KEY'];
      if (!encryptionKey) throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY is not configured');

      const { enc, iv } = encrypt(request.body.ksefToken, encryptionKey);

      await fastify.prisma.company.update({
        where: { id },
        data: { ksefTokenEnc: enc, ksefTokenIv: iv, ksefEnv: request.body.ksefEnv }
      });

      // Invalidate any existing session so the new token is picked up immediately.
      await fastify.prisma.ksefSession.deleteMany({ where: { companyId: id } });

      return reply.code(204).send();
    }
  );

  /**
   * POST /companies
   * Creates a new company and adds the authenticated user as ADMIN.
   */
  fastify.post<{ Body: CreateCompanyBody }>('/companies', {
    onRequest: [fastify.authenticate],
    schema: {
      body: createCompanyBodySchema,
      response: {
        201: companySchema
      }
    }
  }, async (request, reply) => {
    const user = request.user as AccessTokenPayload;
    const body = request.body;

    const existing = await fastify.prisma.company.findUnique({ where: { nip: body.nip } });
    if (existing) {
      throw fastify.httpErrors.conflict(`Company with NIP ${body.nip} already exists`);
    }

    const company = await fastify.prisma.company.create({
      data: {
        name: body.name,
        nip: body.nip,
        addressLine1: body.addressLine1,
        addressLine2: body.addressLine2 ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        bankName: body.bankName ?? null,
        bankAccount: body.bankAccount ?? null,
        vatStatus: body.vatStatus ?? 'ACTIVE',
        ksefEnv: body.ksefEnv ?? 'TEST',
        memberships: {
          create: { userId: user.sub, role: 'ADMIN' }
        }
      }
    });

    fastify.log.info({ companyId: company.id, userId: user.sub }, 'Company created');

    return reply.code(201).send(serializeCompany(company));
  });
};
