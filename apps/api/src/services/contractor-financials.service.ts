import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContractorSummary {
  contractorId: string;
  year: number;
  turnover: string;
  paidThisYear: string;
  outstanding: string;
  recentDocuments: Array<{
    id: string;
    invoiceNumber: string | null;
    invoiceType: 'VAT' | 'KOR' | 'ZAL' | 'ROZ' | 'UPR';
    issueDate: string;
    totalGross: string;
  }>;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const zero = new Prisma.Decimal(0);

const formatMoney = (value: Prisma.Decimal | null): string => (value ?? zero).toFixed(2);

const yearRange = (year: number) => ({
  gte: new Date(Date.UTC(year, 0, 1)),
  lt: new Date(Date.UTC(year + 1, 0, 1))
});

/**
 * Turnover aggregation must exclude FORMAL corrections: they store a full
 * positive duplicate of the original invoice's totals, so including them would
 * roughly double the contractor's real turnover. CANCELLATION corrections
 * store negative totals and must stay included so they net the sum back down.
 */
const turnoverWhere = (companyId: string, environment: KsefEnvironment) => ({
  companyId,
  environment,
  status: 'ISSUED' as const,
  NOT: { correctionMode: 'FORMAL' as const }
});

// ── Queries ────────────────────────────────────────────────────────────────────

/**
 * Sums year-to-date gross turnover per contractor for a company, in one query.
 */
export const sumTurnoverByContractor = async (
  prisma: PrismaClient,
  params: { companyId: string; environment: KsefEnvironment; year: number }
): Promise<Map<string, Prisma.Decimal>> => {
  const groups = await prisma.invoice.groupBy({
    by: ['contractorId'],
    where: {
      ...turnoverWhere(params.companyId, params.environment),
      contractorId: { not: null },
      issueDate: yearRange(params.year)
    },
    _sum: { totalGross: true }
  });

  return new Map(groups.map((group) => [group.contractorId as string, group._sum.totalGross ?? zero]));
};

/**
 * Builds the financial summary card for a single contractor: year-scoped
 * turnover/paid, all-time outstanding balance, and the most recent documents.
 */
export const buildContractorSummary = async (
  prisma: PrismaClient,
  params: { companyId: string; contractorId: string; environment: KsefEnvironment; year: number }
): Promise<ContractorSummary> => {
  const baseWhere = { ...turnoverWhere(params.companyId, params.environment), contractorId: params.contractorId };

  const [yearTotals, allTimeTotals, recentInvoices] = await Promise.all([
    prisma.invoice.aggregate({
      where: { ...baseWhere, issueDate: yearRange(params.year) },
      _sum: { totalGross: true, paymentReceived: true }
    }),
    prisma.invoice.aggregate({
      where: baseWhere,
      _sum: { totalGross: true, paymentReceived: true }
    }),
    prisma.invoice.findMany({
      where: { companyId: params.companyId, contractorId: params.contractorId, environment: params.environment },
      orderBy: { issueDate: 'desc' },
      take: 3,
      select: { id: true, invoiceNumber: true, invoiceType: true, issueDate: true, totalGross: true }
    })
  ]);

  const outstandingRaw = (allTimeTotals._sum.totalGross ?? zero).minus(allTimeTotals._sum.paymentReceived ?? zero);
  const outstanding = outstandingRaw.lessThan(0) ? zero : outstandingRaw;

  return {
    contractorId: params.contractorId,
    year: params.year,
    turnover: formatMoney(yearTotals._sum.totalGross),
    paidThisYear: formatMoney(yearTotals._sum.paymentReceived),
    outstanding: outstanding.toFixed(2),
    recentDocuments: recentInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceType: invoice.invoiceType,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      totalGross: formatMoney(invoice.totalGross)
    }))
  };
};
