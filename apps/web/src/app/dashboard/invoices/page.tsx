import Link from 'next/link';
import { getContractors, getInvoices } from '../../../lib/api';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { MetricCard } from '../../../components/molecules/MetricCard';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { InvoicesTable } from '../../../components/organisms/InvoicesTable';
import { formatMoney } from '../../../lib/format';
import { requireAuthSession } from '../../../lib/auth';
import { t } from '../../../lib/translations';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
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

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;

  const [invoicesResult, contractors] = await Promise.all([
    getInvoices(companyId, { page: String(page) }),
    getContractors(companyId).catch(() => []),
  ]);
  const { data: invoices, total, limit } = invoicesResult;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasContractors = contractors.length > 0;

  const drafts = invoices.filter((invoice) => invoice.status === 'DRAFT').length;
  const accepted = invoices.filter((invoice) => invoice.ksefStatus === 'accepted').length;
  const grossTotal = invoices.reduce(
    (sum, invoice) => sum + (parseFloat(invoice.totalGross) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.outgoingInvoices.pageEyebrow}
        title={t.outgoingInvoices.pageTitle}
        description={t.outgoingInvoices.pageDescription}
        actions={
          <Button href="/dashboard/invoices/new" variant="primaryQuiet" disabled={!hasContractors}>
            {t.outgoingInvoices.addButton}
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label={t.outgoingInvoices.metricCards.totalLabel}
          value={String(total)}
          hint={t.outgoingInvoices.metricCards.totalHint}
        />
        <MetricCard
          label={t.outgoingInvoices.metricCards.draftsLabel}
          value={String(drafts)}
          hint={t.outgoingInvoices.metricCards.draftsHint}
        />
        <MetricCard
          label={t.outgoingInvoices.metricCards.acceptedLabel}
          value={String(accepted)}
          hint={`${t.outgoingInvoices.metricCards.acceptedHintPrefix} ${formatMoney(grossTotal)}`}
          accent="primary"
        />
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
      ) : null}

      {total > 0 ? (
        <>
          <InvoicesTable invoices={invoices} />
          <div className="flex items-center justify-between gap-4">
            <Link href={`/dashboard/invoices?page=${page - 1}`}>
              <Button variant="secondary" size="sm" disabled={page <= 1}>
                {t.pagination.previous}
              </Button>
            </Link>
            <p className="text-sm text-muted">{t.pagination.pageOf(page, totalPages)}</p>
            <Link href={`/dashboard/invoices?page=${page + 1}`}>
              <Button variant="secondary" size="sm" disabled={page >= totalPages}>
                {t.pagination.next}
              </Button>
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}
