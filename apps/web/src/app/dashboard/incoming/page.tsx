import { getCompanyKsefSettings, getIncomingInvoices } from '../../../lib/api';
import { requireAuthSession } from '../../../lib/auth';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { MetricCard } from '../../../components/molecules/MetricCard';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { IncomingInvoicesTable } from '../../../components/organisms/IncomingInvoicesTable';
import { t } from '../../../lib/translations';
import { UploadButton } from './UploadButton';
import { KsefSyncButton } from './KsefSyncButton';

export default async function IncomingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await requireAuthSession('/dashboard/incoming');
  const { activeCompanyId: companyId, companies } = session;

  if (!companyId) {
    return <EmptyState title={t.incoming.noCompany} description="" />;
  }

  const activeEnvironment = session.activeKsefEnvironment;
  if (!activeEnvironment) {
    return <EmptyState title={t.incoming.noCompany} description="" />;
  }

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;

  const result = await getIncomingInvoices(companyId, activeEnvironment, { page: String(page) });
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
  const processingCount = result.data.filter((invoice) => invoice.status === 'OCR_PROCESSING').length;
  const confirmedCount = result.data.filter((invoice) => invoice.status === 'CONFIRMED').length;

  const ksefSettings = await getCompanyKsefSettings(companyId).catch(() => null);
  const ksefCredentialStatuses = ksefSettings?.credentials ?? undefined;
  const initialDate = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.incoming.pageEyebrow}
        title={t.incoming.pageTitle}
        description={t.incoming.pageDescription}
        actions={
          <>
             <UploadButton companyId={companyId} activeEnvironment={activeEnvironment} />
             <KsefSyncButton
               companyId={companyId}
                companyName={companies.find((company) => company.id === companyId)?.name ?? 'wybranej firmy'}
                activeEnvironment={activeEnvironment}
                initialDate={initialDate}
                ksefCredentialStatuses={ksefCredentialStatuses}
             />
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label={t.incoming.metrics.allLabel} value={String(result.total)} hint={t.incoming.metrics.allHint} />
        <MetricCard label={t.incoming.metrics.processingLabel} value={String(processingCount)} hint={t.incoming.metrics.processingHint} />
        <MetricCard label={t.incoming.metrics.confirmedLabel} value={String(confirmedCount)} hint={t.incoming.metrics.confirmedHint} accent="primary" />
      </div>

      {result.total === 0 ? (
        <EmptyState title={t.incoming.emptyTitle} description={t.incoming.empty} />
      ) : (
        <>
          <IncomingInvoicesTable invoices={result.data} />
          <div className="flex flex-col gap-3 rounded-control border border-outline bg-surface-raised px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t.incoming.total(result.total)}
            </p>
            <div className="flex items-center justify-between gap-4 sm:justify-end">
              {page <= 1 ? (
                <Button type="button" variant="secondary" size="sm" disabled>
                  {t.pagination.previous}
                </Button>
              ) : (
                <Button href={`/dashboard/incoming?page=${page - 1}`} variant="secondary" size="sm">
                  {t.pagination.previous}
                </Button>
              )}
              <p className="text-sm text-muted">{t.pagination.pageOf(page, totalPages)}</p>
              {page >= totalPages ? (
                <Button type="button" variant="secondary" size="sm" disabled>
                  {t.pagination.next}
                </Button>
              ) : (
                <Button href={`/dashboard/incoming?page=${page + 1}`} variant="secondary" size="sm">
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
