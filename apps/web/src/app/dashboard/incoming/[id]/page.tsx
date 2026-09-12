import Link from 'next/link';
import { getIncomingInvoice, getIncomingInvoices } from '../../../../lib/api';
import type { IncomingInvoiceSummary } from '../../../../lib/api-types';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { Button } from '../../../../components/atoms/Button';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { IncomingStatusChip } from '../../../../components/molecules/StatusChip';
import { t } from '../../../../lib/translations';
import { cn } from '../../../../lib/cn';
import { requireAuthSession } from '../../../../lib/auth';
import { ReviewPanel } from './ReviewPanel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IncomingReviewPage({ params }: Props) {
  const { id } = await params;
  const { activeCompanyId: companyId, activeKsefEnvironment } = await requireAuthSession(`/dashboard/incoming/${id}`);

  if (!companyId || !activeKsefEnvironment) {
    return <EmptyState title={t.incoming.noCompany} description="" />;
  }

  const [invoiceResult, queueResult] = await Promise.all([
    getIncomingInvoice(companyId, id, activeKsefEnvironment)
      .then((invoice) => ({ invoice, error: null }))
      .catch((error: unknown) => ({ invoice: null, error })),
    getIncomingInvoices(companyId, activeKsefEnvironment, { limit: '20' })
      .then((data) => ({ data, error: null }))
      .catch((error: unknown) => ({
        data: { data: [], total: 0, page: 1, limit: 20 },
        error,
      })),
  ]);

  if (invoiceResult.error) {
    if (isNotFoundError(invoiceResult.error)) {
      return (
        <div className="space-y-4">
          <EmptyState title="Faktura nie znaleziona" description="Nie udało się odnaleźć wskazanego dokumentu przychodzącego." />
          <Link href="/dashboard/incoming" className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong transition hover:text-primary">
            ← Wróć do listy
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <ErrorState
          title="Nie udało się wczytać faktury"
          message={invoiceResult.error instanceof Error ? invoiceResult.error.message : 'Nie udało się wczytać faktury przychodzącej.'}
          action={<Button href="/dashboard/incoming" variant="secondary">← Wróć do listy</Button>}
        />
      </div>
    );
  }

  const invoice = invoiceResult.invoice;
  if (!invoice) {
    return (
      <div className="space-y-4">
        <EmptyState title="Faktura nie znaleziona" description="Nie udało się odnaleźć wskazanego dokumentu przychodzącego." />
        <Link href="/dashboard/incoming" className="inline-flex min-h-11 items-center text-sm font-medium text-primary-strong transition hover:text-primary">
          ← Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="OCR review"
        title={invoice.invoiceNumber ?? 'Przegląd faktury przychodzącej'}
        description="Zweryfikuj dane odczytane z dokumentu i zatwierdź lub odrzuć wynik OCR."
      />

      <div>
        <Button href="/dashboard/incoming" variant="secondary">← Faktury przychodzące</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
         <Queue
           items={queueResult.data.data}
           activeId={invoice.id}
           error={queueResult.error instanceof Error ? queueResult.error.message : queueResult.error ? 'Nie udało się pobrać kolejki dokumentów.' : null}
         />
        <ReviewPanel invoice={invoice} companyId={companyId} activeEnvironment={activeKsefEnvironment} />
      </div>
    </div>
  );
}

function Queue({ items, activeId, error }: { items: IncomingInvoiceSummary[]; activeId: string; error: string | null }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-outline bg-chrome p-3.5 lg:sticky lg:top-0">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {t.incoming.queue.eyebrow} · {items.length}
      </p>

      {error ? (
        <p role="alert" className="px-1 text-sm text-error-ink">{error}</p>
      ) : items.length === 0 ? (
        <p className="px-1 text-sm text-muted">{t.incoming.queue.empty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <Link
                key={item.id}
                href={`/dashboard/incoming/${item.id}`}
                className={cn(
                  'flex min-h-11 flex-col gap-1.5 rounded-inset border p-3',
                  isActive
                    ? 'bg-[image:var(--nav-active)] border-[var(--nav-active-border)]'
                    : 'border-outline bg-surface-panel hover:bg-surface-row-hover',
                )}
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {item.sellerName ?? item.invoiceNumber ?? '—'}
                </span>
                <IncomingStatusChip status={item.status} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && /failed 404:/.test(error.message);
}
