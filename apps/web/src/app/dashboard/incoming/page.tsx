import { getActiveCompany, getIncomingInvoices } from '../../../lib/api';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { ErrorState } from '../../../components/molecules/ErrorState';
import { MetricCard } from '../../../components/molecules/MetricCard';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { IncomingInvoicesTable } from '../../../components/organisms/IncomingInvoicesTable';
import { t } from '../../../lib/translations';
import { UploadButton } from './UploadButton';
import { KsefSyncButton } from './KsefSyncButton';

export default async function IncomingPage() {
  const { activeCompanyId: companyId } = await getActiveCompany().catch(() => ({ activeCompanyId: null }));

  if (!companyId) {
    return <ErrorState message={t.incoming.noCompany} />;
  }

  const result = await getIncomingInvoices(companyId).catch(() => ({ data: [], total: 0, page: 1, limit: 20 }));
  const processingCount = result.data.filter((invoice) => invoice.status === 'OCR_PROCESSING').length;
  const confirmedCount = result.data.filter((invoice) => invoice.status === 'CONFIRMED').length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.incoming.pageEyebrow}
        title={t.incoming.pageTitle}
        description={t.incoming.pageDescription}
      />

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <MetricCard label={t.incoming.metrics.allLabel} value={String(result.total)} hint={t.incoming.metrics.allHint} />
        <MetricCard label={t.incoming.metrics.processingLabel} value={String(processingCount)} hint={t.incoming.metrics.processingHint} />
        <MetricCard label={t.incoming.metrics.confirmedLabel} value={String(confirmedCount)} hint={t.incoming.metrics.confirmedHint} accent="primary" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] xl:items-stretch">
        <UploadButton companyId={companyId} />
        <KsefSyncButton companyId={companyId} />
      </div>

      {result.data.length === 0 ? (
        <EmptyState title={t.incoming.emptyTitle} description={t.incoming.empty} />
      ) : (
        <>
          <IncomingInvoicesTable invoices={result.data} />
          <p className="text-sm text-muted">{t.incoming.total(result.total)}</p>
        </>
      )}
    </div>
  );
}
