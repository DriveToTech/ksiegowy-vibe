import Link from 'next/link';
import { getActiveCompany, getIncomingInvoice, getIncomingInvoices } from '../../../../lib/api';
import type { IncomingInvoiceSummary } from '../../../../lib/api-types';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { Button } from '../../../../components/atoms/Button';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { IncomingStatusChip } from '../../../../components/molecules/StatusChip';
import { t } from '../../../../lib/translations';
import { cn } from '../../../../lib/cn';
import { ReviewPanel } from './ReviewPanel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function IncomingReviewPage({ params }: Props) {
  const { id } = await params;
  const { activeCompanyId: companyId } = await getActiveCompany().catch(() => ({ activeCompanyId: null }));

  if (!companyId) {
    return <ErrorState message="Brak firmy." />;
  }

  const [invoice, queueResult] = await Promise.all([
    getIncomingInvoice(companyId, id).catch(() => null),
    getIncomingInvoices(companyId, { limit: '20' }).catch(() => ({ data: [], total: 0, page: 1, limit: 20 })),
  ]);

  if (!invoice) {
    return (
      <div className="space-y-4">
        <EmptyState title="Faktura nie znaleziona" description="Nie udało się odnaleźć wskazanego dokumentu przychodzącego." />
        <Link href="/dashboard/incoming" className="text-sm font-medium text-primary-strong transition hover:text-primary">
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
        <Link href="/dashboard/incoming" className="text-sm font-medium text-muted transition hover:text-foreground">
          <Button variant="secondary">← Faktury przychodzące</Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <Queue items={queueResult.data} activeId={invoice.id} />
        <ReviewPanel invoice={invoice} companyId={companyId} />
      </div>
    </div>
  );
}

function Queue({ items, activeId }: { items: IncomingInvoiceSummary[]; activeId: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-outline bg-chrome p-3.5 lg:sticky lg:top-0">
      <p className="px-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {t.incoming.queue.eyebrow} · {items.length}
      </p>

      {items.length === 0 ? (
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
                  'flex flex-col gap-1.5 rounded-inset border p-3',
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
