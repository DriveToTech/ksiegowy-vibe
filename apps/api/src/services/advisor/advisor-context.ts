import { Prisma, type PrismaClient, type KsefEnvironment } from '@prisma/client';
import type { AdvisorCalculation, AdvisorEvidence, AdvisorScope } from '@ksiegowy/types';
import { AdvisorError } from './advisor-contract.js';
import { issuedInvoiceFinancialScope } from '../invoice-financial-scope.js';

export async function buildAdvisorContext(database: PrismaClient, companyId: string, environment: KsefEnvironment, scope: AdvisorScope, includeEvidence = true) {
  if (!scope.includeRecords) return { calculations: [], evidence: [], evidenceTruncated: false };
  const start = new Date(`${scope.period}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const period = { gte: start, lt: end };
  const invoiceWhere = { companyId, environment, issueDate: period };
  const issuedWhere = { ...issuedInvoiceFinancialScope(companyId, environment), issueDate: period };
  const [issued, accepted, outgoing, incoming] = await Promise.all([
    database.invoice.groupBy({ by: ['currency'], where: issuedWhere, _sum: { totalGross: true, totalVat: true }, _count: { _all: true } }),
    database.invoice.groupBy({ by: ['currency'], where: { ...issuedWhere, ksefStates: { some: { environment, status: 'ACCEPTED' } } }, _sum: { totalGross: true } }),
    !includeEvidence || scope.documentKind === 'incoming' ? Promise.resolve([]) : database.invoice.findMany({
      where: { ...invoiceWhere, ...(scope.documentId ? { id: scope.documentId } : {}) },
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], take: 21,
      select: { id: true, invoiceNumber: true, status: true, currency: true, totalGross: true, totalVat: true, updatedAt: true },
    }),
    !includeEvidence || scope.documentKind === 'outgoing' ? Promise.resolve([]) : database.incomingInvoice.findMany({
      where: { ...invoiceWhere, ...(scope.documentId ? { id: scope.documentId } : {}) },
      orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], take: 21,
      select: { id: true, invoiceNumber: true, status: true, currency: true, totalGross: true, totalVat: true, updatedAt: true },
    }),
  ]);
  if (scope.documentId && !outgoing.length && !incoming.length) {
    throw new AdvisorError(404, 'DOCUMENT_NOT_FOUND', 'Document is unavailable in the selected company, environment and period');
  }
  const zero = new Prisma.Decimal(0);
  const calculations: AdvisorCalculation[] = issued.map((group) => ({ currency: group.currency,
    issuedGross: (group._sum.totalGross ?? zero).toFixed(2), issuedVat: (group._sum.totalVat ?? zero).toFixed(2),
    acceptedGross: (accepted.find((entry) => entry.currency === group.currency)?._sum.totalGross ?? zero).toFixed(2),
    invoiceCount: group._count._all,
  }));
  const evidence: AdvisorEvidence[] = [
    ...outgoing.slice(0, 20).map((record) => ({ ...record, kind: 'outgoing' as const })),
    ...incoming.slice(0, 20).map((record) => ({ ...record, kind: 'incoming' as const })),
  ].map((record) => ({ id: record.id, kind: record.kind, title: record.invoiceNumber ?? record.id,
    status: record.status, currency: record.currency ?? 'UNKNOWN', gross: record.totalGross?.toFixed(2) ?? null,
    vat: record.totalVat?.toFixed(2) ?? null, updatedAt: record.updatedAt.toISOString() }));
  return { calculations, evidence, evidenceTruncated: outgoing.length > 20 || incoming.length > 20 };
}
