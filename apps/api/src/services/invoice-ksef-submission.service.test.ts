import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import {
  buildIssuedInvoiceDataForKsefSubmission,
  type StoredInvoiceForKsefSubmission
} from './invoice-ksef-submission.service.js';

const buildStoredAmount = (value: string) => ({
  toString: () => value,
  toFixed: (fractionDigits: number) => Number(value).toFixed(fractionDigits)
});

const buildStoredInvoice = (
  overrides: Partial<StoredInvoiceForKsefSubmission> = {}
): StoredInvoiceForKsefSubmission => ({
  companyId: 'company-1',
  environment: 'TEST',
  invoiceNumber: 'FV 12/4/2026',
  issueDate: new Date('2026-04-10T00:00:00.000Z'),
  saleDate: new Date('2026-04-10T00:00:00.000Z'),
  invoiceType: 'VAT',
  paymentMethod: 'BANK_TRANSFER',
  paymentDueDate: new Date('2026-04-17T00:00:00.000Z'),
  currency: 'PLN',
  notes: 'April settlement',
  correctionReason: null,
  correctionImpactType: null,
  correctedInvoiceId: null,
  correctedKsefRef: null,
  sellerName: 'Snapshot Seller',
  sellerNip: '9999999999',
  sellerAddress1: 'Seller Street 1',
  sellerAddress2: 'Suite 2',
  buyerName: 'Snapshot Buyer',
  buyerNip: '8888888888',
  buyerAddress1: 'Buyer Street 3',
  buyerAddress2: 'Office 4',
  totalNet: buildStoredAmount('100.00'),
  totalVat: buildStoredAmount('23.00'),
  totalGross: buildStoredAmount('123.00'),
  lines: [
    {
      name: 'Consulting service',
      unit: 'hour',
      quantity: buildStoredAmount('2'),
      unitNetPrice: buildStoredAmount('50.00'),
      vatRate: '23'
    }
  ],
  company: {
    name: 'Company Fallback',
    nip: '1111111111',
    addressLine1: 'Company Street 1',
    addressLine2: 'Floor 2',
    bankAccount: '12 3456 7890 1234 5678 9012 3456'
  },
  contractor: {
    name: 'Contractor Fallback',
    nip: '2222222222',
    addressLine1: 'Contractor Street 5',
    addressLine2: 'Desk 6'
  },
  ...overrides
});

describe('buildIssuedInvoiceDataForKsefSubmission()', () => {
  it('builds VAT payload from stored invoice snapshots', async () => {
    const prisma = {
      invoice: { findUnique: vi.fn() }
    } as unknown as PrismaClient;

    const result = await buildIssuedInvoiceDataForKsefSubmission(prisma, buildStoredInvoice());

    expect(result).toEqual({
      invoiceNumber: 'FV 12/4/2026',
      issueDate: '2026-04-10',
      saleDate: '2026-04-10',
      invoiceType: 'VAT',
      currency: 'PLN',
      seller: {
        name: 'Snapshot Seller',
        nip: '9999999999',
        addressLine1: 'Seller Street 1',
        addressLine2: 'Suite 2'
      },
      buyer: {
        name: 'Snapshot Buyer',
        nip: '8888888888',
        addressLine1: 'Buyer Street 3',
        addressLine2: 'Office 4'
      },
      paymentMethod: 'bank_transfer',
      paymentDueDate: '2026-04-17',
      paymentBankAccount: '12 3456 7890 1234 5678 9012 3456',
      notes: 'April settlement',
      lines: [
        {
          description: 'Consulting service',
          quantity: '2',
          unit: 'hour',
          unitNetPrice: '50.00',
          vatRate: '23'
        }
      ],
      totalNet: '100.00',
      totalVat: '23.00',
      totalGross: '123.00'
    });
  });

  it('builds KOR payload with original invoice references required by FA(3)', async () => {
    const invoiceFindUnique = vi.fn(async () => ({
      companyId: 'company-1',
      environment: 'TEST',
      invoiceNumber: 'FV 9/3/2026',
      issueDate: new Date('2026-03-28T00:00:00.000Z')
    }));
    const prisma = {
      invoice: { findUnique: invoiceFindUnique }
    } as unknown as PrismaClient;

    const result = await buildIssuedInvoiceDataForKsefSubmission(
      prisma,
      buildStoredInvoice({
        invoiceNumber: 'KOR 1/4/2026',
        invoiceType: 'KOR',
        correctionReason: 'Price adjustment',
        correctionImpactType: '2',
        correctedInvoiceId: 'original-invoice-1',
        correctedKsefRef: '1234567890-20260328-ABCDEF-123456-78'
      })
    );

    expect(invoiceFindUnique).toHaveBeenCalledWith({
      where: { id: 'original-invoice-1' },
      select: { companyId: true, environment: true, invoiceNumber: true, issueDate: true }
    });
    expect(result.correction).toEqual({
      originalInvoiceNumber: 'FV 9/3/2026',
      originalIssueDate: '2026-03-28',
      originalKsefReferenceNumber: '1234567890-20260328-ABCDEF-123456-78',
      reason: 'Price adjustment',
      impactType: '2'
    });
  });

  it('fails fast when KOR invoice is missing original KSeF reference', async () => {
    const prisma = {
      invoice: { findUnique: vi.fn() }
    } as unknown as PrismaClient;

    await expect(
      buildIssuedInvoiceDataForKsefSubmission(
        prisma,
        buildStoredInvoice({
          invoiceType: 'KOR',
          correctedInvoiceId: 'original-invoice-1',
          correctedKsefRef: null
        })
      )
    ).rejects.toThrow('KOR invoice is missing correctedKsefRef (original KSeF reference)');
  });
});
