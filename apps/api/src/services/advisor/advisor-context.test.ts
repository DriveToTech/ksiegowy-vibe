import { Builder } from 'builder-pattern';
import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { buildAdvisorContext } from './advisor-context.js';

describe('buildAdvisorContext()', () => {
  it('keeps currencies separate and excludes formal corrections without excluding null correction modes', async () => {
    const groups = vi.fn().mockResolvedValueOnce([
      { currency: 'PLN', _sum: { totalGross: new Prisma.Decimal('123.45'), totalVat: new Prisma.Decimal('23.45') }, _count: { _all: 2 } },
      { currency: 'EUR', _sum: { totalGross: new Prisma.Decimal('-20'), totalVat: new Prisma.Decimal('-4') }, _count: { _all: 1 } },
    ]).mockResolvedValueOnce([{ currency: 'PLN', _sum: { totalGross: new Prisma.Decimal('100') } }]);
    const database = Builder<PrismaClient>().invoice({ groupBy: groups, findMany: vi.fn().mockResolvedValue([]) } as never)
      .incomingInvoice({ findMany: vi.fn().mockResolvedValue([]) } as never).build();
    const result = await buildAdvisorContext(database, 'company', 'TEST', { period: '2026-09', questionKind: 'records', includeRecords: true });
    expect(result).toEqual({ evidence: [], evidenceTruncated: false, calculations: [
      { currency: 'PLN', issuedGross: '123.45', issuedVat: '23.45', acceptedGross: '100.00', invoiceCount: 2 },
      { currency: 'EUR', issuedGross: '-20.00', issuedVat: '-4.00', acceptedGross: '0.00', invoiceCount: 1 },
    ] });
    expect(groups).toHaveBeenNthCalledWith(1, { by: ['currency'], where: { companyId: 'company', environment: 'TEST', status: 'ISSUED',
      OR: [{ correctionMode: null }, { correctionMode: { not: 'FORMAL' } }], issueDate: { gte: new Date('2026-09-01'), lt: new Date('2026-10-01') } },
      _sum: { totalGross: true, totalVat: true }, _count: { _all: true } });
  });
  it('uses UTC half-open month boundaries across the December to January rollover', async () => {
    const groups = vi.fn().mockResolvedValue([]);
    const outgoing = vi.fn().mockResolvedValue([]);
    const incoming = vi.fn().mockResolvedValue([]);
    const database = Builder<PrismaClient>().invoice({ groupBy: groups, findMany: outgoing } as never)
      .incomingInvoice({ findMany: incoming } as never).build();
    await buildAdvisorContext(database, 'company', 'PRODUCTION', { period: '2026-12', questionKind: 'records', includeRecords: true });
    const period = { gte: new Date('2026-12-01T00:00:00.000Z'), lt: new Date('2027-01-01T00:00:00.000Z') };
    expect(groups).toHaveBeenNthCalledWith(1, { by: ['currency'], where: { companyId: 'company', environment: 'PRODUCTION',
      status: 'ISSUED', OR: [{ correctionMode: null }, { correctionMode: { not: 'FORMAL' } }], issueDate: period },
      _sum: { totalGross: true, totalVat: true }, _count: { _all: true } });
    expect(groups).toHaveBeenNthCalledWith(2, { by: ['currency'], where: { companyId: 'company', environment: 'PRODUCTION',
      status: 'ISSUED', OR: [{ correctionMode: null }, { correctionMode: { not: 'FORMAL' } }], issueDate: period,
      ksefStates: { some: { environment: 'PRODUCTION', status: 'ACCEPTED' } } }, _sum: { totalGross: true } });
    expect(outgoing).toHaveBeenCalledWith({ where: { companyId: 'company', environment: 'PRODUCTION', issueDate: period },
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], take: 21,
      select: { id: true, invoiceNumber: true, status: true, currency: true, totalGross: true, totalVat: true, updatedAt: true } });
    expect(incoming).toHaveBeenCalledWith({ where: { companyId: 'company', environment: 'PRODUCTION', issueDate: period },
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], take: 21,
      select: { id: true, invoiceNumber: true, status: true, currency: true, totalGross: true, totalVat: true, updatedAt: true } });
  });

  it('does not infer payment balances from partially paid invoices or unconfirmed incoming documents', async () => {
    const groups = vi.fn().mockResolvedValueOnce([
      { currency: 'PLN', _sum: { totalGross: new Prisma.Decimal('150.00'), totalVat: new Prisma.Decimal('28.05') }, _count: { _all: 2 } },
    ]).mockResolvedValueOnce([{ currency: 'PLN', _sum: { totalGross: new Prisma.Decimal('100.00') } }]);
    const database = Builder<PrismaClient>().invoice({ groupBy: groups, findMany: vi.fn().mockResolvedValue([
      { id: 'partial', invoiceNumber: 'FV/1', status: 'ISSUED', currency: 'PLN', totalGross: new Prisma.Decimal('100'),
        totalVat: new Prisma.Decimal('18.70'), paymentReceived: new Prisma.Decimal('40'), updatedAt: new Date('2026-02-14T12:00:00Z') },
    ]) } as never).incomingInvoice({ findMany: vi.fn().mockResolvedValue([
      { id: 'incoming', invoiceNumber: 'IN/1', status: 'PENDING', currency: 'PLN', totalGross: new Prisma.Decimal('50'),
        totalVat: new Prisma.Decimal('9.35'), updatedAt: new Date('2026-02-14T13:00:00Z') },
    ]) } as never).build();
    expect(await buildAdvisorContext(database, 'company', 'TEST', { period: '2026-02', questionKind: 'records', includeRecords: true })).toEqual({
      calculations: [{ currency: 'PLN', issuedGross: '150.00', issuedVat: '28.05', acceptedGross: '100.00', invoiceCount: 2 }],
      evidence: [
        { id: 'partial', kind: 'outgoing', title: 'FV/1', status: 'ISSUED', currency: 'PLN', gross: '100.00', vat: '18.70', updatedAt: '2026-02-14T12:00:00.000Z' },
        { id: 'incoming', kind: 'incoming', title: 'IN/1', status: 'PENDING', currency: 'PLN', gross: '50.00', vat: '9.35', updatedAt: '2026-02-14T13:00:00.000Z' },
      ], evidenceTruncated: false,
    });
  });

  it('does not load records without consent', async () => {
    const database = Builder<PrismaClient>().build();
    expect(await buildAdvisorContext(database, 'company', 'TEST', { period: '2026-09', questionKind: 'records', includeRecords: false })).toEqual({ calculations: [], evidence: [], evidenceTruncated: false });
  });
});
