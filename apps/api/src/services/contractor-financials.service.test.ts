import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { buildContractorSummary, sumTurnoverByContractor } from './contractor-financials.service.js';

// ── sumTurnoverByContractor() ───────────────────────────────────────────────

describe('sumTurnoverByContractor()', () => {
  it('excludes FORMAL corrections from the aggregation where clause, while CANCELLATION corrections stay included and net the sum down', async () => {
    // Simulates: an original ISSUED invoice of 1000.00, a FORMAL correction that
    // duplicates it at 1000.00 (must be excluded from the DB-side sum by the
    // where clause below, or turnover would double), and a CANCELLATION
    // correction of -1000.00 (must stay included, netting the contractor's
    // turnover back to 0.00). The where clause is what makes Postgres apply
    // that exclusion, so asserting it is the load-bearing check here.
    const groupBy = vi.fn(async () => [
      { contractorId: 'contractor-1', _sum: { totalGross: new Prisma.Decimal('0.00') } }
    ]);
    const prisma = { invoice: { groupBy } } as unknown as PrismaClient;

    const result = await sumTurnoverByContractor(prisma, {
      companyId: 'company-1',
      environment: 'TEST',
      year: 2026
    });

    expect(groupBy).toHaveBeenCalledWith({
      by: ['contractorId'],
      where: {
        companyId: 'company-1',
        environment: 'TEST',
        status: 'ISSUED',
        NOT: { correctionMode: 'FORMAL' },
        contractorId: { not: null },
        issueDate: {
          gte: new Date(Date.UTC(2026, 0, 1)),
          lt: new Date(Date.UTC(2027, 0, 1))
        }
      },
      _sum: { totalGross: true }
    });
    expect(result.get('contractor-1')?.toFixed(2)).toBe('0.00');
  });

  it('builds a Map keyed by contractorId, defaulting a null _sum to zero', async () => {
    const groupBy = vi.fn(async () => [
      { contractorId: 'contractor-1', _sum: { totalGross: new Prisma.Decimal('128400.00') } },
      { contractorId: 'contractor-2', _sum: { totalGross: null } }
    ]);
    const prisma = { invoice: { groupBy } } as unknown as PrismaClient;

    const result = await sumTurnoverByContractor(prisma, {
      companyId: 'company-1',
      environment: 'PRODUCTION',
      year: 2026
    });

    expect(result.get('contractor-1')?.toFixed(2)).toBe('128400.00');
    expect(result.get('contractor-2')?.toFixed(2)).toBe('0.00');
  });
});

// ── buildContractorSummary() ────────────────────────────────────────────────

describe('buildContractorSummary()', () => {
  const buildPrisma = (overrides: {
    yearSum?: { totalGross: Prisma.Decimal | null; paymentReceived: Prisma.Decimal | null };
    allTimeSum?: { totalGross: Prisma.Decimal | null; paymentReceived: Prisma.Decimal | null };
    recentInvoices?: Array<{
      id: string;
      invoiceNumber: string | null;
      invoiceType: 'VAT' | 'KOR' | 'ZAL' | 'ROZ' | 'UPR';
      issueDate: Date;
      totalGross: Prisma.Decimal;
    }>;
  } = {}) => {
    const aggregate = vi.fn(async ({ where }: { where: { issueDate?: unknown } }) => ({
      _sum: where.issueDate
        ? overrides.yearSum ?? { totalGross: new Prisma.Decimal('0'), paymentReceived: new Prisma.Decimal('0') }
        : overrides.allTimeSum ?? { totalGross: new Prisma.Decimal('0'), paymentReceived: new Prisma.Decimal('0') }
    }));
    const findMany = vi.fn(async () => overrides.recentInvoices ?? []);
    const prisma = { invoice: { aggregate, findMany } } as unknown as PrismaClient;
    return { prisma, aggregate, findMany };
  };

  it('reports outstanding as an all-time balance while turnover and paidThisYear stay year-scoped', async () => {
    const { prisma, aggregate, findMany } = buildPrisma({
      yearSum: { totalGross: new Prisma.Decimal('5000.00'), paymentReceived: new Prisma.Decimal('3000.00') },
      allTimeSum: { totalGross: new Prisma.Decimal('20000.00'), paymentReceived: new Prisma.Decimal('12000.00') },
      recentInvoices: [
        { id: 'invoice-1', invoiceNumber: 'FV 3/8/2026', invoiceType: 'VAT', issueDate: new Date('2026-08-01'), totalGross: new Prisma.Decimal('2000.00') }
      ]
    });

    const result = await buildContractorSummary(prisma, {
      companyId: 'company-1',
      contractorId: 'contractor-1',
      environment: 'TEST',
      year: 2026
    });

    expect(result).toEqual({
      contractorId: 'contractor-1',
      year: 2026,
      turnover: '5000.00',
      paidThisYear: '3000.00',
      outstanding: '8000.00',
      recentDocuments: [
        { id: 'invoice-1', invoiceNumber: 'FV 3/8/2026', invoiceType: 'VAT', issueDate: '2026-08-01', totalGross: '2000.00' }
      ]
    });
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', contractorId: 'contractor-1', environment: 'TEST' },
      orderBy: { issueDate: 'desc' },
      take: 3,
      select: { id: true, invoiceNumber: true, invoiceType: true, issueDate: true, totalGross: true }
    });
  });

  it('clamps outstanding at zero when payments exceed the invoiced total (overpayment)', async () => {
    const { prisma } = buildPrisma({
      allTimeSum: { totalGross: new Prisma.Decimal('1000.00'), paymentReceived: new Prisma.Decimal('1500.00') }
    });

    const result = await buildContractorSummary(prisma, {
      companyId: 'company-1',
      contractorId: 'contractor-1',
      environment: 'TEST',
      year: 2026
    });

    expect(result.outstanding).toBe('0.00');
  });
});
