import type { FastifyPluginAsync } from 'fastify';
import { Resend } from 'resend';
import type { KsefEnvironment } from '@prisma/client';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { resolveEffectiveKsefEnvironment } from '../../lib/ksef-environment.js';
import {
  createInvoiceDraft,
  issueInvoice,
  type CreateInvoiceDraftInput,
  type DraftLineInput
} from '../../services/invoice.service.js';
import { buildIssuedInvoiceDataForKsefSubmission } from '../../services/invoice-ksef-submission.service.js';
import { submitInvoiceToKsef, pollKsefSubmissionStatus } from '../../services/ksef.service.js';
import { saveFile, readFile } from '../../services/storage/local-fs.js';
import { triggerCompanyBackupAfterInvoiceIssued } from '../../services/backup/company-backup-policy.js';
import { calculateInvoiceTotals } from '@ksiegowy/fa3-xml';
import type { InvoiceLineInput, VatRate } from '@ksiegowy/types';

// ── JSON Schema definitions ─────────────────────────────────────────────────

const invoiceLineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['position', 'name', 'quantity', 'unitNetPrice', 'vatRate'],
  properties: {
    position: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
    unit: { type: 'string' },
    quantity: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    unitNetPrice: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    vatRate: { type: 'string', enum: ['23', '8', '5', '0', 'zw', 'np', 'oo'] }
  }
} as const;

const invoiceLineResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    position: { type: 'integer' },
    name: { type: 'string' },
    unit: { type: ['string', 'null'] },
    quantity: { type: 'string' },
    unitNetPrice: { type: 'string' },
    vatRate: { type: 'string' },
    netValue: { type: 'string' },
    vatValue: { type: 'string' },
    grossValue: { type: 'string' }
  },
  required: ['id', 'position', 'name', 'unit', 'quantity', 'unitNetPrice', 'vatRate', 'netValue', 'vatValue', 'grossValue']
} as const;

const vatBreakdownSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    vatRate: { type: 'string' },
    netAmount: { type: 'string' },
    vatAmount: { type: 'string' }
  },
  required: ['id', 'vatRate', 'netAmount', 'vatAmount']
} as const;

const invoiceResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    environment: { type: 'string', enum: ['TEST', 'PRODUCTION'] },
    contractorId: { type: ['string', 'null'] },
    invoiceNumber: { type: ['string', 'null'] },
    status: { type: 'string' },
    invoiceType: { type: 'string' },
    issueDate: { type: 'string' },
    saleDate: { type: ['string', 'null'] },
    placeOfIssue: { type: 'string' },
    sellerName: { type: ['string', 'null'] },
    sellerNip: { type: ['string', 'null'] },
    buyerName: { type: ['string', 'null'] },
    buyerNip: { type: ['string', 'null'] },
    totalNet: { type: 'string' },
    totalVat: { type: 'string' },
    totalGross: { type: 'string' },
    paymentReceived: { type: 'string' },
    paymentMethod: { type: 'string' },
    paymentDueDate: { type: ['string', 'null'] },
    currency: { type: 'string' },
    notes: { type: ['string', 'null'] },
    correctionReason: { type: ['string', 'null'] },
    correctionImpactType: { type: ['string', 'null'] },
    correctedInvoice: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        invoiceNumber: { type: ['string', 'null'] },
        issueDate: { type: 'string' },
        ksefReference: { type: ['string', 'null'] }
      },
      required: ['id', 'invoiceNumber', 'issueDate', 'ksefReference']
    },
    ksefStatus: { type: 'string' },
    ksefReference: { type: ['string', 'null'] },
    issuedAt: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    lines: { type: 'array', items: invoiceLineResponseSchema },
    vatBreakdown: { type: 'array', items: vatBreakdownSchema }
  },
  required: [
    'id', 'companyId', 'contractorId', 'invoiceNumber', 'status', 'invoiceType',
    'environment',
    'issueDate', 'saleDate', 'placeOfIssue', 'sellerName', 'sellerNip',
    'buyerName', 'buyerNip', 'totalNet', 'totalVat', 'totalGross', 'paymentReceived',
    'paymentMethod', 'paymentDueDate', 'currency', 'notes',
    'correctionReason', 'correctionImpactType', 'correctedInvoice',
    'ksefStatus', 'ksefReference', 'issuedAt', 'createdAt', 'updatedAt',
    'lines', 'vatBreakdown'
  ]
} as const;

const invoiceListItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    environment: { type: 'string', enum: ['TEST', 'PRODUCTION'] },
    contractorId: { type: ['string', 'null'] },
    invoiceNumber: { type: ['string', 'null'] },
    status: { type: 'string' },
    invoiceType: { type: 'string' },
    issueDate: { type: 'string' },
    totalNet: { type: 'string' },
    totalVat: { type: 'string' },
    totalGross: { type: 'string' },
    currency: { type: 'string' },
    ksefStatus: { type: 'string' },
    issuedAt: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    contractor: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        nip: { type: ['string', 'null'] }
      },
      required: ['id', 'name', 'nip']
    }
  },
  required: [
    'id', 'companyId', 'contractorId', 'invoiceNumber', 'status', 'invoiceType',
    'environment',
    'issueDate', 'totalNet', 'totalVat', 'totalGross', 'currency',
    'ksefStatus', 'issuedAt', 'createdAt', 'updatedAt', 'contractor'
  ]
} as const;

const companyIdParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 }
  },
  required: ['companyId']
} as const;

const invoiceParamsSchema = {
  type: 'object',
  properties: {
    companyId: { type: 'string', minLength: 1 },
    id: { type: 'string', minLength: 1 }
  },
  required: ['companyId', 'id']
} as const;

const listQuerySchema = {
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['DRAFT', 'ISSUED', 'CANCELLED']
    },
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
  }
} as const;

const createDraftBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['issueDate', 'lines'],
  properties: {
    contractorId: { type: 'string', minLength: 1 },
    issueDate: { type: 'string', format: 'date' },
    saleDate: { type: 'string', format: 'date' },
    paymentDueDate: { type: 'string', format: 'date' },
    paymentMethod: { type: 'string', enum: ['BANK_TRANSFER', 'CASH', 'CARD', 'OTHER'] },
    currency: { type: 'string', default: 'PLN' },
    notes: { type: 'string' },
    lines: {
      type: 'array',
      minItems: 1,
      items: invoiceLineSchema
    }
  }
} as const;

const ksefStatusResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: ['accepted', 'rejected', 'pending'] },
    ksefReferenceNumber: { type: 'string' }
  },
  required: ['status']
} as const;

const submitKsefResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    referenceNumber: { type: 'string' },
    submissionId: { type: 'string' },
    ksefReference: { type: 'string' }
  },
  required: ['referenceNumber', 'submissionId']
} as const;

const recordPaymentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['amount'],
  properties: {
    amount: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    receivedAt: { type: 'string', format: 'date' }
  }
} as const;

const createCorrectionBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reason: { type: 'string', minLength: 1 },
    impactType: { type: 'string', enum: ['1', '2', '3'] }
  }
} as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface CompanyIdParams {
  companyId: string;
}

interface InvoiceParams {
  companyId: string;
  id: string;
}

interface RecordPaymentBody {
  amount: string;
  receivedAt?: string;
}

interface CreateCorrectionBody {
  reason?: string;
  impactType?: '1' | '2' | '3';
}

interface ListQuerystring {
  status?: 'DRAFT' | 'ISSUED' | 'CANCELLED';
  page?: number;
  limit?: number;
}

interface CreateDraftBody {
  contractorId?: string;
  issueDate: string;
  saleDate?: string;
  paymentDueDate?: string;
  paymentMethod?: 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';
  currency?: string;
  notes?: string;
  lines: Array<{
    position: number;
    name: string;
    unit?: string;
    quantity: string;
    unitNetPrice: string;
    vatRate: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const toKsefStatusApi = (dbStatus: string): 'not_submitted' | 'pending' | 'accepted' | 'rejected' => {
  if (dbStatus === 'ACCEPTED') return 'accepted';
  if (dbStatus === 'REJECTED') return 'rejected';
  if (dbStatus === 'SUBMITTED' || dbStatus === 'QUEUED' || dbStatus === 'OFFLINE_QUEUED') return 'pending';
  return 'not_submitted';
};

const assertCompanyAccess = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: { httpErrors: { forbidden: (msg: string) => Error } }
) => {
  const membership = user.companies.find((c) => c.id === companyId);
  if (!membership) {
    throw fastify.httpErrors.forbidden('Access denied');
  }
  return membership;
};

const assertInvoiceEnvironmentAccess = <T extends { companyId: string; environment: KsefEnvironment }>(
  invoice: T | null,
  companyId: string,
  selectedEnvironment: KsefEnvironment,
  fastify: { httpErrors: { notFound: (msg: string) => Error } }
): T => {
  if (!invoice || invoice.companyId !== companyId || invoice.environment !== selectedEnvironment) {
    throw fastify.httpErrors.notFound('Invoice not found');
  }

  return invoice;
};

export const buildInvoiceKsefStateInclude = (selectedEnvironment: KsefEnvironment) => ({
  where: { environment: selectedEnvironment },
  select: {
    status: true,
    ksefReference: true,
  },
});

export const resolveInvoiceKsefState = (invoice: {
  ksefStates?: Array<{ status: string; ksefReference: string | null }>;
}): { status: string; ksefReference: string | null } => {
  const invoiceKsefState = invoice.ksefStates?.[0];

  return {
    status: invoiceKsefState?.status ?? 'NOT_SENT',
    ksefReference: invoiceKsefState?.ksefReference ?? null,
  };
};

const buildInvoiceDetailInclude = (selectedEnvironment: KsefEnvironment) => ({
  lines: { orderBy: { position: 'asc' as const } },
  vatBreakdown: true,
  correctedInvoice: { select: { id: true, invoiceNumber: true, issueDate: true, ksefReference: true, ksefStates: buildInvoiceKsefStateInclude(selectedEnvironment) } },
  ksefStates: buildInvoiceKsefStateInclude(selectedEnvironment),
});

const serializeInvoice = (invoice: {
  id: string;
  companyId: string;
  environment: KsefEnvironment;
  contractorId: string | null;
  invoiceNumber: string | null;
  status: string;
  invoiceType: string;
  issueDate: Date;
  saleDate: Date | null;
  placeOfIssue: string;
  sellerName: string | null;
  sellerNip: string | null;
  buyerName: string | null;
  buyerNip: string | null;
  totalNet: { toString(): string };
  totalVat: { toString(): string };
  totalGross: { toString(): string };
  paymentReceived: { toString(): string };
  paymentMethod: string;
  paymentDueDate: Date | null;
  currency: string;
  notes: string | null;
  correctionReason: string | null;
  correctionImpactType: string | null;
  correctedInvoice?: { id: string; invoiceNumber: string | null; issueDate: Date; ksefReference: string | null; ksefStates?: Array<{ status: string; ksefReference: string | null }> } | null;
  ksefStates?: Array<{ status: string; ksefReference: string | null }>;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lines: Array<{
    id: string;
    position: number;
    name: string;
    unit: string | null;
    quantity: { toString(): string };
    unitNetPrice: { toString(): string };
    vatRate: string;
    netValue: { toString(): string };
    vatValue: { toString(): string };
    grossValue: { toString(): string };
  }>;
  vatBreakdown: Array<{
    id: string;
    vatRate: string;
    netAmount: { toString(): string };
    vatAmount: { toString(): string };
  }>;
}) => {
  const invoiceKsefState = resolveInvoiceKsefState(invoice);

  return {
    id: invoice.id,
    companyId: invoice.companyId,
    environment: invoice.environment,
    contractorId: invoice.contractorId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    invoiceType: invoice.invoiceType,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    saleDate: invoice.saleDate ? invoice.saleDate.toISOString().slice(0, 10) : null,
    placeOfIssue: invoice.placeOfIssue,
    sellerName: invoice.sellerName,
    sellerNip: invoice.sellerNip,
    buyerName: invoice.buyerName,
    buyerNip: invoice.buyerNip,
    totalNet: invoice.totalNet.toString(),
    totalVat: invoice.totalVat.toString(),
    totalGross: invoice.totalGross.toString(),
    paymentReceived: invoice.paymentReceived.toString(),
    paymentMethod: invoice.paymentMethod,
    paymentDueDate: invoice.paymentDueDate ? invoice.paymentDueDate.toISOString().slice(0, 10) : null,
    currency: invoice.currency,
    notes: invoice.notes,
    correctionReason: invoice.correctionReason,
    correctionImpactType: invoice.correctionImpactType,
    correctedInvoice: invoice.correctedInvoice
      ? {
          id: invoice.correctedInvoice.id,
          invoiceNumber: invoice.correctedInvoice.invoiceNumber,
          issueDate: invoice.correctedInvoice.issueDate.toISOString().slice(0, 10),
          ksefReference: resolveInvoiceKsefState(invoice.correctedInvoice).ksefReference
        }
      : null,
    ksefStatus: toKsefStatusApi(invoiceKsefState.status),
    ksefReference: invoiceKsefState.ksefReference,
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    lines: invoice.lines.map((l) => ({
      id: l.id,
      position: l.position,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity.toString(),
      unitNetPrice: l.unitNetPrice.toString(),
      vatRate: l.vatRate,
      netValue: l.netValue.toString(),
      vatValue: l.vatValue.toString(),
      grossValue: l.grossValue.toString()
    })),
    vatBreakdown: invoice.vatBreakdown.map((b) => ({
      id: b.id,
      vatRate: b.vatRate,
      netAmount: b.netAmount.toString(),
      vatAmount: b.vatAmount.toString()
    }))
  };
};

const serializeInvoiceListItem = (invoice: {
  id: string;
  companyId: string;
  environment: KsefEnvironment;
  contractorId: string | null;
  invoiceNumber: string | null;
  status: string;
  invoiceType: string;
  issueDate: Date;
  totalNet: { toString(): string };
  totalVat: { toString(): string };
  totalGross: { toString(): string };
  currency: string;
  ksefStates?: Array<{ status: string; ksefReference: string | null }>;
  issuedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  contractor: { id: string; name: string; nip: string | null } | null;
}) => {
  const invoiceKsefState = resolveInvoiceKsefState(invoice);

  return {
    id: invoice.id,
    companyId: invoice.companyId,
    environment: invoice.environment,
    contractorId: invoice.contractorId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    invoiceType: invoice.invoiceType,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    totalNet: invoice.totalNet.toString(),
    totalVat: invoice.totalVat.toString(),
    totalGross: invoice.totalGross.toString(),
    currency: invoice.currency,
    ksefStatus: toKsefStatusApi(invoiceKsefState.status),
    issuedAt: invoice.issuedAt ? invoice.issuedAt.toISOString() : null,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    contractor: invoice.contractor
  };
};

// ── Plugin ───────────────────────────────────────────────────────────────────

export const outgoingInvoiceRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const storageBase = process.env['STORAGE_BASE_PATH'] ?? './storage';

  /**
   * GET /companies/:companyId/invoices
   * Lists invoices with optional status filter and pagination.
   */
  fastify.get<{ Params: CompanyIdParams; Querystring: ListQuerystring }>(
    '/companies/:companyId/invoices',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        querystring: listQuerySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              data: { type: 'array', items: invoiceListItemSchema },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' }
            },
            required: ['data', 'total', 'page', 'limit']
          }
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { status, page = 1, limit = 20 } = request.query;

      assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const where = {
        companyId,
        environment: selectedEnvironment,
        ...(status ? { status } : {})
      };

      const [total, invoices] = await Promise.all([
        fastify.prisma.invoice.count({ where }),
        fastify.prisma.invoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            companyId: true,
            environment: true,
            contractorId: true,
            invoiceNumber: true,
            status: true,
            invoiceType: true,
            issueDate: true,
            totalNet: true,
            totalVat: true,
            totalGross: true,
            currency: true,
            ksefStates: buildInvoiceKsefStateInclude(selectedEnvironment),
            issuedAt: true,
            createdAt: true,
            updatedAt: true,
            contractor: { select: { id: true, name: true, nip: true } }
          }
        })
      ]);

      return {
        data: invoices.map(serializeInvoiceListItem),
        total,
        page,
        limit
      };
    }
  );

  /**
   * POST /companies/:companyId/invoices
   * Creates a draft invoice.
   */
  fastify.post<{ Params: CompanyIdParams; Body: CreateDraftBody }>(
    '/companies/:companyId/invoices',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: companyIdParamsSchema,
        body: createDraftBodySchema,
        response: {
          201: invoiceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot create invoices');
      }

      const input: CreateInvoiceDraftInput = {
        companyId,
        environment: selectedEnvironment,
        ...(body.contractorId !== undefined ? { contractorId: body.contractorId } : {}),
        issueDate: body.issueDate,
        ...(body.saleDate !== undefined ? { saleDate: body.saleDate } : {}),
        ...(body.paymentDueDate !== undefined ? { paymentDueDate: body.paymentDueDate } : {}),
        ...(body.paymentMethod !== undefined ? { paymentMethod: body.paymentMethod } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        lines: body.lines.map((line) => ({
          position: line.position,
          name: line.name,
          ...(line.unit !== undefined ? { unit: line.unit } : {}),
          quantity: line.quantity,
          unitNetPrice: line.unitNetPrice,
          vatRate: line.vatRate as VatRate
        } satisfies DraftLineInput))
      };

      const invoice = await createInvoiceDraft(fastify.prisma, input);

      const createdInvoice = await fastify.prisma.invoice.findUnique({
        where: { id: invoice.id },
        include: buildInvoiceDetailInclude(selectedEnvironment)
      });

      if (!createdInvoice) {
        throw fastify.httpErrors.notFound('Invoice not found after creation');
      }

      return reply.code(201).send(serializeInvoice(createdInvoice));
    }
  );

  /**
   * PUT /companies/:companyId/invoices/:id
   * Updates a DRAFT invoice (lines, dates, contractor, payment info, notes).
   * Recalculates totals and replaces all lines and VAT breakdown.
   */
  fastify.put<{ Params: InvoiceParams; Body: CreateDraftBody }>(
    '/companies/:companyId/invoices/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        body: createDraftBodySchema,
        response: {
          200: invoiceResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;
      const body = request.body;

      const membership = assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);
      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot edit invoices');
      }

      const existing = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({ where: { id } }),
        companyId,
        selectedEnvironment,
        fastify,
      );
      if (existing.status !== 'DRAFT') {
        throw fastify.httpErrors.conflict(`Only DRAFT invoices can be edited (current status: ${existing.status})`);
      }

      const lines: InvoiceLineInput[] = body.lines.map((l) => ({
        description: l.name,
        quantity: l.quantity,
        unit: l.unit ?? 'szt',
        unitNetPrice: l.unitNetPrice,
        vatRate: l.vatRate as VatRate
      }));

      const calculated = calculateInvoiceTotals({
        invoiceNumber: 'DRAFT',
        issueDate: body.issueDate,
        currency: 'PLN',
        seller: { name: '', nip: '', addressLine1: '' },
        buyer: { name: '', nip: '', addressLine1: '' },
        lines,
        totalNet: '0',
        totalVat: '0',
        totalGross: '0'
      });

      const updated = await fastify.prisma.$transaction(async (tx) => {
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceVatBreakdown.deleteMany({ where: { invoiceId: id } });

        return tx.invoice.update({
          where: { id },
          data: {
            contractorId: body.contractorId ?? null,
            issueDate: new Date(body.issueDate),
            saleDate: body.saleDate ? new Date(body.saleDate) : null,
            paymentDueDate: body.paymentDueDate ? new Date(body.paymentDueDate) : null,
            paymentMethod: body.paymentMethod ?? 'BANK_TRANSFER',
            currency: body.currency ?? 'PLN',
            notes: body.notes ?? null,
            totalNet: calculated.totals.net,
            totalVat: calculated.totals.vat,
            totalGross: calculated.totals.gross,
            lines: {
              create: body.lines.map((l, index) => {
                const calc = calculated.lines[index]!;
                return {
                  position: l.position ?? index + 1,
                  name: l.name,
                  unit: l.unit ?? 'szt',
                  quantity: calc.quantity,
                  unitNetPrice: calc.unitNetPrice,
                  vatRate: l.vatRate,
                  netValue: calc.net,
                  vatValue: calc.vat,
                  grossValue: calc.gross
                };
              })
            },
            vatBreakdown: {
              create: calculated.breakdown.map((b) => ({
                vatRate: b.vatRate,
                netAmount: b.net,
                vatAmount: b.vat
              }))
            }
          },
          include: {
            ...buildInvoiceDetailInclude(selectedEnvironment)
          }
        });
      });

      fastify.log.info({ invoiceId: id, companyId }, 'Draft invoice updated');

      return serializeInvoice(updated);
    }
  );

  /**
   * GET /companies/:companyId/invoices/:id
   * Returns a single invoice with lines and vatBreakdown.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: invoiceResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const invoice = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: buildInvoiceDetailInclude(selectedEnvironment)
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      return serializeInvoice(invoice);
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/issue
   * Transitions DRAFT → ISSUED: assigns invoice number, generates PDF + XML,
   * saves both files to storage, creates FileRecord rows.
   */
  fastify.post<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/issue',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: invoiceResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot issue invoices');
      }

      assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          select: { companyId: true, environment: true }
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      let result;
      try {
        result = await issueInvoice(fastify.prisma, id, companyId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) throw fastify.httpErrors.notFound(msg);
        if (msg.includes('not in DRAFT')) throw fastify.httpErrors.conflict(msg);
        if (msg.includes('must have')) throw fastify.httpErrors.badRequest(msg);
        throw fastify.httpErrors.internalServerError(msg);
      }

      const { invoice, pdfBuffer, xmlString, pdfChecksum, xmlChecksum } = result;
      const issueDate = invoice.issueDate;

      // Persist PDF
      await saveFile(fastify.prisma, {
        companyId,
        invoiceId: id,
        type: 'outgoing_pdf',
        ext: 'pdf',
        mimeType: 'application/pdf',
        data: pdfBuffer,
        storageBase,
        date: issueDate
      });

      // Persist XML
      await saveFile(fastify.prisma, {
        companyId,
        invoiceId: id,
        type: 'outgoing_xml',
        ext: 'xml',
        mimeType: 'application/xml',
        data: Buffer.from(xmlString, 'utf-8'),
        storageBase,
        date: issueDate
      });

      void triggerCompanyBackupAfterInvoiceIssued(
        fastify.prisma,
        fastify.log,
        storageBase,
        companyId,
        id
      );

      fastify.log.info({
        invoiceId: id,
        companyId,
        invoiceNumber: invoice.invoiceNumber,
        pdfChecksum,
        xmlChecksum
      }, 'Invoice issued and files persisted');

      const issuedInvoice = await fastify.prisma.invoice.findUnique({
        where: { id },
        include: buildInvoiceDetailInclude(selectedEnvironment)
      });

      if (!issuedInvoice) {
        throw fastify.httpErrors.notFound('Invoice not found after issuing');
      }

      return serializeInvoice(issuedInvoice);
    }
  );

  /**
   * GET /companies/:companyId/invoices/:id/pdf
   * Streams the PDF file for the invoice.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/pdf',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          select: { companyId: true, environment: true }
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      const pdfRecord = await fastify.prisma.fileRecord.findFirst({
        where: { invoiceId: id, companyId, type: 'outgoing_pdf' },
        orderBy: { createdAt: 'desc' }
      });

      if (!pdfRecord) {
        throw fastify.httpErrors.notFound('PDF not found for this invoice');
      }

      let fileData;
      try {
        fileData = await readFile(fastify.prisma, pdfRecord.id, companyId);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404) throw fastify.httpErrors.notFound('PDF file missing from storage');
        if (statusCode === 403) throw fastify.httpErrors.forbidden('Access denied');
        throw err;
      }

      const invoiceNumber = await fastify.prisma.invoice
        .findUnique({ where: { id }, select: { invoiceNumber: true } })
        .then((invoice) => invoice?.invoiceNumber ?? id);

      const safeNumber = invoiceNumber.replace(/[/\\]/g, '-');

      reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="faktura-${safeNumber}.pdf"`)
        .header('Content-Length', fileData.data.length);

      return reply.send(fileData.data);
    }
  );

  /**
   * GET /companies/:companyId/invoices/:id/xml
   * Streams the FA(3) XML file for the invoice.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/xml',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          select: { companyId: true, environment: true }
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      const xmlRecord = await fastify.prisma.fileRecord.findFirst({
        where: { invoiceId: id, companyId, type: 'outgoing_xml' },
        orderBy: { createdAt: 'desc' }
      });

      if (!xmlRecord) {
        throw fastify.httpErrors.notFound('XML not found for this invoice');
      }

      let fileData;
      try {
        fileData = await readFile(fastify.prisma, xmlRecord.id, companyId);
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404) throw fastify.httpErrors.notFound('XML file missing from storage');
        if (statusCode === 403) throw fastify.httpErrors.forbidden('Access denied');
        throw err;
      }

      const invoiceNumber = await fastify.prisma.invoice
        .findUnique({ where: { id }, select: { invoiceNumber: true } })
        .then((invoice) => invoice?.invoiceNumber ?? id);

      const safeNumber = invoiceNumber.replace(/[/\\]/g, '-');

      reply
        .header('Content-Type', 'application/xml')
        .header('Content-Disposition', `attachment; filename="faktura-${safeNumber}.xml"`)
        .header('Content-Length', fileData.data.length);

      return reply.send(fileData.data);
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/submit-ksef
   * Submits the ISSUED invoice to KSeF. Reconstructs InvoiceData from DB.
   */
  fastify.post<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/submit-ksef',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: submitKsefResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);

      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot submit to KSeF');
      }

      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const encryptionKey = process.env['ENCRYPTION_KEY'];
      if (!encryptionKey) {
        throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY is not configured');
      }

      const invoice = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: {
            lines: { orderBy: { position: 'asc' } },
            vatBreakdown: true,
            company: true,
            contractor: true,
            ksefStates: buildInvoiceKsefStateInclude(selectedEnvironment)
          }
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      if (invoice.status !== 'ISSUED') {
        throw fastify.httpErrors.conflict(
          `Invoice must be ISSUED before submitting to KSeF (current status: ${invoice.status})`
        );
      }

      const invoiceKsefState = resolveInvoiceKsefState(invoice);

      if (invoiceKsefState.status !== 'NOT_SENT') {
        throw fastify.httpErrors.conflict(
          `Invoice was already submitted to KSeF (current KSeF status: ${invoiceKsefState.status})`
        );
      }

      if (!invoice.invoiceNumber) {
        throw fastify.httpErrors.conflict('Invoice has no invoice number assigned');
      }

      const invoiceData = await buildIssuedInvoiceDataForKsefSubmission(fastify.prisma, invoice).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        throw fastify.httpErrors.conflict(message);
      });

      try {
        return await submitInvoiceToKsef(fastify.prisma, id, companyId, invoiceData, encryptionKey, selectedEnvironment);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fastify.log.error({ invoiceId: id, companyId, err }, 'KSeF submission failed');
        throw fastify.httpErrors.badGateway(`KSeF submission failed: ${msg}`);
      }
    }
  );

  /**
   * GET /companies/:companyId/invoices/:id/ksef-status
   * Polls KSeF for the status of the latest submission for this invoice.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/ksef-status',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: ksefStatusResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertCompanyAccess(user, companyId, fastify);

      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const encryptionKey = process.env['ENCRYPTION_KEY'];
      if (!encryptionKey) {
        throw fastify.httpErrors.internalServerError('ENCRYPTION_KEY is not configured');
      }

      const latestSubmission = await fastify.prisma.ksefSubmission.findFirst({
        where: { invoiceId: id, companyId, environment: selectedEnvironment },
        orderBy: { attemptNumber: 'desc' }
      });

      if (!latestSubmission) {
        throw fastify.httpErrors.notFound('No KSeF submission found for this invoice');
      }

      try {
        return await pollKsefSubmissionStatus(
          fastify.prisma,
          latestSubmission.id,
          companyId,
          encryptionKey
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fastify.log.error({ invoiceId: id, submissionId: latestSubmission.id, err }, 'KSeF poll failed');
        throw fastify.httpErrors.badGateway(`KSeF status poll failed: ${msg}`);
      }
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/send-email
   * Sends the invoice PDF to the buyer's email via Resend.
   * Returns 501 if RESEND_API_KEY is not configured.
   */
  fastify.post<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/send-email',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: { emailId: { type: 'string' } },
            required: ['emailId']
          }
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot send emails');
      }

      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const resendApiKey = process.env['RESEND_API_KEY'];
      if (!resendApiKey) {
        throw fastify.httpErrors.notImplemented('RESEND_API_KEY is not configured — email sending is disabled');
      }

      const invoice = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: { company: true }
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      if (!invoice.invoiceNumber) {
        throw fastify.httpErrors.conflict('Invoice has not been issued yet');
      }

      // Find buyer email from contractor
      const contractor = invoice.contractorId
        ? await fastify.prisma.contractor.findUnique({ where: { id: invoice.contractorId }, select: { email: true, name: true } })
        : null;

      if (!contractor?.email) {
        throw fastify.httpErrors.conflict('Contractor has no email address configured');
      }

      // Fetch PDF file
      const pdfRecord = await fastify.prisma.fileRecord.findFirst({
        where: { invoiceId: id, companyId, type: 'outgoing_pdf' },
        orderBy: { createdAt: 'desc' }
      });

      if (!pdfRecord) {
        throw fastify.httpErrors.conflict('PDF not found — issue the invoice first');
      }

      const { readFile } = await import('../../services/storage/local-fs.js');
      const fileData = await readFile(fastify.prisma, pdfRecord.id, companyId).catch(() => null);
      if (!fileData) {
        throw fastify.httpErrors.internalServerError('PDF file missing from storage');
      }

      const safeNumber = invoice.invoiceNumber.replace(/[/\\]/g, '-');
      const resend = new Resend(resendApiKey);

      const { data, error } = await resend.emails.send({
        from: invoice.company.email
          ? `${invoice.company.name} <${invoice.company.email}>`
          : `noreply@${invoice.company.nip}.ksiegowy`,
        to: contractor.email,
        subject: `Faktura ${invoice.invoiceNumber} — ${invoice.company.name}`,
        html: `<p>W załączniku przesyłamy fakturę <strong>${invoice.invoiceNumber}</strong>.</p>`,
        attachments: [
          {
            filename: `faktura-${safeNumber}.pdf`,
            content: fileData.data.toString('base64')
          }
        ]
      });

      if (error) {
        fastify.log.error({ invoiceId: id, error }, 'Resend email failed');
        throw fastify.httpErrors.badGateway(`Email delivery failed: ${error.message}`);
      }

      fastify.log.info({ invoiceId: id, emailId: data?.id, to: contractor.email }, 'Invoice email sent');

      return { emailId: data?.id ?? '' };
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/revert-to-draft
   * Reverts an ISSUED (not yet sent to KSeF) invoice back to DRAFT for editing.
   * Only allowed when status=ISSUED and ksefStatus=NOT_SENT.
   */
  fastify.post<{ Params: InvoiceParams }>(
    '/companies/:companyId/invoices/:id/revert-to-draft',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        response: {
          200: invoiceResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);
      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot revert invoices');
      }

      const invoice = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: buildInvoiceDetailInclude(selectedEnvironment)
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      const invoiceKsefState = resolveInvoiceKsefState(invoice);

      if (invoice.status !== 'ISSUED' || invoiceKsefState.status !== 'NOT_SENT') {
        throw fastify.httpErrors.conflict(
          'Only ISSUED invoices that have not been sent to KSeF can be reverted to draft'
        );
      }

      // Delete generated files so they are regenerated on re-issue
      await fastify.prisma.fileRecord.deleteMany({ where: { invoiceId: id } });

      const reverted = await fastify.prisma.invoice.update({
        where: { id },
        data: {
          status: 'DRAFT',
          invoiceNumber: null,
          issuedAt: null,
          sellerName: null,
          sellerNip: null,
          sellerAddress1: null,
          sellerAddress2: null,
          sellerEmail: null,
          sellerPhone: null,
          sellerBank: null,
          sellerAccount: null,
          buyerName: null,
          buyerNip: null,
          buyerAddress1: null,
          buyerAddress2: null
        },
        include: {
          ...buildInvoiceDetailInclude(selectedEnvironment)
        }
      });

      fastify.log.info({ invoiceId: id, companyId }, 'Invoice reverted to draft');

      return serializeInvoice(reverted);
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/correct
   * Creates a KOR (correction) invoice draft that negates the original invoice.
   * Only allowed for invoices accepted by KSeF.
   */
  fastify.post<{ Params: InvoiceParams; Body: CreateCorrectionBody }>(
    '/companies/:companyId/invoices/:id/correct',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        body: createCorrectionBodySchema,
        response: {
          201: invoiceResponseSchema
        }
      }
    },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot create correction invoices');
      }

      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const original = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: buildInvoiceDetailInclude(selectedEnvironment)
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      const originalKsefState = resolveInvoiceKsefState(original);

      if (originalKsefState.status !== 'ACCEPTED') {
        throw fastify.httpErrors.conflict(
          `Only invoices accepted by KSeF can be corrected (current KSeF status: ${originalKsefState.status})`
        );
      }

      const { reason, impactType } = request.body;

      // Build KOR lines with negated values
      const korLines = original.lines.map((l) => ({
        position: l.position,
        name: l.name,
        unit: l.unit ?? 'szt',
        quantity: l.quantity.toString(),
        unitNetPrice: `-${l.unitNetPrice.toString()}`,
        vatRate: l.vatRate,
        netValue: `-${l.netValue.toString()}`,
        vatValue: `-${l.vatValue.toString()}`,
        grossValue: `-${l.grossValue.toString()}`
      }));

      const korBreakdown = original.vatBreakdown.map((b) => ({
        vatRate: b.vatRate,
        netAmount: `-${b.netAmount.toString()}`,
        vatAmount: `-${b.vatAmount.toString()}`
      }));

      const correction = await fastify.prisma.invoice.create({
        data: {
          companyId,
          environment: selectedEnvironment,
          contractorId: original.contractorId,
          invoiceType: 'KOR',
          issueDate: new Date(),
          paymentMethod: original.paymentMethod,
          currency: original.currency,
          correctedInvoiceId: original.id,
          correctedKsefRef: originalKsefState.ksefReference,
          correctionReason: reason ?? null,
          correctionImpactType: impactType ?? null,
          sellerName: original.sellerName,
          sellerNip: original.sellerNip,
          sellerAddress1: original.sellerAddress1,
          sellerAddress2: original.sellerAddress2,
          buyerName: original.buyerName,
          buyerNip: original.buyerNip,
          buyerAddress1: original.buyerAddress1,
          buyerAddress2: original.buyerAddress2,
          buyerCountry: original.buyerCountry,
          totalNet: `-${original.totalNet.toString()}`,
          totalVat: `-${original.totalVat.toString()}`,
          totalGross: `-${original.totalGross.toString()}`,
          notes: `Korekta faktury ${original.invoiceNumber ?? id}`,
          lines: { create: korLines },
          vatBreakdown: { create: korBreakdown }
        },
        include: {
          ...buildInvoiceDetailInclude(selectedEnvironment)
        }
      });

      fastify.log.info({ correctionId: correction.id, originalId: id, companyId }, 'KOR correction invoice created');

      return reply.code(201).send(serializeInvoice(correction));
    }
  );

  /**
   * POST /companies/:companyId/invoices/:id/payment
   * Records a payment received for the invoice (updates paymentReceived field).
   */
  fastify.post<{ Params: InvoiceParams; Body: RecordPaymentBody }>(
    '/companies/:companyId/invoices/:id/payment',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: invoiceParamsSchema,
        body: recordPaymentBodySchema,
        response: {
          200: invoiceResponseSchema
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertCompanyAccess(user, companyId, fastify);
      const selectedEnvironment = await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);
      if (membership.role === 'VIEWER') {
        throw fastify.httpErrors.forbidden('Insufficient role: VIEWER cannot record payments');
      }

      const invoice = assertInvoiceEnvironmentAccess(
        await fastify.prisma.invoice.findUnique({
          where: { id },
          include: buildInvoiceDetailInclude(selectedEnvironment)
        }),
        companyId,
        selectedEnvironment,
        fastify,
      );

      if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
        throw fastify.httpErrors.conflict(`Cannot record payment for invoice with status ${invoice.status}`);
      }

      const updated = await fastify.prisma.invoice.update({
        where: { id },
        data: { paymentReceived: request.body.amount },
        include: buildInvoiceDetailInclude(selectedEnvironment)
      });

      fastify.log.info({ invoiceId: id, companyId, amount: request.body.amount }, 'Payment recorded');

      return serializeInvoice(updated);
    }
  );
};
