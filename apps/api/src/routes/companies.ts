import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Prisma } from '@prisma/client';
import type { AccessTokenPayload } from '../lib/auth-config.js';
import { requireExplicitKsefEnvironment } from '../lib/ksef-environment.js';
import { fetchCompanyByNip } from '../services/company-registry.service.js';
import { encrypt } from '@ksiegowy/shared-utils';

const KSEF_ENVIRONMENTS = ['TEST', 'PRODUCTION'] as const;

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

const companyKsefCredentialParamsSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', minLength: 1 },
    environment: { type: 'string', enum: KSEF_ENVIRONMENTS }
  },
  required: ['id', 'environment']
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

const companyKsefSettingsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    defaultEnvironment: { type: 'string', enum: KSEF_ENVIRONMENTS },
    credentials: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          environment: { type: 'string', enum: KSEF_ENVIRONMENTS },
          hasToken: { type: 'boolean' }
        },
        required: ['environment', 'hasToken']
      }
    }
  },
  required: ['defaultEnvironment', 'credentials']
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyParams {
  id: string;
}

interface CompanyKsefCredentialParams {
  id: string;
  environment: 'TEST' | 'PRODUCTION';
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

interface CompanyKsefSettingsBody {
  ksefToken: string;
}

interface CompanyKsefDefaultEnvironmentBody {
  defaultEnvironment: 'TEST' | 'PRODUCTION';
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

const assertAdminCompanyAccess = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: Parameters<FastifyPluginAsync>[0]
): void => {
  const membership = user.companies.find((company) => company.id === companyId);

  if (!membership) {
    throw fastify.httpErrors.forbidden('Access denied');
  }

  if (membership.role !== 'ADMIN') {
    throw fastify.httpErrors.forbidden('Only ADMIN can update KSeF settings');
  }
};

const readEncryptionKey = (fastify: Parameters<FastifyPluginAsync>[0]): string => {
  const encryptionKey = process.env['ENCRYPTION_KEY'];

  if (!encryptionKey) {
    throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY is not configured');
  }

  return encryptionKey;
};

const requireMatchingKsefEnvironment = (
  request: FastifyRequest,
  expectedEnvironment: 'TEST' | 'PRODUCTION',
): void => {
  const selectedEnvironment = requireExplicitKsefEnvironment(request);

  if (selectedEnvironment !== expectedEnvironment) {
    throw request.server.httpErrors.badRequest(
      `x-ksef-environment must match the requested environment ${expectedEnvironment}`
    );
  }
};

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
   * GET /companies/:id/ksef-settings
   * Returns the default KSeF environment and per-environment token presence.
   * Requires company membership. Token values are never returned.
   */
  fastify.get<{ Params: CompanyParams }>('/companies/:id/ksef-settings', {
    onRequest: [fastify.authenticate],
    schema: {
      params: companyParamsSchema,
      response: {
        200: companyKsefSettingsSchema
      }
    }
  }, async (request) => {
    const user = request.user as AccessTokenPayload;
    const { id } = request.params;

    if (!user.companies.some((company) => company.id === id)) {
      throw fastify.httpErrors.forbidden('Access denied');
    }

    const [company, credentials] = await Promise.all([
      fastify.prisma.company.findUnique({
        where: { id },
        select: { ksefEnv: true }
      }),
      fastify.prisma.companyKsefCredential.findMany({
        where: { companyId: id },
        select: { environment: true }
      })
    ]);

    if (!company) {
      throw fastify.httpErrors.notFound('Company not found');
    }

    const environmentsWithToken = new Set(credentials.map((credential: { environment: 'TEST' | 'PRODUCTION' }) => credential.environment));

    return {
      defaultEnvironment: company.ksefEnv,
      credentials: KSEF_ENVIRONMENTS.map((environment) => ({
        environment,
        hasToken: environmentsWithToken.has(environment)
      }))
    };
  });

  /**
   * PUT /companies/:id/ksef-credentials/:environment
   * Saves the KSeF API token for one environment.
   * Requires ADMIN role.
   */
  fastify.put<{ Params: CompanyKsefCredentialParams; Body: CompanyKsefSettingsBody }>(
    '/companies/:id/ksef-credentials/:environment',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyKsefCredentialParamsSchema,
        body: {
          type: 'object',
          required: ['ksefToken'],
          additionalProperties: false,
          properties: {
            ksefToken: { type: 'string', minLength: 1 }
          }
        },
        response: { 204: { type: 'null' } }
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { id, environment } = request.params;

      assertAdminCompanyAccess(user, id, fastify);
      requireMatchingKsefEnvironment(request, environment);

      const encryptionKey = readEncryptionKey(fastify);
      const { enc, iv } = encrypt(request.body.ksefToken, encryptionKey);

      await fastify.prisma.$transaction(async (transactionClient: Prisma.TransactionClient) => {
        await transactionClient.companyKsefCredential.upsert({
          where: { companyId_environment: { companyId: id, environment } },
          create: { companyId: id, environment, tokenEnc: enc, tokenIv: iv },
          update: { tokenEnc: enc, tokenIv: iv }
        });

        const company = await transactionClient.company.findUnique({
          where: { id },
          select: { ksefEnv: true }
        });

        if (!company) {
          throw fastify.httpErrors.notFound('Company not found');
        }

        if (company.ksefEnv === environment) {
          await transactionClient.company.update({
            where: { id },
            data: { ksefTokenEnc: enc, ksefTokenIv: iv }
          });
        }

        await transactionClient.ksefSession.deleteMany({ where: { companyId: id, environment } });
      });

      return reply.code(204).send();
    }
  );

  /**
   * PATCH /companies/:id/ksef-default-environment
   * Updates the company default KSeF environment without overwriting other environment credentials.
   * Requires ADMIN role.
   */
  fastify.patch<{ Params: CompanyParams; Body: CompanyKsefDefaultEnvironmentBody }>(
    '/companies/:id/ksef-default-environment',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyParamsSchema,
        body: {
          type: 'object',
          required: ['defaultEnvironment'],
          additionalProperties: false,
          properties: {
            defaultEnvironment: { type: 'string', enum: KSEF_ENVIRONMENTS }
          }
        },
        response: { 204: { type: 'null' } }
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { id } = request.params;
      const { defaultEnvironment } = request.body;

      assertAdminCompanyAccess(user, id, fastify);
      requireMatchingKsefEnvironment(request, defaultEnvironment);

      const credential = await fastify.prisma.companyKsefCredential.findUnique({
        where: { companyId_environment: { companyId: id, environment: defaultEnvironment } },
        select: { tokenEnc: true, tokenIv: true }
      });

      const updatedCompany = await fastify.prisma.company.update({
        where: { id },
        data: {
          ksefEnv: defaultEnvironment,
          ksefTokenEnc: credential?.tokenEnc ?? null,
          ksefTokenIv: credential?.tokenIv ?? null,
        }
      });

      if (!updatedCompany) {
        throw fastify.httpErrors.notFound('Company not found');
      }

      return reply.code(204).send();
    }
  );

  /**
   * PATCH /companies/:id/ksef-settings
   * Compatibility endpoint for the current UI.
   * Saves the KSeF API token for the selected environment and makes it the company default.
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

      assertAdminCompanyAccess(user, id, fastify);
      requireMatchingKsefEnvironment(request, request.body.ksefEnv);

      const encryptionKey = readEncryptionKey(fastify);

      const { enc, iv } = encrypt(request.body.ksefToken, encryptionKey);

      await fastify.prisma.$transaction(async (transactionClient: Prisma.TransactionClient) => {
        await transactionClient.companyKsefCredential.upsert({
          where: { companyId_environment: { companyId: id, environment: request.body.ksefEnv } },
          create: {
            companyId: id,
            environment: request.body.ksefEnv,
            tokenEnc: enc,
            tokenIv: iv,
          },
          update: { tokenEnc: enc, tokenIv: iv }
        });

        await transactionClient.company.update({
          where: { id },
          data: { ksefTokenEnc: enc, ksefTokenIv: iv, ksefEnv: request.body.ksefEnv }
        });

        await transactionClient.ksefSession.deleteMany({
          where: { companyId: id, environment: request.body.ksefEnv }
        });
      });

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
