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
  it('does not load records without consent', async () => {
    const database = Builder<PrismaClient>().build();
    expect(await buildAdvisorContext(database, 'company', 'TEST', { period: '2026-09', questionKind: 'records', includeRecords: false })).toEqual({ calculations: [], evidence: [], evidenceTruncated: false });
  });
});
