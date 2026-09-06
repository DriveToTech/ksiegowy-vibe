import Link from 'next/link';
import { getContractors, getInvoices } from '../../../lib/api';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { InvoicesTable } from '../../../components/organisms/InvoicesTable';
import { formatMoney } from '../../../lib/format';
import { requireAuthSession } from '../../../lib/auth';
import { t } from '../../../lib/translations';

const statusTabs = [
  { value: undefined, label: t.outgoingInvoices.filters.all },
  { value: 'DRAFT', label: t.outgoingInvoices.filters.drafts },
] as const;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; ksefStatus?: string }>;
}) {
  const session = await requireAuthSession('/dashboard/invoices');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.outgoingInvoices.pageEyebrow}
          title={t.outgoingInvoices.pageTitle}
          description={t.outgoingInvoices.pageDescription}
        />
        <EmptyState
          title={t.outgoingInvoices.noCompanyTitle}
          description={t.outgoingInvoices.noCompanyDescription}
          action={
            <Link href="/dashboard/settings">
              <Button>{t.settings.goToSettings}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { page: pageParam, status: statusParam, ksefStatus: ksefStatusParam } = await searchParams;
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;
  const activeStatus = statusParam === 'DRAFT' ? 'DRAFT' : undefined;
  const activeKsefStatus = ['not_submitted', 'pending', 'accepted', 'rejected'].includes(ksefStatusParam ?? '')
    ? ksefStatusParam
    : undefined;

  const [invoicesResult, contractors] = await Promise.all([
    getInvoices(companyId, {
      page: String(page),
      ...(activeStatus ? { status: activeStatus } : {}),
      ...(activeKsefStatus ? { ksefStatus: activeKsefStatus } : {}),
    }),
    getContractors(companyId).catch(() => []),
  ]);
  const { data: invoices, total, limit } = invoicesResult;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasContractors = contractors.length > 0;
  const totalGrossOnPage = invoices.reduce((sum, invoice) => sum + (parseFloat(invoice.totalGross) || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.outgoingInvoices.pageEyebrow}
        title={t.outgoingInvoices.pageTitle}
        description={t.outgoingInvoices.pageDescription}
        actions={
          <Button href="/dashboard/invoices/new" variant="primaryQuiet" disabled={!hasContractors}>
            {t.dashboard.createInvoice}
          </Button>
        }
      />

      <div className="flex gap-1 rounded-control border border-outline bg-surface-raised p-1">
        {statusTabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/dashboard/invoices?status=${tab.value}` : '/dashboard/invoices'}
            className={
              (tab.value ?? undefined) === activeStatus
                ? 'rounded-chip bg-foreground/10 px-3.5 py-1.5 text-[12.5px] font-medium text-foreground'
                : 'rounded-chip px-3.5 py-1.5 text-[12.5px] text-muted transition hover:text-foreground-secondary'
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState
          title={t.outgoingInvoices.emptyState.title}
          description={hasContractors ? t.outgoingInvoices.emptyState.withContractorsDescription : t.outgoingInvoices.emptyState.withoutContractorsDescription}
          action={
            hasContractors ? (
              <Button href="/dashboard/invoices/new" variant="primaryQuiet">
                {t.outgoingInvoices.emptyState.createFirstInvoice}
              </Button>
            ) : (
              <Link href="/dashboard/contractors">
                <Button>{t.outgoingInvoices.emptyState.addContractor}</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <InvoicesTable invoices={invoices} />
          <div className="flex flex-col gap-3 rounded-control border border-outline bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t.outgoingInvoices.pageSummary(invoices.length, total, formatMoney(totalGrossOnPage))}
            </p>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              <Link href={`/dashboard/invoices?page=${page - 1}${activeStatus ? `&status=${activeStatus}` : ''}${activeKsefStatus ? `&ksefStatus=${activeKsefStatus}` : ''}`}>
                <Button variant="secondary" size="sm" disabled={page <= 1}>
                  {t.pagination.previous}
                </Button>
              </Link>
              <p className="text-sm text-muted">{t.pagination.pageOf(page, totalPages)}</p>
              <Link href={`/dashboard/invoices?page=${page + 1}${activeStatus ? `&status=${activeStatus}` : ''}${activeKsefStatus ? `&ksefStatus=${activeKsefStatus}` : ''}`}>
                <Button variant="secondary" size="sm" disabled={page >= totalPages}>
                  {t.pagination.next}
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
