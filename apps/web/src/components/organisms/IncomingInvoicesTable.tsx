import Link from 'next/link';
import type { IncomingInvoiceSummary } from '../../lib/api-types';
import { Surface } from '../atoms/Surface';
import { IncomingStatusChip, InvoiceEnvironmentChip } from '../molecules/StatusChip';

interface IncomingInvoicesTableProps {
  invoices: IncomingInvoiceSummary[];
}

export function IncomingInvoicesTable({ invoices }: IncomingInvoicesTableProps) {
  return (
    <>
      <Surface tone="panel" className="hidden overflow-hidden lg:block">
        <div className="overflow-x-auto px-3 py-3">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm">
            <thead className="sticky top-0 z-10 bg-surface-panel text-left text-muted">
              <tr>
                <HeaderCell>Sprzedawca</HeaderCell>
                <HeaderCell className="hidden 2xl:table-cell">NIP</HeaderCell>
                <HeaderCell>Nr faktury</HeaderCell>
                <HeaderCell className="hidden xl:table-cell">Środowisko</HeaderCell>
                <HeaderCell className="hidden xl:table-cell">Nr ref. KSeF</HeaderCell>
                <HeaderCell>Data</HeaderCell>
                <HeaderCell className="text-right">Kwota brutto</HeaderCell>
                <HeaderCell>Status</HeaderCell>
                <HeaderCell>Akcje</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="bg-transparent transition hover:bg-surface-raised/32">
                  <BodyCell>{invoice.sellerName ?? '—'}</BodyCell>
                  <BodyCell className="hidden 2xl:table-cell">{invoice.sellerNip ?? '—'}</BodyCell>
                  <BodyCell>{invoice.invoiceNumber ?? '—'}</BodyCell>
                  <BodyCell className="hidden xl:table-cell"><InvoiceEnvironmentChip environment={invoice.environment} /></BodyCell>
                  <BodyCell className="hidden xl:table-cell"><span className="block max-w-[200px] truncate font-mono text-xs text-muted" title={invoice.ksefReference ?? undefined}>{invoice.ksefReference ?? '—'}</span></BodyCell>
                  <BodyCell>{invoice.issueDate ?? '—'}</BodyCell>
                  <BodyCell className="text-right tabular-nums">
                    {invoice.totalGross ? `${invoice.totalGross} ${invoice.currency ?? 'PLN'}` : '—'}
                  </BodyCell>
                  <BodyCell>
                    <IncomingStatusChip status={invoice.status} />
                  </BodyCell>
                  <BodyCell>
                    <Link
                      href={`/dashboard/incoming/${invoice.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary"
                    >
                      Przeglądaj
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
          <Surface key={invoice.id} tone="panel" className="space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold tracking-tight text-foreground">
                  {invoice.sellerName ?? 'Nieznany sprzedawca'}
                </p>
                <p className="mt-1 text-sm text-muted">{invoice.invoiceNumber ?? 'Brak numeru faktury'}</p>
              </div>
              <IncomingStatusChip status={invoice.status} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="NIP" value={invoice.sellerNip ?? '—'} />
              <DetailItem label="Data" value={invoice.issueDate ?? '—'} align="right" />
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Środowisko</p>
                <InvoiceEnvironmentChip environment={invoice.environment} />
              </div>
              {invoice.ksefReference && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Nr ref. KSeF</p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground">{invoice.ksefReference}</p>
                </div>
              )}
              <DetailItem
                label="Kwota brutto"
                value={invoice.totalGross ? `${invoice.totalGross} ${invoice.currency ?? 'PLN'}` : '—'}
              />
              <div className="flex items-end justify-end sm:justify-end">
                <Link
                  href={`/dashboard/incoming/${invoice.id}`}
                  className="text-sm font-semibold text-primary-strong transition hover:text-primary"
                >
                  Przejdź do przeglądu
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
  return <th className={`px-3 py-3 text-xs font-semibold uppercase tracking-[0.06em] ${className}`}>{children}</th>;
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
