import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import type { AdvisorInsight } from '@ksiegowy/types';
import { z } from 'zod';
import { requireExplicitKsefEnvironment } from '../lib/ksef-environment.js';
import { AdvisorError } from '../services/advisor/advisor-contract.js';
import { requireAdvisorEnabled, requireAdvisorMembership } from '../services/advisor/advisor-access.js';
import { issuedInvoiceFinancialScope } from '../services/invoice-financial-scope.js';

const version = 1;
const viewSchema = z.enum(['dashboard', 'invoices', 'incoming', 'contractors']);
const insightKeys = z.enum(['rejected-invoice', 'not-submitted-invoice', 'incoming-review']);
const incomingStatuses = ['UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED'] as const;

export const advisorInsightRoutes: FastifyPluginAsync = async (server) => {
  server.get<{ Params: { companyId: string }; Querystring: { view?: string; contractorId?: string } }>('/insights', async (request) => {
    // Rollback switch: no insight is shown while the operator has disabled the advisor.
    if (process.env['ADVISOR_ENABLED'] !== 'true') return null;
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const { view, contractorId } = z.object({ view: viewSchema, contractorId: z.string().min(1).max(100).optional() }).strict().parse(request.query);
    if (view === 'contractors' && !contractorId) throw new AdvisorError(400, 'INVALID_REQUEST', 'Contractor is required');
    if (view !== 'contractors' && contractorId) throw new AdvisorError(400, 'INVALID_REQUEST', 'Contractor is not supported in this view');
    const dismissed = await server.prisma.advisorInsightDismissal.findMany({
      where: { membershipId: membership.id, environment, version }, select: { insightKey: true },
    });
    const hidden = new Set(dismissed.map((entry) => entry.insightKey));
    const companyId = request.params.companyId;
    const invoiceWhere = { companyId, environment, status: 'ISSUED' as const };
    const invoiceEvidence = (invoice: { id: string; invoiceNumber: string | null }) =>
      [{ kind: 'outgoing' as const, id: invoice.id, title: invoice.invoiceNumber ?? invoice.id }];
    const candidate = (key: AdvisorInsight['key'], title: string, description: string,
      evidence: AdvisorInsight['evidence']): AdvisorInsight => ({ key, version, title, description, evidence });

    if (view === 'dashboard' || view === 'invoices') {
      if (!hidden.has('rejected-invoice')) {
        const invoice = await server.prisma.invoice.findFirst({
          where: { ...invoiceWhere, ksefStates: { some: { environment, status: 'REJECTED' } } },
          orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], select: { id: true, invoiceNumber: true },
        });
        if (invoice) return candidate('rejected-invoice', 'Odrzucona faktura KSeF',
          'Sprawdź przyczynę odrzucenia na dokumencie. Doradca nie zmienia ani nie wysyła faktur.', invoiceEvidence(invoice));
      }
      if (!hidden.has('not-submitted-invoice')) {
        const invoice = await server.prisma.invoice.findFirst({
          where: { AND: [invoiceWhere, { OR: [
            { ksefStates: { none: { environment } } },
            { ksefStates: { some: { environment, status: 'NOT_SENT' } } },
          ] }] }, orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], select: { id: true, invoiceNumber: true },
        });
        if (invoice) return candidate('not-submitted-invoice', 'Faktura bez wysyłki do KSeF',
          'Sprawdź stan wysyłki na dokumencie; doradca nie wysyła faktur.', invoiceEvidence(invoice));
      }
    }
    if ((view === 'dashboard' || view === 'incoming') && !hidden.has('incoming-review')) {
      const document = await server.prisma.incomingInvoice.findFirst({
        where: { companyId, environment, status: { in: [...incomingStatuses] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], select: { id: true, invoiceNumber: true },
      });
      if (document) return candidate('incoming-review', 'Dokument do sprawdzenia',
        'Sprawdź dane dokumentu przed potwierdzeniem. Doradca nie księguje dokumentów.',
        [{ kind: 'incoming', id: document.id, title: document.invoiceNumber ?? document.id }]);
    }
    if (view === 'contractors' && contractorId && !hidden.has(`contractor-balance:${contractorId}`)) {
      const contractor = await server.prisma.contractor.findFirst({ where: { id: contractorId, companyId }, select: { id: true, name: true } });
      if (!contractor) throw new AdvisorError(404, 'CONTRACTOR_NOT_FOUND', 'Contractor is unavailable in this company');
      const balanceWhere = { ...issuedInvoiceFinancialScope(companyId, environment), contractorId: contractor.id };
      const zero = new Prisma.Decimal(0);
      const groups = await server.prisma.invoice.groupBy({ by: ['currency'],
        where: balanceWhere, _sum: { totalGross: true, paymentReceived: true } });
      if (groups.some((group) => (group._sum.totalGross ?? zero).greaterThan(group._sum.paymentReceived ?? zero))) {
        const invoice = await server.prisma.invoice.findFirst({ where: balanceWhere,
          orderBy: [{ issueDate: 'desc' }, { id: 'asc' }], select: { id: true, invoiceNumber: true } });
        if (invoice) return candidate(`contractor-balance:${contractor.id}`, 'Saldo kontrahenta do sprawdzenia',
          `Wystawione faktury dla ${contractor.name} mają saldo do wyjaśnienia. Wpłaty są wartościami narastającymi, nie historią transakcji.`, invoiceEvidence(invoice));
      }
    }
    return null;
  });

  server.post<{ Params: { companyId: string; key: string } }>('/insights/:key/dismiss', async (request) => {
    requireAdvisorEnabled();
    const membership = await requireAdvisorMembership(request, request.params.companyId);
    const environment = requireExplicitKsefEnvironment(request);
    const { key } = request.params;
    if (key.startsWith('contractor-balance:')) {
      const contractorId = key.slice('contractor-balance:'.length);
      if (!contractorId || contractorId.length > 100 || !await server.prisma.contractor.findFirst({ where: { id: contractorId, companyId: request.params.companyId }, select: { id: true } })) {
        throw new AdvisorError(404, 'CONTRACTOR_NOT_FOUND', 'Contractor is unavailable in this company');
      }
    } else insightKeys.parse(key);
    await server.prisma.advisorInsightDismissal.upsert({
      where: { membershipId_environment_insightKey_version: { membershipId: membership.id, environment, insightKey: key, version } },
      create: { membershipId: membership.id, environment, insightKey: key, version }, update: {},
    });
    return { dismissed: true };
  });
};
