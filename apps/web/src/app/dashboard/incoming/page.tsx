import Link from 'next/link';
import { getActiveCompany, getCompanyKsefSettings, getIncomingInvoices } from '../../../lib/api';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { ErrorState } from '../../../components/molecules/ErrorState';
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
  const { activeCompanyId: companyId } = await getActiveCompany().catch(() => ({ activeCompanyId: null }));

  if (!companyId) {
    return <ErrorState message={t.incoming.noCompany} />;
  }

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam) > 0 ? Number(pageParam) : 1;

  const result = await getIncomingInvoices(companyId, { page: String(page) }).catch(() => ({ data: [], total: 0, page: 1, limit: 20 }));
  const totalPages = Math.max(1, Math.ceil(result.total / result.limit));
  const processingCount = result.data.filter((invoice) => invoice.status === 'OCR_PROCESSING').length;
  const confirmedCount = result.data.filter((invoice) => invoice.status === 'CONFIRMED').length;

  const ksefSettings = await getCompanyKsefSettings(companyId).catch(() => null);
  const ksefCredentialStatuses = ksefSettings?.credentials ?? undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.incoming.pageEyebrow}
        title={t.incoming.pageTitle}
        description={t.incoming.pageDescription}
        actions={
          <>
            <UploadButton companyId={companyId} />
            <KsefSyncButton companyId={companyId} ksefCredentialStatuses={ksefCredentialStatuses} />
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
          <div className="flex items-center justify-between gap-4">
            <Link href={`/dashboard/incoming?page=${page - 1}`}>
              <Button variant="secondary" size="sm" disabled={page <= 1}>
                {t.pagination.previous}
              </Button>
            </Link>
            <p className="text-sm text-muted">{t.pagination.pageOf(page, totalPages)} · {t.incoming.total(result.total)}</p>
            <Link href={`/dashboard/incoming?page=${page + 1}`}>
              <Button variant="secondary" size="sm" disabled={page >= totalPages}>
                {t.pagination.next}
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
