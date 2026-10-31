import { Prisma, type PrismaClient, type KsefEnvironment } from '@prisma/client';
import type { AdvisorCalculation, AdvisorEvidence, AdvisorScope } from '@ksiegowy/types';
import { AdvisorError } from './advisor-contract.js';
import { issuedInvoiceFinancialScope } from '../invoice-financial-scope.js';

// Document-derived text is attacker-controlled (supplier-chosen invoice numbers, contractor names): keep only a short, inert character set.
function normaliseDocumentText(text: string | null | undefined, fallback: string) {
  const normalised = (text ?? '').slice(0, 64).replace(/[^\p{L}\p{N} /._\-#]/gu, '_').trim();
  return normalised || fallback;
}

export async function buildAdvisorContext(database: PrismaClient, companyId: string, environment: KsefEnvironment, scope: AdvisorScope, includeEvidence = true) {
  if (!scope.includeRecords) return { calculations: [], evidence: [], evidenceTruncated: false };
  if (scope.contractorId) {
    const contractor = await database.contractor.findFirst({
      where: { id: scope.contractorId, companyId }, select: { id: true, name: true },
    });
    if (!contractor) throw new AdvisorError(404, 'CONTRACTOR_NOT_FOUND', 'Contractor is unavailable in this company');
    const start = new Date(`${scope.period}-01T00:00:00.000Z`);
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const invoiceWhere = {
      ...issuedInvoiceFinancialScope(companyId, environment), contractorId: contractor.id,
      issueDate: { lt: end },
    };
    const [totals, invoices] = await Promise.all([
      database.invoice.groupBy({ by: ['currency'], where: invoiceWhere,
        _sum: { totalGross: true, paymentReceived: true } }),
      includeEvidence ? database.invoice.findMany({ where: invoiceWhere, orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], take: 21,
        select: { id: true, invoiceNumber: true, status: true, currency: true, totalGross: true, totalVat: true, updatedAt: true } }) : Promise.resolve([]),
    ]);
    const zero = new Prisma.Decimal(0);
    return {
      calculations: [],
      contractorBalance: { contractorId: contractor.id, name: normaliseDocumentText(contractor.name, contractor.id), period: scope.period,
        balances: totals.map((group) => ({ currency: group.currency,
          currentOutstanding: Prisma.Decimal.max(zero, (group._sum.totalGross ?? zero).minus(group._sum.paymentReceived ?? zero)).toFixed(2),
          recordedPayments: (group._sum.paymentReceived ?? zero).toFixed(2) })) },
      evidence: invoices.slice(0, 20).map((invoice) => ({ id: invoice.id, kind: 'outgoing' as const, title: normaliseDocumentText(invoice.invoiceNumber, invoice.id),
        status: invoice.status, currency: invoice.currency, gross: invoice.totalGross.toFixed(2), vat: invoice.totalVat.toFixed(2), updatedAt: invoice.updatedAt.toISOString() })),
      evidenceTruncated: invoices.length > 20,
    };
  }
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
  ].map((record) => ({ id: record.id, kind: record.kind, title: normaliseDocumentText(record.invoiceNumber, record.id),
    status: record.status, currency: record.currency ?? 'UNKNOWN', gross: record.totalGross?.toFixed(2) ?? null,
    vat: record.totalVat?.toFixed(2) ?? null, updatedAt: record.updatedAt.toISOString() }));
  return { calculations, evidence, evidenceTruncated: outgoing.length > 20 || incoming.length > 20 };
}
