import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import type { AccessTokenPayload, AuthConfig } from '../../lib/auth-config.js';
import {
  buildInvoiceKsefStateInclude,
  getCorrectionAmountPrefix,
  mapCorrectionModeToDatabase,
  normalizeCorrectionRequest,
  requireAcceptedKsefReference,
  resolveInvoiceKsefState,
} from './outgoing.js';

const authConfig: AuthConfig = {
  nodeEnv: 'test',
  jwt: {
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    accessTtl: '15m',
    refreshTtl: '30d',
  },
  cookies: {
    accessTokenName: 'auth_token',
    refreshTokenName: 'refresh_token',
    accessMaxAgeSeconds: 900,
    refreshMaxAgeSeconds: 2592000,
    secure: false,
    sameSite: 'lax',
    path: '/',
  },
  google: {
    enabled: false,
    missingEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI'],
    providedEnv: [],
  },
};

const signAccessToken = (app: Awaited<ReturnType<typeof buildApp>>, payload: AccessTokenPayload): string => {
  return (app.jwt as unknown as { access: { sign: (value: AccessTokenPayload) => string } }).access.sign(payload);
};

const createDecimal = (value: string) => ({ toString: () => value });

const createDraftInvoice = (overrides: Partial<{
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
  correctedInvoiceNumber: string | null;
  correctionMode: 'CANCELLATION' | 'FORMAL' | null;
  correctionReason: string | null;
  correctionImpactType: string | null;
  correctedInvoice: null;
  ksefStates: Array<{ status: string; ksefReference: string | null }>;
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
}> = {}) => ({
  id: 'invoice-1',
  companyId: 'company-1',
  environment: 'TEST' as KsefEnvironment,
  contractorId: 'contractor-1',
  invoiceNumber: null,
  status: 'DRAFT',
  invoiceType: 'VAT',
  issueDate: new Date('2026-05-01T00:00:00.000Z'),
  saleDate: null,
  placeOfIssue: 'Warsaw',
  sellerName: null,
  sellerNip: null,
  buyerName: null,
  buyerNip: null,
  totalNet: createDecimal('10.00'),
  totalVat: createDecimal('2.30'),
  totalGross: createDecimal('12.30'),
  paymentReceived: createDecimal('0.00'),
  paymentMethod: 'BANK_TRANSFER',
  paymentDueDate: null,
  currency: 'PLN',
  notes: null,
  correctedInvoiceNumber: null,
  correctionMode: null,
  correctionReason: null,
  correctionImpactType: null,
  correctedInvoice: null,
  ksefStates: [],
  issuedAt: null,
  createdAt: new Date('2026-05-01T08:00:00.000Z'),
  updatedAt: new Date('2026-05-01T08:00:00.000Z'),
  lines: [
    {
      id: 'line-1',
      position: 1,
      name: 'Service',
      unit: 'szt',
      quantity: createDecimal('1'),
      unitNetPrice: createDecimal('10.00'),
      vatRate: '23',
      netValue: createDecimal('10.00'),
      vatValue: createDecimal('2.30'),
      grossValue: createDecimal('12.30'),
    },
  ],
  vatBreakdown: [
    {
      id: 'vat-1',
      vatRate: '23',
      netAmount: createDecimal('10.00'),
      vatAmount: createDecimal('2.30'),
    },
  ],
  ...overrides,
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveInvoiceKsefState()', () => {
  it('returns NOT_SENT when no ksefStates match the active environment', () => {
    const invoice = { ksefStates: [] };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'NOT_SENT', ksefReference: null });
  });

  it('returns NOT_SENT when ksefStates is undefined', () => {
    const invoice = {};

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'NOT_SENT', ksefReference: null });
  });

  it('returns the matching environment state when present', () => {
    const invoice = {
      ksefStates: [{ status: 'ACCEPTED', ksefReference: '8982160168-20260411-5144C4800000-D5' }],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({
      status: 'ACCEPTED',
      ksefReference: '8982160168-20260411-5144C4800000-D5',
    });
  });

  it('returns the first match when multiple states exist', () => {
    const invoice = {
      ksefStates: [
        { status: 'SUBMITTED', ksefReference: null },
        { status: 'ACCEPTED', ksefReference: '8982160168-20260411-5144C4800000-D5' },
      ],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'SUBMITTED', ksefReference: null });
  });

  it('returns state with null ksefReference when not yet accepted', () => {
    const invoice = {
      ksefStates: [{ status: 'SUBMITTED', ksefReference: null }],
    };

    const result = resolveInvoiceKsefState(invoice);

    expect(result).toEqual({ status: 'SUBMITTED', ksefReference: null });
  });
});

describe('requireAcceptedKsefReference()', () => {
  it('rejects ACCEPTED state without a non-empty KSeF reference', () => {
    expect(() => requireAcceptedKsefReference({ status: 'ACCEPTED', ksefReference: null }))
      .toThrow('Accepted invoice is missing its KSeF reference');
    expect(() => requireAcceptedKsefReference({ status: 'ACCEPTED', ksefReference: '  ' }))
      .toThrow('Accepted invoice is missing its KSeF reference');
  });

  it('returns the KSeF reference for a valid ACCEPTED state', () => {
    expect(requireAcceptedKsefReference({ status: 'ACCEPTED', ksefReference: 'KSEF-123' }))
      .toBe('KSEF-123');
  });
});

describe('buildInvoiceKsefStateInclude()', () => {
  it('produces the correct Prisma include shape for TEST environment', () => {
    const result = buildInvoiceKsefStateInclude('TEST' as KsefEnvironment);

    expect(result).toEqual({
      where: { environment: 'TEST' },
      select: {
        status: true,
        ksefReference: true,
      },
    });
  });

  it('produces the correct Prisma include shape for PRODUCTION environment', () => {
    const result = buildInvoiceKsefStateInclude('PRODUCTION' as KsefEnvironment);

    expect(result).toEqual({
      where: { environment: 'PRODUCTION' },
      select: {
        status: true,
        ksefReference: true,
      },
    });
  });
});

describe('normalizeCorrectionRequest()', () => {
  it('defaults to cancellation mode and negates values', () => {
    const result = normalizeCorrectionRequest({}, 'FV 1/4/2026');

    expect(result).toEqual({
      correctionMode: 'CANCELLATION',
      correctedInvoiceNumber: null,
      correctionReason: null,
      amountPrefix: '-',
    });
  });

  it('requires corrected invoice number or reason for formal corrections', () => {
    expect(() => normalizeCorrectionRequest({ correctionMode: 'formal' }, 'FV 1/4/2026')).toThrow(
      'Formal correction requires correctedInvoiceNumber or reason',
    );
  });

  it('rejects unchanged corrected invoice number in formal mode', () => {
    expect(() => normalizeCorrectionRequest(
      { correctionMode: 'formal', correctedInvoiceNumber: 'FV 1/4/2026' },
      'FV 1/4/2026',
    )).toThrow('Corrected invoice number must differ from the original invoice number');
  });

  it('rejects corrected invoice number in cancellation mode', () => {
    expect(() => normalizeCorrectionRequest(
      { correctionMode: 'cancellation', correctedInvoiceNumber: 'FV 2/4/2026' },
      'FV 1/4/2026',
    )).toThrow('correctedInvoiceNumber is only supported for formal corrections');
  });

  it('builds formal correction reason with corrected invoice number', () => {
    const result = normalizeCorrectionRequest(
      {
        correctionMode: 'formal',
        correctedInvoiceNumber: 'FV 2/4/2026',
        reason: 'Zmiana numeracji',
      },
      'FV 1/4/2026',
    );

    expect(result).toEqual({
      correctionMode: 'FORMAL',
      correctedInvoiceNumber: 'FV 2/4/2026',
      correctionReason: 'Korekta numeru faktury: bylo FV 1/4/2026, powinno byc FV 2/4/2026. Zmiana numeracji',
      amountPrefix: '',
    });
  });
});

describe('correction mode helpers', () => {
  it('maps correction modes to database values', () => {
    expect(mapCorrectionModeToDatabase(undefined)).toBe('CANCELLATION');
    expect(mapCorrectionModeToDatabase('cancellation')).toBe('CANCELLATION');
    expect(mapCorrectionModeToDatabase('formal')).toBe('FORMAL');
  });

  it('returns amount prefix per correction mode', () => {
    expect(getCorrectionAmountPrefix('CANCELLATION')).toBe('-');
    expect(getCorrectionAmountPrefix('FORMAL')).toBe('');
  });
});

describe('PUT /companies/:companyId/invoices/:id', () => {
  it('rejects negative unitNetPrice for regular draft invoices', async () => {
    const invoiceFindUnique = vi.fn(async () => createDraftInvoice());
    const prisma = {
      invoice: { findUnique: invoiceFindUnique },
      contractor: { findUnique: vi.fn(async () => ({ companyId: 'company-1' })) },
      $transaction: vi.fn(),
    } as unknown as PrismaClient;

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig,
    });

    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/companies/company-1/invoices/invoice-1',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
      payload: {
        contractorId: 'contractor-1',
        issueDate: '2026-05-01',
        lines: [
          { position: 1, name: 'Correction', quantity: '1', unitNetPrice: '-50.00', vatRate: '23' },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      message: 'Negative unitNetPrice is only supported for KOR drafts',
    });
    expect(invoiceFindUnique).toHaveBeenCalledOnce();
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await app.close();
  });

  it('accepts negative unitNetPrice when updating KOR drafts', async () => {
    const existingInvoice = createDraftInvoice({ invoiceType: 'KOR' });
    const updatedInvoice = createDraftInvoice({
      invoiceType: 'KOR',
      totalNet: createDecimal('-50.00'),
      totalVat: createDecimal('-11.50'),
      totalGross: createDecimal('-61.50'),
      updatedAt: new Date('2026-05-02T08:00:00.000Z'),
      lines: [
        {
          id: 'line-1',
          position: 1,
          name: 'Correction',
          unit: 'szt',
          quantity: createDecimal('1.00'),
          unitNetPrice: createDecimal('-50.00'),
          vatRate: '23',
          netValue: createDecimal('-50.00'),
          vatValue: createDecimal('-11.50'),
          grossValue: createDecimal('-61.50'),
        },
      ],
      vatBreakdown: [
        {
          id: 'vat-1',
          vatRate: '23',
          netAmount: createDecimal('-50.00'),
          vatAmount: createDecimal('-11.50'),
        },
      ],
    });

    const invoiceFindUnique = vi.fn(async () => existingInvoice);
    const invoiceUpdate = vi.fn(async () => updatedInvoice);
    const invoiceLineDeleteMany = vi.fn(async () => ({ count: 1 }));
    const invoiceVatBreakdownDeleteMany = vi.fn(async () => ({ count: 1 }));
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        $queryRaw: vi.fn(async () => [{ status: 'DRAFT' }]),
        invoiceLine: { deleteMany: invoiceLineDeleteMany },
        invoiceVatBreakdown: { deleteMany: invoiceVatBreakdownDeleteMany },
        invoice: { update: invoiceUpdate },
      });
    });
    const prisma = {
      invoice: { findUnique: invoiceFindUnique },
      contractor: { findUnique: vi.fn(async () => ({ companyId: 'company-1' })) },
      $transaction: transaction,
    } as unknown as PrismaClient;

    const app = await buildApp({
      logger: false,
      prismaClient: prisma,
      authConfig,
    });

    const authToken = signAccessToken(app, {
      sub: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      companies: [{ id: 'company-1', role: 'ADMIN' }],
    });

    const response = await app.inject({
      method: 'PUT',
      url: '/companies/company-1/invoices/invoice-1',
      headers: { 'x-ksef-environment': 'TEST' },
      cookies: { auth_token: authToken },
      payload: {
        contractorId: 'contractor-1',
        issueDate: '2026-05-01',
        lines: [
          { position: 1, name: 'Correction', quantity: '1', unitNetPrice: '-50.00', vatRate: '23' },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      invoiceType: 'KOR',
      totalGross: '-61.50',
      lines: [
        {
          unitNetPrice: '-50.00',
          grossValue: '-61.50',
        },
      ],
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(invoiceLineDeleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'invoice-1' } });
    expect(invoiceVatBreakdownDeleteMany).toHaveBeenCalledWith({ where: { invoiceId: 'invoice-1' } });
    expect(invoiceUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalNet: '-50.00',
          totalVat: '-11.50',
          totalGross: '-61.50',
          lines: {
            create: [
              expect.objectContaining({
                unitNetPrice: '-50.00',
                netValue: '-50.00',
                vatValue: '-11.50',
                grossValue: '-61.50',
              }),
            ],
          },
        }),
      }),
    );

    await app.close();
  });
});
