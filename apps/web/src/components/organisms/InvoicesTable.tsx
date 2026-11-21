import Link from 'next/link';
import type { ReactNode } from 'react';
import type { InvoiceSummary } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { KsefStatusChip } from '../molecules/StatusChip';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  showNet?: boolean;
  compact?: boolean;
  header?: ReactNode;
  caption?: string;
  footer?: ReactNode;
  emptyState?: ReactNode;
}

/**
 * The list endpoint (GET /companies/:id/invoices) does not select
 * paymentReceived/paymentDueDate — only the single-invoice detail endpoint
 * does — so DRAFT, ISSUING, and rejected-blocked are the only payment states this
 * table can derive honestly from the data it has. Paid/unpaid needs those
 * two fields added to the list serializer (flagged separately as an API gap).
 */
function paymentBadge(invoice: InvoiceSummary): { label: string; tone: 'draft' | 'primary' | 'warning' } | null {
  if (invoice.status === 'DRAFT') return { label: t.invoicesTable.paymentDraft, tone: 'draft' };
  if (invoice.status === 'ISSUING') return { label: t.invoicesTable.paymentIssuing, tone: 'warning' };
  if (invoice.ksefStatus === 'rejected') return { label: t.invoicesTable.paymentBlocked, tone: 'draft' };
  return null;
}

export function InvoicesTable({ invoices, showNet = true, compact = false, header, caption, footer, emptyState }: InvoicesTableProps) {
  return (
    <div className="grid min-w-0 max-w-full gap-4 lg:block lg:overflow-hidden lg:rounded-card lg:border lg:border-outline lg:bg-surface-panel">
      <div className="hidden lg:block">
        {header ? <div className="flex items-center justify-between border-b border-outline px-5 py-3.5">{header}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-[13px]">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <colgroup>
              <col className="w-[128px]" />
              <col className="w-[104px]" />
              <col />
              {showNet ? <col className="w-[116px]" /> : null}
              <col className="w-[116px]" />
              <col className="w-[118px]" />
              <col className="w-[128px]" />
            </colgroup>
            <thead>
              <tr className="bg-surface-muted text-left">
                <HeaderCell>{t.invoicesTable.numberColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.dateColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.contractorColumn}</HeaderCell>
                {showNet ? <HeaderCell className="text-right">{t.invoicesTable.netColumn}</HeaderCell> : null}
                <HeaderCell className="text-right">{t.invoicesTable.grossColumn}</HeaderCell>
                <HeaderCell className="text-center">{t.invoicesTable.paymentColumn}</HeaderCell>
                <HeaderCell className="text-right">{t.invoicesTable.ksefColumn}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const payment = paymentBadge(invoice);
                const invoiceLabel = invoice.invoiceNumber ?? (invoice.status === 'ISSUING' ? t.invoicesTable.issuingFallback : t.invoicesTable.draftFallback);
                return (
                  <tr key={invoice.id} className="border-t border-outline transition hover:bg-surface-row-hover">
                    <BodyCell flush>
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        aria-label={t.invoicesTable.rowLinkLabel(invoiceLabel, invoice.contractor?.name ?? t.invoicesTable.noContractorFallback)}
                        className="inline-flex min-h-11 items-center font-mono text-[12px] text-foreground transition hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {invoiceLabel}
                      </Link>
                    </BodyCell>
                    <BodyCell className="text-muted">{formatDate(invoice.issueDate)}</BodyCell>
                    <BodyCell className="truncate pr-3.5">{invoice.contractor?.name ?? '—'}</BodyCell>
                    {showNet ? <BodyCell className="text-right tabular-nums text-foreground-secondary">{formatMoney(invoice.totalNet)}</BodyCell> : null}
                    <BodyCell className="text-right tabular-nums">{formatMoney(invoice.totalGross)}</BodyCell>
                    <BodyCell className="text-center">
                      {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : <span className="text-muted">—</span>}
                    </BodyCell>
                    <BodyCell className="text-right">
                      <KsefStatusChip status={invoice.ksefStatus} />
                    </BodyCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid min-w-0 max-w-full gap-4 lg:hidden">
        {header ? <div className="flex items-center justify-between">{header}</div> : null}
        {invoices.map((invoice) => {
          const payment = paymentBadge(invoice);
          const invoiceLabel = invoice.invoiceNumber ?? (invoice.status === 'ISSUING' ? t.invoicesTable.issuingFallback : t.invoicesTable.draftFallback);
          const contractorName = invoice.contractor?.name ?? t.invoicesTable.noContractorFallback;
          return (
            <div key={invoice.id} className="min-w-0 max-w-full space-y-4 overflow-hidden rounded-card border border-outline bg-surface-panel px-[17px] py-4">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    aria-label={t.invoicesTable.rowLinkLabel(invoiceLabel, contractorName)}
                    className="inline-flex min-h-11 max-w-full items-center break-all font-mono text-base text-foreground"
                  >
                    {invoiceLabel}
                  </Link>
                  <p className="truncate text-[12.5px] text-muted">{contractorName}</p>
                </div>
                <div className="flex max-w-full shrink-0 flex-wrap justify-end gap-2">
                  <KsefStatusChip status={invoice.ksefStatus} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <DetailItem label={t.invoicesTable.dateColumn} value={formatDate(invoice.issueDate)} />
                <DetailItem label={t.invoicesTable.grossColumn} value={formatMoney(invoice.totalGross)} />
                {!compact && showNet ? <DetailItem label={t.invoicesTable.netColumn} value={formatMoney(invoice.totalNet)} /> : null}
                {!compact && showNet ? <DetailItem label={t.invoicesTable.vatColumn} value={formatMoney(invoice.totalVat)} /> : null}
                <div className="col-span-2 flex items-center justify-between gap-3">
                  {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : <span />}
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    aria-label={t.invoicesTable.detailsLinkLabel(invoiceLabel)}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary"
                  >
                    {t.invoicesTable.detailsLink}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {emptyState ? (
        <div className={`${bandClassName} gap-3 py-6`}>{emptyState}</div>
      ) : null}
      {footer ? (
        <div className={`${bandClassName} gap-3 py-3 lg:flex-row lg:items-center lg:justify-between`}>{footer}</div>
      ) : null}
    </div>
  );
}

// Below lg each band is its own card; from lg it is a band inside the table card.
const bandClassName =
  'flex flex-col rounded-card border border-outline bg-surface-muted px-[18px] lg:rounded-none lg:border-0 lg:border-t';

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 first:pl-[18px] last:pr-[18px] font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

// flush: the cell holds a 44px touch target, so it needs no vertical padding to keep the row at 44px.
function BodyCell({ children, className = '', flush = false }: { children: React.ReactNode; className?: string; flush?: boolean }) {
  return <td className={`px-3 ${flush ? '' : 'py-3'} align-middle first:pl-[18px] last:pr-[18px] text-foreground ${className}`}>{children}</td>;
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
