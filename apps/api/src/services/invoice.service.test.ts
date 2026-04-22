import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { assignNextInvoiceNumber, createInvoiceDraft } from './invoice.service.js';

// ── assignNextInvoiceNumber ────────────────────────────────────────────────────

describe('assignNextInvoiceNumber()', () => {
  const buildPrismaWithSeq = (existingSeq: Record<string, number>) => {
    const companyUpdate = vi.fn(async () => ({}));

    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<string>) => {
        const tx = {
          $queryRaw: vi.fn(async () => [{ invoice_seq: existingSeq }]),
          company: { update: companyUpdate }
        };
        return callback(tx);
      })
    } as unknown as PrismaClient;

    return { prisma, companyUpdate };
  };

  it('returns "FV 1/month/year" for the first invoice in a new period', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({});

    const result = await assignNextInvoiceNumber(prisma, 'company-1', new Date('2025-04-15'));

    expect(result).toBe('FV 1/4/2025');
    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4': 1 } }
    });
  });

  it('increments seq for a second invoice in the same period', async () => {
    const { prisma } = buildPrismaWithSeq({ '2025-4': 1 });

    const result = await assignNextInvoiceNumber(prisma, 'company-1', new Date('2025-04-20'));

    expect(result).toBe('FV 2/4/2025');
  });

  it('starts seq at 1 for a new period without affecting other periods', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({ '2025-3': 5 });

    const result = await assignNextInvoiceNumber(prisma, 'company-1', new Date('2025-04-01'));

    expect(result).toBe('FV 1/4/2025');
    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-3': 5, '2025-4': 1 } }
    });
  });

  it('formats month without leading zero (January → 1, not 01)', async () => {
    const { prisma } = buildPrismaWithSeq({});

    const result = await assignNextInvoiceNumber(prisma, 'company-1', new Date('2025-01-10'));

    expect(result).toBe('FV 1/1/2025');
  });

  it('throws when company is not found', async () => {
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<string>) => {
        const tx = {
          $queryRaw: vi.fn(async () => []),
          company: { update: vi.fn() }
        };
        return callback(tx);
      })
    } as unknown as PrismaClient;

    await expect(
      assignNextInvoiceNumber(prisma, 'nonexistent', new Date('2025-04-01'))
    ).rejects.toThrow('Company nonexistent not found');
  });

  it('uses custom pattern to format the invoice number', async () => {
    const { prisma } = buildPrismaWithSeq({});

    const result = await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'VAT',
      'FV/{YEAR}/{MONTH_PAD}/{SEQ}'
    );

    expect(result).toBe('FV/2025/04/1');
  });

  it('uses yearly period key when pattern contains only {YEAR}', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({ '2025': 3 });

    const result = await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'VAT',
      'FV/{YEAR}/{SEQ}'
    );

    expect(result).toBe('FV/2025/4');
    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025': 4 } }
    });
  });

  it('uses daily period key when pattern contains {DAY_PAD}', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({});

    await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'VAT',
      'FV/{YEAR}/{MONTH_PAD}/{DAY_PAD}/{SEQ}'
    );

    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4-15': 1 } }
    });
  });

  it('substitutes {CONTRACTOR_NIP} and uses per-contractor period key', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({ '2025-4-9876543210': 2 });

    const result = await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'VAT',
      '{CONTRACTOR_NIP}/{YEAR}/{MONTH_PAD}/{SEQ}',
      '9876543210'
    );

    expect(result).toBe('9876543210/2025/04/3');
    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4-9876543210': 3 } }
    });
  });

  it('two contractors with {CONTRACTOR_NIP} pattern each get their own counter starting at 1', async () => {
    const { prisma: prismaA, companyUpdate: updateA } = buildPrismaWithSeq({});
    const resultA = await assignNextInvoiceNumber(
      prismaA, 'company-1', new Date('2025-04-15'), 'VAT',
      '{CONTRACTOR_NIP}/{YEAR}/{MONTH_PAD}/{SEQ}', '1111111111'
    );
    expect(resultA).toBe('1111111111/2025/04/1');
    expect(updateA).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4-1111111111': 1 } }
    });

    const { prisma: prismaB, companyUpdate: updateB } = buildPrismaWithSeq({});
    const resultB = await assignNextInvoiceNumber(
      prismaB, 'company-1', new Date('2025-04-15'), 'VAT',
      '{CONTRACTOR_NIP}/{YEAR}/{MONTH_PAD}/{SEQ}', '2222222222'
    );
    expect(resultB).toBe('2222222222/2025/04/1');
    expect(updateB).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4-2222222222': 1 } }
    });
  });

  it('falls back to default format when pattern is null', async () => {
    const { prisma } = buildPrismaWithSeq({});

    const result = await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'VAT',
      null
    );

    expect(result).toBe('FV 1/4/2025');
  });

  it('KOR invoice uses separate counter with KOR- prefix on period key', async () => {
    const { prisma, companyUpdate } = buildPrismaWithSeq({ '2025-4': 5 });

    const result = await assignNextInvoiceNumber(
      prisma,
      'company-1',
      new Date('2025-04-15'),
      'KOR',
      null
    );

    expect(result).toBe('KOR 1/4/2025');
    expect(companyUpdate).toHaveBeenCalledWith({
      where: { id: 'company-1' },
      data: { invoiceSeq: { '2025-4': 5, 'KOR-2025-4': 1 } }
    });
  });
});

// ── createInvoiceDraft ─────────────────────────────────────────────────────────

describe('createInvoiceDraft()', () => {
  const buildPrisma = (returnValue: object = {}) => {
    const invoiceCreate = vi.fn(async () => returnValue);
    const prisma = {
      invoice: { create: invoiceCreate }
    } as unknown as PrismaClient;
    return { prisma, invoiceCreate };
  };

  it('calls prisma.invoice.create with calculated totals for a single 23% line', async () => {
    const { prisma, invoiceCreate } = buildPrisma({ id: 'inv-1', lines: [], vatBreakdown: [] });

    await createInvoiceDraft(prisma, {
      companyId: 'company-1',
      issueDate: '2025-04-01',
      lines: [
        { position: 1, name: 'Service', quantity: '1', unitNetPrice: '100.00', vatRate: '23' }
      ]
    });

    expect(invoiceCreate).toHaveBeenCalledOnce();
    const callArg = invoiceCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(callArg.data.totalNet).toBe('100.00');
    expect(callArg.data.totalVat).toBe('23.00');
    expect(callArg.data.totalGross).toBe('123.00');
  });

  it('defaults unit to "szt" when line has no unit', async () => {
    const { prisma, invoiceCreate } = buildPrisma({ id: 'inv-1', lines: [], vatBreakdown: [] });

    await createInvoiceDraft(prisma, {
      companyId: 'company-1',
      issueDate: '2025-04-01',
      lines: [
        { position: 1, name: 'Service', quantity: '1', unitNetPrice: '10.00', vatRate: '23' }
      ]
    });

    const callArg = invoiceCreate.mock.calls[0]![0] as { data: { lines: { create: Array<{ unit: string }> } } };
    expect(callArg.data.lines.create[0]!.unit).toBe('szt');
  });

  it('defaults paymentMethod to "BANK_TRANSFER"', async () => {
    const { prisma, invoiceCreate } = buildPrisma({ id: 'inv-1', lines: [], vatBreakdown: [] });

    await createInvoiceDraft(prisma, {
      companyId: 'company-1',
      issueDate: '2025-04-01',
      lines: [
        { position: 1, name: 'Service', quantity: '1', unitNetPrice: '10.00', vatRate: '23' }
      ]
    });

    const callArg = invoiceCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(callArg.data.paymentMethod).toBe('BANK_TRANSFER');
  });

  it('saves optional fields as null when not provided', async () => {
    const { prisma, invoiceCreate } = buildPrisma({ id: 'inv-1', lines: [], vatBreakdown: [] });

    await createInvoiceDraft(prisma, {
      companyId: 'company-1',
      issueDate: '2025-04-01',
      lines: [
        { position: 1, name: 'Service', quantity: '1', unitNetPrice: '10.00', vatRate: '23' }
      ]
    });

    const callArg = invoiceCreate.mock.calls[0]![0] as { data: Record<string, unknown> };
    expect(callArg.data.contractorId).toBeNull();
    expect(callArg.data.saleDate).toBeNull();
    expect(callArg.data.paymentDueDate).toBeNull();
    expect(callArg.data.notes).toBeNull();
  });

  it('uses provided unit when specified', async () => {
    const { prisma, invoiceCreate } = buildPrisma({ id: 'inv-1', lines: [], vatBreakdown: [] });

    await createInvoiceDraft(prisma, {
      companyId: 'company-1',
      issueDate: '2025-04-01',
      lines: [
        { position: 1, name: 'Service', unit: 'usł.', quantity: '1', unitNetPrice: '10.00', vatRate: '23' }
      ]
    });

    const callArg = invoiceCreate.mock.calls[0]![0] as { data: { lines: { create: Array<{ unit: string }> } } };
    expect(callArg.data.lines.create[0]!.unit).toBe('usł.');
  });
});
