import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { buildDashboardSummary } from './dashboard-summary.service.js';

describe('buildDashboardSummary()', () => {
  it('aggregates the active environment and returns accepted sales for the six-month chart', async () => {
    const invoiceCount = vi.fn()
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(2);
    const groupBy = vi.fn().mockResolvedValue([
      { status: 'ACCEPTED', _count: { _all: 2 } },
      { status: 'SUBMITTED', _count: { _all: 1 } },
      { status: 'QUEUED', _count: { _all: 1 } },
      { status: 'OFFLINE_QUEUED', _count: { _all: 1 } },
      { status: 'REJECTED', _count: { _all: 1 } },
    ]);
    const acceptedInvoices = [
      {
        issueDate: new Date('2026-05-10T00:00:00.000Z'),
        totalGross: new Prisma.Decimal('100.00'),
        totalVat: new Prisma.Decimal('23.00'),
      },
      {
        issueDate: new Date('2026-09-02T00:00:00.000Z'),
        totalGross: new Prisma.Decimal('200.00'),
        totalVat: new Prisma.Decimal('46.00'),
      },
    ];
    const recentInvoices = [{
      id: 'invoice-1',
      companyId: 'company-1',
      environment: 'TEST',
      contractorId: 'contractor-1',
      invoiceNumber: 'FV/1/2026',
      status: 'ISSUED',
      invoiceType: 'VAT',
      issueDate: new Date('2026-09-02T00:00:00.000Z'),
      totalNet: new Prisma.Decimal('200.00'),
      totalVat: new Prisma.Decimal('46.00'),
      totalGross: new Prisma.Decimal('200.00'),
      currency: 'PLN',
      ksefStates: [{ status: 'ACCEPTED' }],
      issuedAt: new Date('2026-09-02T01:00:00.000Z'),
      createdAt: new Date('2026-09-02T01:00:00.000Z'),
      updatedAt: new Date('2026-09-02T01:00:00.000Z'),
      contractor: { id: 'contractor-1', name: 'Example contractor', nip: '1234567890' },
    }];
    const findMany = vi.fn(async (args: { select: Record<string, unknown> }) =>
      'id' in args.select ? recentInvoices : acceptedInvoices);
    const incomingCount = vi.fn().mockResolvedValue(3);
    const contractorCount = vi.fn().mockResolvedValue(1);
    const prisma = {
      invoice: { count: invoiceCount, findMany },
      invoiceKsefState: { groupBy },
      incomingInvoice: { count: incomingCount },
      contractor: { count: contractorCount },
    } as unknown as PrismaClient;

    const result = await buildDashboardSummary(prisma, {
      companyId: 'company-1',
      environment: 'TEST',
      now: new Date('2026-09-15T12:00:00.000Z'),
    });

    expect(result).toEqual({
      environment: 'TEST',
      totalInvoices: 9,
      contractorCount: 1,
      ksefCounts: { accepted: 2, pending: 3, rejected: 1, notSubmitted: 2 },
      salesByMonth: [
        { year: 2026, month: 4, gross: '0.00', vat: '0.00', invoiceCount: 0 },
        { year: 2026, month: 5, gross: '100.00', vat: '23.00', invoiceCount: 1 },
        { year: 2026, month: 6, gross: '0.00', vat: '0.00', invoiceCount: 0 },
        { year: 2026, month: 7, gross: '0.00', vat: '0.00', invoiceCount: 0 },
        { year: 2026, month: 8, gross: '0.00', vat: '0.00', invoiceCount: 0 },
        { year: 2026, month: 9, gross: '200.00', vat: '46.00', invoiceCount: 1 },
      ],
      currentMonth: { gross: '200.00', vat: '46.00', invoiceCount: 1 },
      attention: { rejected: 1, notSubmitted: 2, incoming: 3 },
      recentInvoices: [{
        id: 'invoice-1',
        companyId: 'company-1',
        environment: 'TEST',
        contractorId: 'contractor-1',
        invoiceNumber: 'FV/1/2026',
        status: 'ISSUED',
        invoiceType: 'VAT',
        issueDate: '2026-09-02',
        totalNet: '200',
        totalVat: '46',
        totalGross: '200',
        currency: 'PLN',
        ksefStatus: 'accepted',
        issuedAt: '2026-09-02T01:00:00.000Z',
        createdAt: '2026-09-02T01:00:00.000Z',
        updatedAt: '2026-09-02T01:00:00.000Z',
        contractor: { id: 'contractor-1', name: 'Example contractor', nip: '1234567890' },
      }],
    });
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { environment: 'TEST', invoice: { companyId: 'company-1', environment: 'TEST', status: 'ISSUED' } },
    }));
    expect(incomingCount).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'company-1', environment: 'TEST' }),
    }));
  });
});
