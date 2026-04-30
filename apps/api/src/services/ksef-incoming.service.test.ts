import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const queryIncomingInvoices = vi.fn();
const fetchInvoiceXml = vi.fn();
const refreshAuthSession = vi.fn();
const initAuthSession = vi.fn();

vi.mock('@ksiegowy/ksef-client', () => ({
  createKsefClient: vi.fn(() => ({
    queryIncomingInvoices,
    fetchInvoiceXml,
    refreshAuthSession,
    initAuthSession,
  })),
  KsefClientError: class extends Error {
    statusCode = 401;
  },
}));

vi.mock('@ksiegowy/shared-utils', () => ({
  decrypt: vi.fn((value: string) => `decrypted:${value}`),
  encrypt: vi.fn((value: string) => ({ enc: `encrypted:${value}`, iv: 'generated-iv' })),
}));

vi.mock('@ksiegowy/fa3-xml', () => ({
  parseFa3Xml: vi.fn(() => ({
    sellerName: 'Seller Sp. z o.o.',
    sellerAddress: 'ul. Testowa 1, Warszawa',
    buyerName: 'Buyer Sp. z o.o.',
    buyerNip: '1234567890',
    invoiceNumber: 'FV/2026/04/01',
    issueDate: '2026-04-15',
    saleDate: '2026-04-15',
    totalNet: '1000.00',
    totalVat: '230.00',
    totalGross: '1230.00',
    currency: 'PLN',
    dueDate: '2026-04-30',
    bankAccount: null,
    paymentMethod: 'BANK_TRANSFER',
    lineItems: [],
  })),
}));

import { syncIncomingInvoicesFromKsef } from './ksef-incoming.service.js';

describe('syncIncomingInvoicesFromKsef()', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('scopes Case A dedup findFirst by ksefEnvironment', async () => {
    refreshAuthSession.mockResolvedValue('access-token');
    const incomingInvoiceFindFirst = vi.fn(async () => ({ id: 'existing-linked' }));
    const incomingInvoiceUpdate = vi.fn(async () => ({}));
    const prisma = {
      company: { findUnique: vi.fn(async () => ({ nip: '1234567890' })) },
      ksefIncomingSync: {
        create: vi.fn(async () => ({ id: 'sync-1' })),
        update: vi.fn(async () => ({})),
      },
      ksefSession: {
        findUnique: vi.fn(async () => ({
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          tokenEnc: 'session-enc',
          tokenIv: 'session-iv',
        })),
        update: vi.fn(async () => ({})),
      },
      incomingInvoice: {
        findFirst: incomingInvoiceFindFirst,
        update: incomingInvoiceUpdate,
        create: vi.fn(async () => ({})),
      },
      contractor: { findUnique: vi.fn(async () => ({ id: 'contractor-1' })) },
    } as unknown as PrismaClient;

    const logger = { info: vi.fn(), error: vi.fn() } as never;

    queryIncomingInvoices.mockResolvedValue({
      invoiceHeaderList: [
        {
          ksefNumber: 'KSEF-REF-001',
          seller: { nip: '9876543210' },
          invoiceNumber: 'FV/2026/01',
        },
      ],
      hasMore: false,
    });

    await syncIncomingInvoicesFromKsef(
      prisma,
      'company-1',
      'encryption-key',
      'PRODUCTION',
      '2026-04-01',
      '2026-04-30',
      logger,
    );

    expect(incomingInvoiceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          ksefEnvironment: 'PRODUCTION',
          ksefReference: 'KSEF-REF-001',
        }),
      }),
    );
  });

  it('scopes Case B link findFirst by ksefEnvironment', async () => {
    refreshAuthSession.mockResolvedValue('access-token');
    const incomingInvoiceFindFirst = vi.fn();
    const incomingInvoiceUpdate = vi.fn(async () => ({}));
    const prisma = {
      company: { findUnique: vi.fn(async () => ({ nip: '1234567890' })) },
      ksefIncomingSync: {
        create: vi.fn(async () => ({ id: 'sync-1' })),
        update: vi.fn(async () => ({})),
      },
      ksefSession: {
        findUnique: vi.fn(async () => ({
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          tokenEnc: 'session-enc',
          tokenIv: 'session-iv',
        })),
        update: vi.fn(async () => ({})),
      },
      incomingInvoice: {
        findFirst: incomingInvoiceFindFirst,
        update: incomingInvoiceUpdate,
        create: vi.fn(async () => ({})),
      },
      contractor: { findUnique: vi.fn(async () => ({ id: 'contractor-1' })) },
    } as unknown as PrismaClient;

    const logger = { info: vi.fn(), error: vi.fn() } as never;

    queryIncomingInvoices.mockResolvedValue({
      invoiceHeaderList: [
        {
          ksefNumber: 'KSEF-REF-002',
          seller: { nip: '9876543210' },
          invoiceNumber: 'FV/2026/02',
        },
      ],
      hasMore: false,
    });

    // Case A: no linked invoice found
    incomingInvoiceFindFirst
      .mockResolvedValueOnce(null) // Case A: no existing linked
      .mockResolvedValueOnce({ id: 'existing-upload' }); // Case B: existing upload match

    await syncIncomingInvoicesFromKsef(
      prisma,
      'company-1',
      'encryption-key',
      'TEST',
      '2026-04-01',
      '2026-04-30',
      logger,
    );

    // Second findFirst call is Case B
    const caseBCall = incomingInvoiceFindFirst.mock.calls[1][0];
    expect(caseBCall.where).toEqual(
      expect.objectContaining({
        companyId: 'company-1',
        ksefEnvironment: 'TEST',
        ksefReference: null,
      }),
    );
  });

  it('sets ksefEnvironment on newly created incoming invoices (Case C)', async () => {
    refreshAuthSession.mockResolvedValue('access-token');
    const incomingInvoiceCreate = vi.fn(async () => ({}));
    const prisma = {
      company: { findUnique: vi.fn(async () => ({ nip: '1234567890' })) },
      ksefIncomingSync: {
        create: vi.fn(async () => ({ id: 'sync-1' })),
        update: vi.fn(async () => ({})),
      },
      ksefSession: {
        findUnique: vi.fn(async () => ({
          expiresAt: new Date('2099-01-01T00:00:00.000Z'),
          tokenEnc: 'session-enc',
          tokenIv: 'session-iv',
        })),
        update: vi.fn(async () => ({})),
      },
      incomingInvoice: {
        findFirst: vi.fn(async () => null),
        update: vi.fn(async () => ({})),
        create: incomingInvoiceCreate,
      },
      contractor: { findUnique: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'new-contractor' })) },
    } as unknown as PrismaClient;

    const logger = { info: vi.fn(), error: vi.fn() } as never;

    queryIncomingInvoices.mockResolvedValue({
      invoiceHeaderList: [
        {
          ksefNumber: 'KSEF-REF-003',
          seller: { nip: '9876543210' },
          invoiceNumber: null,
        },
      ],
      hasMore: false,
    });

    fetchInvoiceXml.mockResolvedValue('<xml>invoice</xml>');

    await syncIncomingInvoicesFromKsef(
      prisma,
      'company-1',
      'encryption-key',
      'PRODUCTION',
      '2026-04-01',
      '2026-04-30',
      logger,
    );

    expect(incomingInvoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ksefEnvironment: 'PRODUCTION',
          companyId: 'company-1',
          source: 'ksef',
          ksefReference: 'KSEF-REF-003',
        }),
      }),
    );
  });
});
