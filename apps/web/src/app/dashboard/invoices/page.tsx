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

export default async function InvoicesPage() {
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

  const [invoices, contractors] = await Promise.all([
    getInvoices(companyId),
    getContractors(companyId).catch(() => []),
  ]);
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
          <Link href="/dashboard/invoices/new">
            <Button disabled={!hasContractors}>{t.outgoingInvoices.addButton}</Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MetricCard
          label={t.outgoingInvoices.metricCards.totalLabel}
          value={String(invoices.length)}
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

      {invoices.length === 0 ? (
        <EmptyState
          title={t.outgoingInvoices.emptyState.title}
          description={hasContractors ? t.outgoingInvoices.emptyState.withContractorsDescription : t.outgoingInvoices.emptyState.withoutContractorsDescription}
          action={
            hasContractors ? (
              <Link href="/dashboard/invoices/new">
                <Button>{t.outgoingInvoices.emptyState.createFirstInvoice}</Button>
              </Link>
            ) : (
              <Link href="/dashboard/contractors">
                <Button>{t.outgoingInvoices.emptyState.addContractor}</Button>
              </Link>
            )
          }
        />
      ) : null}

      {invoices.length > 0 ? <InvoicesTable invoices={invoices} /> : null}
    </div>
  );
}
