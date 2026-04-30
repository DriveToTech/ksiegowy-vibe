import type { FastifyPluginAsync } from 'fastify';
import type { IncomingInvoiceStatus } from '@prisma/client';
import type { AccessTokenPayload } from '../../lib/auth-config.js';
import { resolveEffectiveKsefEnvironment } from '../../lib/ksef-environment.js';
import { saveFile } from '../../services/storage/local-fs.js';
import { startOcrPipeline } from '../../services/ocr/process.js';
import { isValidNip } from '@ksiegowy/shared-utils';
import { syncIncomingInvoicesFromKsef } from '../../services/ksef-incoming.service.js';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
]);

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

interface CompanyIdParams { companyId: string }
interface InvoiceParams { companyId: string; id: string }
interface ListQuerystring { status?: string; page?: number; limit?: number }
interface KsefSyncBody { dateFrom: string; dateTo: string }

const ksefSyncBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['dateFrom', 'dateTo'],
  properties: {
    dateFrom: { type: 'string', format: 'date' },
    dateTo: { type: 'string', format: 'date' }
  }
} as const;

const incomingListItemSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    contractorId: { type: ['string', 'null'] },
    status: { type: 'string' },
    sellerName: { type: ['string', 'null'] },
    sellerNip: { type: ['string', 'null'] },
    invoiceNumber: { type: ['string', 'null'] },
    issueDate: { type: ['string', 'null'] },
    totalGross: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
    ocrError: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    contractor: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        nip: { type: ['string', 'null'] },
      },
      required: ['id', 'name', 'nip'],
    },
  },
  required: ['id', 'companyId', 'contractorId', 'status', 'sellerName', 'sellerNip', 'invoiceNumber', 'issueDate', 'totalGross', 'currency', 'ocrError', 'createdAt', 'updatedAt', 'contractor'],
} as const;

const incomingDetailSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    companyId: { type: 'string' },
    contractorId: { type: ['string', 'null'] },
    status: { type: 'string' },
    sellerName: { type: ['string', 'null'] },
    sellerNip: { type: ['string', 'null'] },
    sellerAddress: { type: ['string', 'null'] },
    buyerName: { type: ['string', 'null'] },
    buyerNip: { type: ['string', 'null'] },
    invoiceNumber: { type: ['string', 'null'] },
    issueDate: { type: ['string', 'null'] },
    saleDate: { type: ['string', 'null'] },
    totalNet: { type: ['string', 'null'] },
    totalVat: { type: ['string', 'null'] },
    totalGross: { type: ['string', 'null'] },
    currency: { type: ['string', 'null'] },
    paymentMethod: { type: ['string', 'null'] },
    dueDate: { type: ['string', 'null'] },
    bankAccount: { type: ['string', 'null'] },
    notes: { type: ['string', 'null'] },
    ocrConfidence: { type: ['number', 'null'] },
    ocrModel: { type: ['string', 'null'] },
    ocrError: { type: ['string', 'null'] },
    ksefReference: { type: ['string', 'null'] },
    confirmedAt: { type: ['string', 'null'] },
    createdAt: { type: 'string' },
    updatedAt: { type: 'string' },
    contractor: {
      type: ['object', 'null'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        nip: { type: ['string', 'null'] },
      },
      required: ['id', 'name', 'nip'],
    },
    fileRecords: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          mimeType: { type: 'string' },
          sizeBytes: { type: 'integer' },
          createdAt: { type: 'string' },
        },
        required: ['id', 'type', 'mimeType', 'sizeBytes', 'createdAt'],
      },
    },
  },
  required: [
    'id', 'companyId', 'contractorId', 'status', 'sellerName', 'sellerNip', 'sellerAddress',
    'buyerName', 'buyerNip', 'invoiceNumber', 'issueDate', 'saleDate', 'totalNet', 'totalVat',
    'totalGross', 'currency', 'paymentMethod', 'dueDate', 'bankAccount', 'notes',
    'ocrConfidence', 'ocrModel', 'ocrError', 'ksefReference', 'confirmedAt',
    'createdAt', 'updatedAt', 'contractor', 'fileRecords',
  ],
} as const;

const confirmBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    contractorId: { type: 'string', minLength: 1 },
    invoiceNumber: { type: 'string' },
    issueDate: { type: 'string', format: 'date' },
    saleDate: { type: 'string', format: 'date' },
    totalNet: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    totalVat: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    totalGross: { type: 'string', pattern: '^[0-9]+([.][0-9]+)?$' },
    currency: { type: 'string' },
    notes: { type: 'string' },
  },
} as const;

interface ConfirmBody {
  contractorId?: string;
  invoiceNumber?: string;
  issueDate?: string;
  saleDate?: string;
  totalNet?: string;
  totalVat?: string;
  totalGross?: string;
  currency?: string;
  notes?: string;
}

const assertAccess = (
  user: AccessTokenPayload,
  companyId: string,
  fastify: { httpErrors: { forbidden: (msg: string) => Error } }
) => {
  const membership = user.companies.find((c) => c.id === companyId);
  if (!membership) throw fastify.httpErrors.forbidden('Access denied');
  return membership;
};

const serializeListItem = (inv: {
  id: string; companyId: string; contractorId: string | null;
  status: string; sellerName: string | null; sellerNip: string | null;
  invoiceNumber: string | null; issueDate: Date | null; totalGross: { toString(): string } | null;
  currency: string | null; ocrError: string | null; ksefReference: string | null;
  createdAt: Date; updatedAt: Date;
  contractor: { id: string; name: string; nip: string | null } | null;
}) => ({
  id: inv.id,
  companyId: inv.companyId,
  contractorId: inv.contractorId,
  status: inv.status,
  sellerName: inv.sellerName,
  sellerNip: inv.sellerNip,
  invoiceNumber: inv.invoiceNumber,
  issueDate: inv.issueDate ? inv.issueDate.toISOString().slice(0, 10) : null,
  totalGross: inv.totalGross ? inv.totalGross.toString() : null,
  currency: inv.currency,
  ocrError: inv.ocrError,
  ksefReference: inv.ksefReference,
  createdAt: inv.createdAt.toISOString(),
  updatedAt: inv.updatedAt.toISOString(),
  contractor: inv.contractor,
});

export const incomingInvoiceRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const storageBase = process.env['STORAGE_BASE_PATH'] ?? './storage';

  /**
   * POST /companies/:companyId/incoming
   * Upload a contractor invoice (PDF or image). Starts OCR pipeline fire-and-forget.
   */
  fastify.post<{ Params: CompanyIdParams }>(
    '/companies/:companyId/incoming',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;

      const membership = assertAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const data = await (request as unknown as { file(): Promise<{ filename: string; mimetype: string; toBuffer(): Promise<Buffer> }> }).file();
      if (!data) throw fastify.httpErrors.badRequest('No file uploaded');

      if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
        throw fastify.httpErrors.unsupportedMediaType(
          `Unsupported file type: ${data.mimetype}. Allowed: PDF, JPEG, PNG, WebP, TIFF`
        );
      }

      const buffer = await data.toBuffer();
      if (buffer.length > MAX_FILE_SIZE) {
        throw fastify.httpErrors.payloadTooLarge('File exceeds 20 MB limit');
      }

      const fileRecord = await saveFile(fastify.prisma, {
        companyId,
        type: 'incoming_scan',
        ext: data.mimetype === 'application/pdf' ? 'pdf' : data.mimetype.split('/')[1] ?? 'bin',
        mimeType: data.mimetype,
        data: buffer,
        storageBase,
      });

      const incoming = await fastify.prisma.incomingInvoice.create({
        data: {
          companyId,
          status: 'UPLOADED',
          fileRecords: { connect: { id: fileRecord.id } },
        },
        include: { contractor: { select: { id: true, name: true, nip: true } }, fileRecords: true },
      });

      // Update the fileRecord to link it to the incomingInvoice
      await fastify.prisma.fileRecord.update({
        where: { id: fileRecord.id },
        data: { incomingInvoiceId: incoming.id },
      });

      // Fire-and-forget OCR
      startOcrPipeline(fastify.prisma, incoming.id, fastify.log);

      fastify.log.info({ incomingInvoiceId: incoming.id, companyId, mimeType: data.mimetype }, 'Incoming invoice uploaded, OCR started');

      return reply.code(201).send(serializeListItem({ ...incoming, totalGross: null }));
    }
  );

  /**
   * GET /companies/:companyId/incoming
   * Lists incoming invoices with optional status filter and pagination.
   */
  fastify.get<{ Params: CompanyIdParams; Querystring: ListQuerystring }>(
    '/companies/:companyId/incoming',
    {
      onRequest: [fastify.authenticate],
      schema: {
        params: { type: 'object', properties: { companyId: { type: 'string' } }, required: ['companyId'] },
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              data: { type: 'array', items: incomingListItemSchema },
              total: { type: 'integer' },
              page: { type: 'integer' },
              limit: { type: 'integer' },
            },
            required: ['data', 'total', 'page', 'limit'],
          },
        },
      },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { status, page = 1, limit = 20 } = request.query;

      assertAccess(user, companyId, fastify);

      const where = {
        companyId,
        ...(status ? { status: status as IncomingInvoiceStatus } : {}),
      };

      const [total, invoices] = await Promise.all([
        fastify.prisma.incomingInvoice.count({ where }),
        fastify.prisma.incomingInvoice.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, companyId: true, contractorId: true, status: true,
            sellerName: true, sellerNip: true, invoiceNumber: true,
            issueDate: true, totalGross: true, currency: true, ocrError: true,
            ksefReference: true, createdAt: true, updatedAt: true,
            contractor: { select: { id: true, name: true, nip: true } },
          },
        }),
      ]);

      return { data: invoices.map((invoice) => serializeListItem(invoice)), total, page, limit };
    }
  );

  /**
   * GET /companies/:companyId/incoming/:id
   * Returns full detail of a single incoming invoice.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/incoming/:id',
    {
      onRequest: [fastify.authenticate],
      schema: { response: { 200: incomingDetailSchema } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertAccess(user, companyId, fastify);

      const invoice = await fastify.prisma.incomingInvoice.findUnique({
        where: { id },
        include: {
          contractor: { select: { id: true, name: true, nip: true } },
          fileRecords: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } },
        },
      });

      if (!invoice || invoice.companyId !== companyId) throw fastify.httpErrors.notFound('Incoming invoice not found');

      return {
        id: invoice.id, companyId: invoice.companyId, contractorId: invoice.contractorId, status: invoice.status,
        sellerName: invoice.sellerName, sellerNip: invoice.sellerNip, sellerAddress: invoice.sellerAddress,
        buyerName: invoice.buyerName, buyerNip: invoice.buyerNip, invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate ? invoice.issueDate.toISOString().slice(0, 10) : null,
        saleDate: invoice.saleDate ? invoice.saleDate.toISOString().slice(0, 10) : null,
        totalNet: invoice.totalNet ? invoice.totalNet.toString() : null,
        totalVat: invoice.totalVat ? invoice.totalVat.toString() : null,
        totalGross: invoice.totalGross ? invoice.totalGross.toString() : null,
        currency: invoice.currency, paymentMethod: invoice.paymentMethod,
        dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
        bankAccount: invoice.bankAccount, notes: invoice.notes,
        ocrConfidence: invoice.ocrConfidence, ocrModel: invoice.ocrModel, ocrError: invoice.ocrError,
        ksefReference: invoice.ksefReference,
        confirmedAt: invoice.confirmedAt ? invoice.confirmedAt.toISOString() : null,
        createdAt: invoice.createdAt.toISOString(), updatedAt: invoice.updatedAt.toISOString(),
        contractor: invoice.contractor,
        fileRecords: invoice.fileRecords.map((fileRecord) => ({
          ...fileRecord, createdAt: fileRecord.createdAt.toISOString(),
        })),
      };
    }
  );

  /**
   * GET /companies/:companyId/incoming/:id/ocr-status (SSE)
   * Streams OCR status updates via Server-Sent Events until a terminal status is reached.
   */
  fastify.get<{ Params: InvoiceParams }>(
    '/companies/:companyId/incoming/:id/ocr-status',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      assertAccess(user, companyId, fastify);

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('X-Accel-Buffering', 'no');
      reply.raw.flushHeaders();

      const TERMINAL = new Set(['OCR_DONE', 'OCR_FAILED', 'CONFIRMED', 'REJECTED']);

      const sendEvent = (data: object) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      let closed = false;
      request.raw.on('close', () => { closed = true; });

      // Keep-alive ping every 25s
      const ping = setInterval(() => { if (!closed) reply.raw.write(': ping\n\n'); }, 25_000);

      const poll = async (): Promise<void> => {
        if (closed) return;

        const invoice = await fastify.prisma.incomingInvoice.findUnique({
          where: { id },
          select: { status: true, ocrError: true, ocrModel: true, ocrConfidence: true, companyId: true },
        });

        if (!invoice || invoice.companyId !== companyId) {
          sendEvent({ error: 'Not found' });
          clearInterval(ping);
          reply.raw.end();
          return;
        }

        sendEvent({ status: invoice.status, ocrError: invoice.ocrError, ocrModel: invoice.ocrModel });

        if (TERMINAL.has(invoice.status)) {
          clearInterval(ping);
          reply.raw.end();
          return;
        }

        setTimeout(() => { void poll(); }, 2_000);
      };

      await poll();

      reply.hijack();
      return reply;
    }
  );

  /**
   * POST /companies/:companyId/incoming/:id/confirm
   * Confirms the incoming invoice after OCR review. Auto-links contractor by NIP if possible.
   */
  fastify.post<{ Params: InvoiceParams; Body: ConfirmBody }>(
    '/companies/:companyId/incoming/:id/confirm',
    {
      onRequest: [fastify.authenticate],
      schema: { body: confirmBodySchema, response: { 200: incomingDetailSchema } },
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;
      const body = request.body;

      const membership = assertAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const invoice = await fastify.prisma.incomingInvoice.findUnique({ where: { id } });
      if (!invoice || invoice.companyId !== companyId) throw fastify.httpErrors.notFound('Incoming invoice not found');

      const CONFIRMABLE = new Set(['UPLOADED', 'OCR_DONE', 'OCR_FAILED']);
      if (!CONFIRMABLE.has(invoice.status)) {
        throw fastify.httpErrors.conflict(`Cannot confirm invoice in status: ${invoice.status}`);
      }

      // Resolve contractorId — explicit > auto-link by NIP
      let contractorId = body.contractorId ?? invoice.contractorId;
      if (!contractorId) {
        const nip = invoice.sellerNip;
        if (nip && isValidNip(nip)) {
          const matched = await fastify.prisma.contractor.findUnique({
            where: { companyId_nip: { companyId, nip } },
            select: { id: true },
          });
          if (matched) contractorId = matched.id;
        }
      }

      const updated = await fastify.prisma.incomingInvoice.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: new Date(),
          contractorId: contractorId ?? null,
          ...(body.invoiceNumber !== undefined && { invoiceNumber: body.invoiceNumber }),
          ...(body.issueDate !== undefined && { issueDate: new Date(body.issueDate) }),
          ...(body.saleDate !== undefined && { saleDate: new Date(body.saleDate) }),
          ...(body.totalNet !== undefined && { totalNet: body.totalNet }),
          ...(body.totalVat !== undefined && { totalVat: body.totalVat }),
          ...(body.totalGross !== undefined && { totalGross: body.totalGross }),
          ...(body.currency !== undefined && { currency: body.currency }),
          ...(body.notes !== undefined && { notes: body.notes }),
        },
        include: {
          contractor: { select: { id: true, name: true, nip: true } },
          fileRecords: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } },
        },
      });

      return {
        id: updated.id, companyId: updated.companyId, contractorId: updated.contractorId,
        status: updated.status, sellerName: updated.sellerName, sellerNip: updated.sellerNip,
        sellerAddress: updated.sellerAddress, buyerName: updated.buyerName, buyerNip: updated.buyerNip,
        invoiceNumber: updated.invoiceNumber,
        issueDate: updated.issueDate ? updated.issueDate.toISOString().slice(0, 10) : null,
        saleDate: updated.saleDate ? updated.saleDate.toISOString().slice(0, 10) : null,
        totalNet: updated.totalNet ? updated.totalNet.toString() : null,
        totalVat: updated.totalVat ? updated.totalVat.toString() : null,
        totalGross: updated.totalGross ? updated.totalGross.toString() : null,
        currency: updated.currency, paymentMethod: updated.paymentMethod,
        dueDate: updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null,
        bankAccount: updated.bankAccount, notes: updated.notes,
        ocrConfidence: updated.ocrConfidence, ocrModel: updated.ocrModel, ocrError: updated.ocrError,
        ksefReference: updated.ksefReference,
        confirmedAt: updated.confirmedAt ? updated.confirmedAt.toISOString() : null,
        createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(),
        contractor: updated.contractor,
        fileRecords: updated.fileRecords.map((fileRecord) => ({ ...fileRecord, createdAt: fileRecord.createdAt.toISOString() })),
      };
    }
  );

  /**
   * POST /companies/:companyId/incoming/:id/reject
   * Rejects the incoming invoice.
   */
  fastify.post<{ Params: InvoiceParams }>(
    '/companies/:companyId/incoming/:id/reject',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as AccessTokenPayload;
      const { companyId, id } = request.params;

      const membership = assertAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      const inv = await fastify.prisma.incomingInvoice.findUnique({ where: { id }, select: { companyId: true, status: true } });
      if (!inv || inv.companyId !== companyId) throw fastify.httpErrors.notFound('Incoming invoice not found');
      if (inv.status === 'CONFIRMED') throw fastify.httpErrors.conflict('Cannot reject an already confirmed invoice');

      await fastify.prisma.incomingInvoice.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      return reply.code(204).send();
    }
  );

  /**
   * POST /companies/:companyId/incoming/ksef-sync
   * Fetches incoming invoices from KSeF (company as buyer) and upserts into IncomingInvoice.
   * Returns counts of created, linked, and skipped records.
   */
  fastify.post<{ Params: CompanyIdParams; Body: KsefSyncBody }>(
    '/companies/:companyId/incoming/ksef-sync',
    {
      onRequest: [fastify.authenticate],
      schema: {
        body: ksefSyncBodySchema,
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            properties: {
              syncId: { type: 'string' },
              created: { type: 'integer' },
              linked: { type: 'integer' },
              skipped: { type: 'integer' }
            },
            required: ['syncId', 'created', 'linked', 'skipped']
          }
        }
      }
    },
    async (request) => {
      const user = request.user as AccessTokenPayload;
      const { companyId } = request.params;
      const { dateFrom, dateTo } = request.body;

      const membership = assertAccess(user, companyId, fastify);
      if (membership.role === 'VIEWER') throw fastify.httpErrors.forbidden('Insufficient role');

      await resolveEffectiveKsefEnvironment(request, fastify.prisma, companyId);

      const from = new Date(dateFrom);
      const to = new Date(dateTo);

      if (from > to) throw fastify.httpErrors.badRequest('dateFrom must be before or equal to dateTo');

      const MAX_RANGE_DAYS = 366;
      const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_RANGE_DAYS) {
        throw fastify.httpErrors.badRequest(`Date range must not exceed ${MAX_RANGE_DAYS} days`);
      }

      const encryptionKey = process.env['ENCRYPTION_KEY']!;

      return syncIncomingInvoicesFromKsef(
        fastify.prisma, companyId, encryptionKey, dateFrom, dateTo, request.log
      );
    }
  );
};
