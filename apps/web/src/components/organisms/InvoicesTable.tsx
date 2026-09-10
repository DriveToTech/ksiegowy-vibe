import Link from 'next/link';
import type { ReactNode } from 'react';
import type { InvoiceSummary } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { InvoiceEnvironmentChip, InvoiceStatusChip, KsefStatusChip } from '../molecules/StatusChip';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  showNet?: boolean;
  compact?: boolean;
  header?: ReactNode;
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

export function InvoicesTable({ invoices, showNet = true, compact = false, header }: InvoicesTableProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-outline bg-surface-panel lg:block">
        {header ? <div className="flex items-center justify-between border-b border-outline px-5 py-3.5">{header}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-muted text-left">
                <HeaderCell>{t.invoicesTable.numberColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.dateColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.contractorColumn}</HeaderCell>
                <HeaderCell className="hidden text-center xl:table-cell">{t.invoicesTable.environmentColumn}</HeaderCell>
                {showNet ? <HeaderCell className="hidden text-right 2xl:table-cell">{t.invoicesTable.netColumn}</HeaderCell> : null}
                {showNet ? <HeaderCell className="hidden text-right 2xl:table-cell">{t.invoicesTable.vatColumn}</HeaderCell> : null}
                <HeaderCell className="text-right">{t.invoicesTable.grossColumn}</HeaderCell>
                <HeaderCell className="text-center">{t.invoicesTable.statusColumn}</HeaderCell>
                <HeaderCell className="text-center">{t.invoicesTable.paymentColumn}</HeaderCell>
                <HeaderCell className="hidden text-right xl:table-cell">{t.invoicesTable.ksefColumn}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const payment = paymentBadge(invoice);
                return (
                  <tr key={invoice.id} className="border-t border-outline transition hover:bg-surface-row-hover">
                    <BodyCell>
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="inline-flex min-h-11 items-center font-mono text-[12px] font-medium text-foreground transition hover:text-primary"
                      >
                        {invoice.invoiceNumber ?? (invoice.status === 'ISSUING' ? t.invoicesTable.issuingFallback : t.invoicesTable.draftFallback)}
                      </Link>
                    </BodyCell>
                    <BodyCell className="text-muted">{formatDate(invoice.issueDate)}</BodyCell>
                    <BodyCell className="max-w-0 truncate">{invoice.contractor?.name ?? '—'}</BodyCell>
                    <BodyCell className="hidden text-center xl:table-cell">
                      <InvoiceEnvironmentChip environment={invoice.environment} />
                    </BodyCell>
                    {showNet ? <BodyCell className="hidden text-right tabular-nums text-foreground-secondary 2xl:table-cell">{formatMoney(invoice.totalNet)}</BodyCell> : null}
                    {showNet ? <BodyCell className="hidden text-right tabular-nums text-foreground-secondary 2xl:table-cell">{formatMoney(invoice.totalVat)}</BodyCell> : null}
                    <BodyCell className="text-right tabular-nums font-medium">{formatMoney(invoice.totalGross)}</BodyCell>
                    <BodyCell className="text-center">
                      <InvoiceStatusChip status={invoice.status} />
                    </BodyCell>
                    <BodyCell className="text-center">
                      {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : <span className="text-muted">—</span>}
                    </BodyCell>
                    <BodyCell className="hidden text-right xl:table-cell">
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
          return (
            <div key={invoice.id} className="min-w-0 max-w-full space-y-4 overflow-hidden rounded-card border border-outline bg-surface-panel p-5">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
                    className="inline-flex min-h-11 max-w-full items-center break-all font-mono text-base font-medium text-foreground"
                  >
                    {invoice.invoiceNumber ?? (invoice.status === 'ISSUING' ? t.invoicesTable.issuingFallback : t.invoicesTable.draftFallback)}
                  </Link>
                  <p className="mt-1 truncate text-sm text-muted">{invoice.contractor?.name ?? t.invoicesTable.noContractorFallback}</p>
                </div>
                <div className="flex max-w-full shrink-0 flex-wrap justify-end gap-2">
                  <InvoiceStatusChip status={invoice.status} />
                  <KsefStatusChip status={invoice.ksefStatus} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label={t.invoicesTable.dateColumn} value={formatDate(invoice.issueDate)} />
                <DetailItem label={t.invoicesTable.grossColumn} value={formatMoney(invoice.totalGross)} align="right" />
                {!compact && showNet ? <DetailItem label={t.invoicesTable.netColumn} value={formatMoney(invoice.totalNet)} /> : null}
                {!compact && showNet ? <DetailItem label={t.invoicesTable.vatColumn} value={formatMoney(invoice.totalVat)} align="right" /> : null}
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoicesTable.environmentColumn}</p>
                  <InvoiceEnvironmentChip environment={invoice.environment} />
                </div>
                <div className="sm:col-span-2 flex items-center justify-between gap-3">
                  {payment ? <Badge tone={payment.tone}>{payment.label}</Badge> : <span />}
                  <Link
                    href={`/dashboard/invoices/${invoice.id}`}
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
    </>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-3 align-middle text-foreground ${className}`}>{children}</td>;
}

function DetailItem({
  label,
  value,
  align = 'left',
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
