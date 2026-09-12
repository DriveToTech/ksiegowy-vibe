import Link from 'next/link';
import type { IncomingInvoiceSummary } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { IncomingStatusChip, InvoiceEnvironmentChip } from '../molecules/StatusChip';

interface IncomingInvoicesTableProps {
  invoices: IncomingInvoiceSummary[];
}

export function IncomingInvoicesTable({ invoices }: IncomingInvoicesTableProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-outline bg-surface-panel lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-surface-muted text-left">
                <HeaderCell>{t.incoming.columns.seller}</HeaderCell>
                <HeaderCell>{t.incoming.columns.invoiceNumber}</HeaderCell>
                <HeaderCell>{t.incoming.columns.date}</HeaderCell>
                <HeaderCell className="text-right">{t.incoming.columns.grossAmount}</HeaderCell>
                <HeaderCell className="hidden text-center xl:table-cell">{t.invoicesTable.environmentColumn}</HeaderCell>
                <HeaderCell className="text-center">{t.incoming.columns.status}</HeaderCell>
                <HeaderCell className="text-right">{t.incoming.review}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-outline transition hover:bg-surface-row-hover">
                  <BodyCell className="pr-4">
                    <p className="font-medium text-foreground">{invoice.sellerName ?? '—'}</p>
                    {invoice.sellerNip ? (
                      <p className="mt-0.5 font-mono text-xs text-muted">NIP {invoice.sellerNip}</p>
                    ) : null}
                  </BodyCell>
                  <BodyCell className="font-mono text-[12px]">{invoice.invoiceNumber ?? '—'}</BodyCell>
                  <BodyCell className="text-muted">{formatDate(invoice.issueDate)}</BodyCell>
                  <BodyCell className="text-right tabular-nums font-medium">
                    {invoice.totalGross ? formatMoney(invoice.totalGross) : '—'}
                  </BodyCell>
                  <BodyCell className="hidden text-center xl:table-cell">
                    <InvoiceEnvironmentChip environment={invoice.ksefEnvironment ?? invoice.environment} />
                  </BodyCell>
                  <BodyCell className="text-center">
                    <IncomingStatusChip status={invoice.status} />
                  </BodyCell>
                  <BodyCell className="text-right">
                    <Link
                      href={`/dashboard/incoming/${invoice.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary"
                    >
                      {t.incoming.review}
                    </Link>
                  </BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid min-w-0 max-w-full gap-4 lg:hidden">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="min-w-0 max-w-full space-y-4 overflow-hidden rounded-card border border-outline bg-surface-panel p-5">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-lg font-semibold tracking-tight text-foreground">
                  {invoice.sellerName ?? '—'}
                </p>
                <p className="mt-1 break-all font-mono text-xs text-muted">{invoice.invoiceNumber ?? '—'}</p>
              </div>
              <IncomingStatusChip status={invoice.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label={t.incoming.columns.nip} value={invoice.sellerNip ?? '—'} />
              <DetailItem label={t.incoming.columns.date} value={formatDate(invoice.issueDate)} align="right" />
              <DetailItem
                label={t.incoming.columns.grossAmount}
                value={invoice.totalGross ? formatMoney(invoice.totalGross) : '—'}
              />
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoicesTable.environmentColumn}</p>
                <InvoiceEnvironmentChip environment={invoice.ksefEnvironment ?? invoice.environment} />
              </div>
              <div className="flex items-end justify-end">
                <Link
                  href={`/dashboard/incoming/${invoice.id}`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary"
                >
                  {t.incoming.review}
                </Link>
              </div>
            </div>
          </div>
        ))}
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
