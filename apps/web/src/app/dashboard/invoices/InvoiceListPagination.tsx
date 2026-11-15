import Link from 'next/link';
import { t } from '../../../lib/translations';
import { invoiceListHref, type InvoiceListQuery } from './invoice-list-query';

interface InvoiceListPaginationProps {
  query: InvoiceListQuery;
  totalPages: number;
}

const numberedLinkClassName =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-chip border px-[11px] py-1.5 font-mono text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
const pairLinkClassName =
  'inline-flex h-12 flex-1 items-center justify-center rounded-control bg-secondary-surface text-sm font-semibold text-secondary-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-ink';
const pairDisabledClassName =
  'inline-flex h-12 flex-1 cursor-not-allowed items-center justify-center rounded-control bg-surface-raised text-sm font-semibold text-foreground-disabled';

// Desktop: numbered window of 3 plus arrows. Below lg: a 50/50 Previous / Next pair.
export function InvoiceListPagination({ query, totalPages }: InvoiceListPaginationProps) {
  const { page } = query;
  const windowStart = Math.max(1, Math.min(page - 1, totalPages - 2));
  const pages = Array.from({ length: Math.min(3, totalPages) }, (_, offset) => windowStart + offset);

  return (
    <nav aria-label={t.pagination.label}>
      <div className="hidden items-center gap-1 lg:flex">
        {page > 1 ? (
          <Link href={invoiceListHref(query, { page: page - 1 })} aria-label={t.pagination.previous} className={`${numberedLinkClassName} border-transparent text-muted hover:text-foreground-secondary`}>
            <span aria-hidden="true">←</span>
          </Link>
        ) : null}
        {pages.map((pageNumber) => (
          <Link
            key={pageNumber}
            href={invoiceListHref(query, { page: pageNumber })}
            aria-label={t.pagination.pageLink(pageNumber)}
            aria-current={pageNumber === page ? 'page' : undefined}
            className={`${numberedLinkClassName} ${pageNumber === page ? 'border-outline bg-foreground/[0.06] text-foreground' : 'border-transparent text-muted hover:text-foreground-secondary'}`}
          >
            {pageNumber}
          </Link>
        ))}
        {page < totalPages ? (
          <Link href={invoiceListHref(query, { page: page + 1 })} aria-label={t.pagination.next} className={`${numberedLinkClassName} border-transparent text-muted hover:text-foreground-secondary`}>
            <span aria-hidden="true">→</span>
          </Link>
        ) : null}
      </div>

      <div className="flex gap-3 lg:hidden">
        {page > 1 ? (
          <Link href={invoiceListHref(query, { page: page - 1 })} className={pairLinkClassName}>
            {t.pagination.previous}
          </Link>
        ) : (
          <span aria-disabled="true" className={pairDisabledClassName}>{t.pagination.previous}</span>
        )}
        {page < totalPages ? (
          <Link href={invoiceListHref(query, { page: page + 1 })} className={pairLinkClassName}>
            {t.pagination.next}
          </Link>
        ) : (
          <span aria-disabled="true" className={pairDisabledClassName}>{t.pagination.next}</span>
        )}
      </div>
    </nav>
  );
}
