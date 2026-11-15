import { getContractors, getInvoices } from '../../../lib/api';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { InvoicesTable } from '../../../components/organisms/InvoicesTable';
import { formatMoney } from '../../../lib/format';
import { InvoiceListPagination } from './InvoiceListPagination';
import { InvoicesFilterBar } from './InvoicesFilterBar';
import { invoiceListApiParams, invoiceListMonthOptions, invoiceListSegments, parseInvoiceListQuery } from './invoice-list-query';
import { requireAuthSession } from '../../../lib/auth';
import { t } from '../../../lib/translations';
import { AdvisorInsightStrip } from '../../../components/advisor/AdvisorInsightStrip';

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const query = parseInvoiceListQuery(await searchParams);
  const hasActiveFilter = Boolean(query.search || query.issueMonth || query.segment || query.ksefStatus);

  const [invoicesResult, contractors] = await Promise.all([
    getInvoices(companyId, activeEnvironment, invoiceListApiParams(query)),
    getContractors(companyId, activeEnvironment).catch(() => []),
  ]);
  const { data: invoices, total, totalGross, limit } = invoicesResult;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasContractors = contractors.length > 0;
  const monthOptions = invoiceListMonthOptions(query.issueMonth);

  const activeFilterDescriptions = [
    query.search ? `"${query.search}"` : undefined,
    query.issueMonth ? monthOptions.find((option) => option.value === query.issueMonth)?.label : undefined,
    invoiceListSegments.find((candidate) => candidate.segment === query.segment)?.label,
    query.ksefStatus ? t.outgoingInvoices.notSubmittedFilter : undefined,
  ].filter((description): description is string => Boolean(description));

  const emptyFilteredState = (
    <>
      <p className="text-[13px] text-muted">{t.outgoingInvoices.emptyFiltered}</p>
      <Button href="/dashboard/invoices" variant="ghost" size="sm" className="self-start">
        {t.outgoingInvoices.clearFilters}
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow={t.outgoingInvoices.pageEyebrow}
        title={t.outgoingInvoices.pageTitle}
        actions={
          hasContractors ? (
            <Button href="/dashboard/invoices/new" variant="primary">
              {t.dashboard.createInvoice}
            </Button>
          ) : (
            <Button type="button" variant="primary" disabled>
              {t.dashboard.createInvoice}
            </Button>
          )
        }
      />
      <AdvisorInsightStrip companyId={companyId} environment={activeEnvironment} view="invoices" />

      {total === 0 && !hasActiveFilter ? (
        <EmptyState
          title={t.outgoingInvoices.emptyState.title}
          description={
            hasContractors
              ? t.outgoingInvoices.emptyState.withContractorsDescription
              : t.outgoingInvoices.emptyState.withoutContractorsDescription
          }
          action={
            hasContractors ? (
              <Button href="/dashboard/invoices/new" variant="primary">
                {t.outgoingInvoices.emptyState.createFirstInvoice}
              </Button>
            ) : (
              <Button href="/dashboard/contractors">{t.outgoingInvoices.emptyState.addContractor}</Button>
            )
          }
        />
      ) : (
        <>
          <InvoicesFilterBar query={query} monthOptions={monthOptions} />
          <InvoicesTable
            invoices={invoices}
            caption={t.outgoingInvoices.tableCaption(activeFilterDescriptions)}
            emptyState={invoices.length === 0 ? emptyFilteredState : undefined}
            footer={
              invoices.length === 0 ? undefined : (
                <>
                  <p role="status" className="font-mono text-[11px] uppercase text-muted">
                    {t.outgoingInvoices.pageSummary(invoices.length, total, formatMoney(totalGross))}
                  </p>
                  <InvoiceListPagination query={query} totalPages={totalPages} />
                </>
              )
            }
          />
        </>
      )}
    </div>
  );
}
