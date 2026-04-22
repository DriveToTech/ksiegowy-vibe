import Link from 'next/link';
import type { InvoiceSummary } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { Surface } from '../atoms/Surface';
import { InvoiceStatusChip, KsefStatusChip } from '../molecules/StatusChip';

interface InvoicesTableProps {
  invoices: InvoiceSummary[];
  compact?: boolean;
}

export function InvoicesTable({ invoices, compact = false }: InvoicesTableProps) {
  return (
    <>
      <Surface tone="glass" shape="organic" className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto px-3 py-3">
          <table className="min-w-full border-collapse text-sm">
            <thead className="text-left text-muted">
              <tr>
                <HeaderCell>Numer</HeaderCell>
                <HeaderCell>Data</HeaderCell>
                <HeaderCell>Kontrahent</HeaderCell>
                {!compact ? <HeaderCell className="text-right">Netto</HeaderCell> : null}
                {!compact ? <HeaderCell className="text-right">VAT</HeaderCell> : null}
                <HeaderCell className="text-right">Brutto</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>KSeF</HeaderCell>
                <HeaderCell>Akcje</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b-[10px] border-transparent bg-transparent transition hover:bg-surface-raised/32">
                  <BodyCell>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="font-semibold text-primary-strong transition hover:text-primary"
                    >
                      {invoice.invoiceNumber ?? 'Szkic'}
                    </Link>
                  </BodyCell>
                  <BodyCell>{formatDate(invoice.issueDate)}</BodyCell>
                  <BodyCell>{invoice.contractor?.name ?? '—'}</BodyCell>
                  {!compact ? <BodyCell className="text-right tabular-nums">{formatMoney(invoice.totalNet)}</BodyCell> : null}
                  {!compact ? <BodyCell className="text-right tabular-nums">{formatMoney(invoice.totalVat)}</BodyCell> : null}
                  <BodyCell className="text-right tabular-nums">{formatMoney(invoice.totalGross)}</BodyCell>
                  <BodyCell>
                    <InvoiceStatusChip status={invoice.status} />
                  </BodyCell>
                  <BodyCell>
                    <KsefStatusChip status={invoice.ksefStatus} />
                  </BodyCell>
                  <BodyCell>
                    <Link
                      href={`/dashboard/invoices/${invoice.id}`}
                      className="text-sm font-medium text-primary-strong transition hover:text-primary"
                    >
                      Szczegóły
                    </Link>
                  </BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Surface>

      <div className="grid gap-4 lg:hidden">
        {invoices.map((invoice) => (
          <Surface key={invoice.id} tone="glass" shape="organic" className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link
                  href={`/dashboard/invoices/${invoice.id}`}
                  className="font-display text-lg font-semibold tracking-tight text-primary-strong"
                >
                  {invoice.invoiceNumber ?? 'Szkic'}
                </Link>
                <p className="mt-1 text-sm text-muted">{invoice.contractor?.name ?? 'Brak kontrahenta'}</p>
              </div>
              <InvoiceStatusChip status={invoice.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="Data" value={formatDate(invoice.issueDate)} />
              <DetailItem label="Brutto" value={formatMoney(invoice.totalGross)} align="right" />
              {!compact ? <DetailItem label="Netto" value={formatMoney(invoice.totalNet)} /> : null}
              {!compact ? <DetailItem label="VAT" value={formatMoney(invoice.totalVat)} align="right" /> : null}
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">KSeF</p>
                  <KsefStatusChip status={invoice.ksefStatus} />
                </div>
                <Link
                  href={`/dashboard/invoices/${invoice.id}`}
                  className="text-sm font-semibold text-primary-strong transition hover:text-primary"
                >
                  Szczegóły
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
  return <th className={`px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-4 align-middle text-foreground ${className}`}>{children}</td>;
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
