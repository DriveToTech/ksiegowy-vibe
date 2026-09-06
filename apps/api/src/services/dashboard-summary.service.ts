import type { KsefEnvironment, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface DashboardInvoiceSummary {
  id: string;
  companyId: string;
  environment: KsefEnvironment;
  contractorId: string | null;
  invoiceNumber: string | null;
  status: string;
  invoiceType: string;
  issueDate: string;
  totalNet: string;
  totalVat: string;
  totalGross: string;
  currency: string;
  ksefStatus: 'not_submitted' | 'pending' | 'accepted' | 'rejected';
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contractor: { id: string; name: string; nip: string | null } | null;
}

export interface DashboardSummary {
  environment: KsefEnvironment;
  totalInvoices: number;
  contractorCount: number;
  ksefCounts: {
    accepted: number;
    pending: number;
    rejected: number;
    notSubmitted: number;
  };
  salesByMonth: Array<{
    year: number;
    month: number;
    gross: string;
    vat: string;
    invoiceCount: number;
  }>;
  currentMonth: {
    gross: string;
    vat: string;
    invoiceCount: number;
  };
  attention: {
    rejected: number;
    notSubmitted: number;
    incoming: number;
  };
  recentInvoices: DashboardInvoiceSummary[];
}

const zero = new Prisma.Decimal(0);
const recentInvoiceLimit = 6;
const incomingNeedsActionStatuses = ['UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED'] as const;

const toKsefStatus = (status: string): DashboardInvoiceSummary['ksefStatus'] => {
  if (status === 'ACCEPTED') return 'accepted';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'SUBMITTED' || status === 'QUEUED' || status === 'OFFLINE_QUEUED') return 'pending';
  return 'not_submitted';
};

const monthStart = (year: number, month: number) => new Date(Date.UTC(year, month, 1));

const formatDecimal = (value: Prisma.Decimal | null | undefined): string => (value ?? zero).toFixed(2);

export const buildDashboardSummary = async (
  prisma: PrismaClient,
  params: { companyId: string; environment: KsefEnvironment; now?: Date },
): Promise<DashboardSummary> => {
  const now = params.now ?? new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const firstMonth = monthStart(currentYear, currentMonth - 5);
  const nextMonth = monthStart(currentYear, currentMonth + 1);
  const issuedInvoiceWhere = {
    companyId: params.companyId,
    environment: params.environment,
    status: 'ISSUED' as const,
  };

  const [
    totalInvoices,
    ksefStatusGroups,
    notSubmitted,
    incoming,
    contractorCount,
    acceptedInvoices,
    recentInvoices,
  ] = await Promise.all([
    prisma.invoice.count({
      where: { companyId: params.companyId, environment: params.environment },
    }),
    prisma.invoiceKsefState.groupBy({
      by: ['status'],
      where: {
        environment: params.environment,
        invoice: issuedInvoiceWhere,
      },
      _count: { _all: true },
    }),
    prisma.invoice.count({
      where: {
        ...issuedInvoiceWhere,
        OR: [
          { ksefStates: { none: { environment: params.environment } } },
          { ksefStates: { some: { environment: params.environment, status: 'NOT_SENT' } } },
        ],
      },
    }),
    prisma.incomingInvoice.count({
      where: {
        companyId: params.companyId,
        environment: params.environment,
        status: { in: [...incomingNeedsActionStatuses] },
      },
    }),
    prisma.contractor.count({
      where: { companyId: params.companyId, isActive: true },
    }),
    prisma.invoice.findMany({
      where: {
        ...issuedInvoiceWhere,
        issueDate: { gte: firstMonth, lt: nextMonth },
        ksefStates: { some: { environment: params.environment, status: 'ACCEPTED' } },
      },
      select: { issueDate: true, totalGross: true, totalVat: true },
    }),
    prisma.invoice.findMany({
      where: { companyId: params.companyId, environment: params.environment },
      orderBy: { createdAt: 'desc' },
      take: recentInvoiceLimit,
      select: {
        id: true,
        companyId: true,
        environment: true,
        contractorId: true,
        invoiceNumber: true,
        status: true,
        invoiceType: true,
        issueDate: true,
        totalNet: true,
        totalVat: true,
        totalGross: true,
        currency: true,
        ksefStates: {
          where: { environment: params.environment },
          select: { status: true },
        },
        issuedAt: true,
        createdAt: true,
        updatedAt: true,
        contractor: { select: { id: true, name: true, nip: true } },
      },
    }),
  ]);

  const countByStatus = new Map(ksefStatusGroups.map((group) => [group.status, group._count._all]));
  const salesByMonth = Array.from({ length: 6 }, (_, index) => {
    const date = monthStart(currentYear, currentMonth - (5 - index));
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      gross: zero,
      vat: zero,
      invoiceCount: 0,
    };
  });

  for (const invoice of acceptedInvoices) {
    const invoiceYear = invoice.issueDate.getUTCFullYear();
    const invoiceMonth = invoice.issueDate.getUTCMonth() + 1;
    const bucket = salesByMonth.find((item) => item.year === invoiceYear && item.month === invoiceMonth);
    if (!bucket) continue;
    bucket.gross = bucket.gross.plus(invoice.totalGross);
    bucket.vat = bucket.vat.plus(invoice.totalVat);
    bucket.invoiceCount += 1;
  }

  const currentMonthBucket = salesByMonth[salesByMonth.length - 1]!;

  return {
    environment: params.environment,
    totalInvoices,
    contractorCount,
    ksefCounts: {
      accepted: countByStatus.get('ACCEPTED') ?? 0,
      pending: (countByStatus.get('SUBMITTED') ?? 0)
        + (countByStatus.get('QUEUED') ?? 0)
        + (countByStatus.get('OFFLINE_QUEUED') ?? 0),
      rejected: countByStatus.get('REJECTED') ?? 0,
      notSubmitted,
    },
    salesByMonth: salesByMonth.map((bucket) => ({
      year: bucket.year,
      month: bucket.month,
      gross: formatDecimal(bucket.gross),
      vat: formatDecimal(bucket.vat),
      invoiceCount: bucket.invoiceCount,
    })),
    currentMonth: {
      gross: formatDecimal(currentMonthBucket.gross),
      vat: formatDecimal(currentMonthBucket.vat),
      invoiceCount: currentMonthBucket.invoiceCount,
    },
    attention: { rejected: countByStatus.get('REJECTED') ?? 0, notSubmitted, incoming },
    recentInvoices: recentInvoices.map((invoice) => ({
      id: invoice.id,
      companyId: invoice.companyId,
      environment: invoice.environment,
      contractorId: invoice.contractorId,
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      invoiceType: invoice.invoiceType,
      issueDate: invoice.issueDate.toISOString().slice(0, 10),
      totalNet: invoice.totalNet.toString(),
      totalVat: invoice.totalVat.toString(),
      totalGross: invoice.totalGross.toString(),
      currency: invoice.currency,
      ksefStatus: toKsefStatus(invoice.ksefStates[0]?.status ?? 'NOT_SENT'),
      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
      contractor: invoice.contractor,
    })),
  };
};
