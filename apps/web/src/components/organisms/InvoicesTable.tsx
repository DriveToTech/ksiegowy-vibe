import Link from 'next/link';
import type { InvoiceSummary } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Surface } from '../atoms/Surface';
import { InvoiceEnvironmentChip, InvoiceStatusChip, KsefStatusChip } from '../molecules/StatusChip';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  compact?: boolean;
}

export function InvoicesTable({ invoices, compact = false }: InvoicesTableProps) {
  return (
    <>
      <Surface tone="panel" className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto px-3 py-3">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-left text-muted">
              <tr>
                <HeaderCell>{t.invoicesTable.numberColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.dateColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.contractorColumn}</HeaderCell>
                <HeaderCell className="hidden xl:table-cell">{t.invoicesTable.environmentColumn}</HeaderCell>
                {!compact ? <HeaderCell className="hidden text-right 2xl:table-cell">{t.invoicesTable.netColumn}</HeaderCell> : null}
                {!compact ? <HeaderCell className="hidden text-right 2xl:table-cell">{t.invoicesTable.vatColumn}</HeaderCell> : null}
                <HeaderCell className="text-right">{t.invoicesTable.grossColumn}</HeaderCell>
                <HeaderCell>{t.invoicesTable.statusColumn}</HeaderCell>
                <HeaderCell className="hidden xl:table-cell">{t.invoicesTable.ksefColumn}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="bg-transparent transition hover:bg-surface-row-hover">
                  <BodyCell>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="inline-flex min-h-11 items-center font-semibold text-primary-strong transition hover:text-primary"
                    >
                      {invoice.invoiceNumber ?? t.invoicesTable.draftFallback}
                    </Link>
                  </BodyCell>
                  <BodyCell>{formatDate(invoice.issueDate)}</BodyCell>
                  <BodyCell>{invoice.contractor?.name ?? '—'}</BodyCell>
                  <BodyCell className="hidden xl:table-cell">
                    <InvoiceEnvironmentChip environment={invoice.environment} />
                  </BodyCell>
                  {!compact ? <BodyCell className="hidden text-right tabular-nums 2xl:table-cell">{formatMoney(invoice.totalNet)}</BodyCell> : null}
                  {!compact ? <BodyCell className="hidden text-right tabular-nums 2xl:table-cell">{formatMoney(invoice.totalVat)}</BodyCell> : null}
                  <BodyCell className="text-right tabular-nums">{formatMoney(invoice.totalGross)}</BodyCell>
                  <BodyCell>
                    <InvoiceStatusChip status={invoice.status} />
                  </BodyCell>
                  <BodyCell className="hidden xl:table-cell">
                    <KsefStatusChip status={invoice.ksefStatus} />
                  </BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      <div className="grid gap-4 lg:hidden">
        {invoices.map((invoice) => (
          <Surface key={invoice.id} tone="panel" className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/dashboard/invoices/${invoice.id}`}
                  className="text-lg font-semibold tracking-tight text-primary-strong"
                >
                  {invoice.invoiceNumber ?? t.invoicesTable.draftFallback}
                </Link>
                <p className="mt-1 text-sm text-muted">{invoice.contractor?.name ?? t.invoicesTable.noContractorFallback}</p>
              </div>
              <InvoiceStatusChip status={invoice.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label={t.invoicesTable.dateColumn} value={formatDate(invoice.issueDate)} />
              <DetailItem label={t.invoicesTable.grossColumn} value={formatMoney(invoice.totalGross)} align="right" />
              {!compact ? <DetailItem label={t.invoicesTable.netColumn} value={formatMoney(invoice.totalNet)} /> : null}
              {!compact ? <DetailItem label={t.invoicesTable.vatColumn} value={formatMoney(invoice.totalVat)} align="right" /> : null}
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoicesTable.environmentColumn}</p>
                <InvoiceEnvironmentChip environment={invoice.environment} />
              </div>
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoicesTable.ksefColumn}</p>
                  <KsefStatusChip status={invoice.ksefStatus} />
                </div>
                <Link
                  href={`/dashboard/invoices/${invoice.id}`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary"
                >
                  {t.invoicesTable.detailsLink}
                </Link>
              </div>
            </div>
          </Surface>
        ))}
      </div>
    </>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-3 font-mono text-[11px] uppercase tracking-[0.14em] ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-4 align-middle text-foreground ${className}`}>{children}</td>;
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
