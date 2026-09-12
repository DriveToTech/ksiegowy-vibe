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
  searchParams: Promise<{ page?: string; status?: string }>;
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
          action={<Button href="/dashboard/settings">{t.settings.goToSettings}</Button>}
        />
      </div>
    );
  }

  const activeEnvironment = session.activeKsefEnvironment;
  if (!activeEnvironment) {
    return <EmptyState title={t.outgoingInvoices.noCompanyTitle} description={t.outgoingInvoices.noCompanyDescription} />;
  }

  const { page: pageParam, status: statusParam } = await searchParams;
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;
  const activeStatus = statusParam === 'DRAFT' ? 'DRAFT' : undefined;

  const [invoicesResult, contractors] = await Promise.all([
    getInvoices(companyId, activeEnvironment, { page: String(page), ...(activeStatus ? { status: activeStatus } : {}) }),
    getContractors(companyId, activeEnvironment).catch(() => []),
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
          hasContractors ? (
            <Button href="/dashboard/invoices/new" variant="primaryQuiet">
              {t.dashboard.createInvoice}
            </Button>
          ) : (
            <Button type="button" variant="primaryQuiet" disabled>
              {t.dashboard.createInvoice}
            </Button>
          )
        }
      />

      <div className="flex gap-1 rounded-control border border-outline bg-surface-raised p-1">
        {statusTabs.map((tab) => (
          <Link
            key={tab.label}
            href={tab.value ? `/dashboard/invoices?status=${tab.value}` : '/dashboard/invoices'}
            className={
                (tab.value ?? undefined) === activeStatus
                ? 'inline-flex min-h-11 items-center rounded-chip bg-foreground/10 px-3.5 py-1.5 text-[12.5px] font-medium text-foreground'
                : 'inline-flex min-h-11 items-center rounded-chip px-3.5 py-1.5 text-[12.5px] text-muted transition hover:text-foreground-secondary'
            }
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {total === 0 ? (
        <EmptyState
          title={activeStatus ? t.outgoingInvoices.filters.drafts : t.outgoingInvoices.emptyState.title}
          description={activeStatus
            ? t.contractors.emptyFiltered
            : hasContractors
              ? t.outgoingInvoices.emptyState.withContractorsDescription
              : t.outgoingInvoices.emptyState.withoutContractorsDescription}
          action={
            activeStatus ? (
              <Button href="/dashboard/invoices" variant="secondary">
                {t.outgoingInvoices.filters.all}
              </Button>
            ) : hasContractors ? (
              <Button href="/dashboard/invoices/new" variant="primaryQuiet">
                {t.outgoingInvoices.emptyState.createFirstInvoice}
              </Button>
            ) : (
              <Button href="/dashboard/contractors">{t.outgoingInvoices.emptyState.addContractor}</Button>
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
              {page <= 1 ? (
                <Button type="button" variant="secondary" size="sm" disabled>
                  {t.pagination.previous}
                </Button>
              ) : (
                <Button
                  href={`/dashboard/invoices?page=${page - 1}${activeStatus ? `&status=${activeStatus}` : ''}`}
                  variant="secondary"
                  size="sm"
                >
                  {t.pagination.previous}
                </Button>
              )}
              <p className="text-sm text-muted">{t.pagination.pageOf(page, totalPages)}</p>
              {page >= totalPages ? (
                <Button type="button" variant="secondary" size="sm" disabled>
                  {t.pagination.next}
                </Button>
              ) : (
                <Button
                  href={`/dashboard/invoices?page=${page + 1}${activeStatus ? `&status=${activeStatus}` : ''}`}
                  variant="secondary"
                  size="sm"
                >
                  {t.pagination.next}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
