import Link from 'next/link';
import { getActiveCompany, getCompanyKsefSettings, getInvoice } from '../../../../lib/api';
import { Button } from '../../../../components/atoms/Button';
import { Surface } from '../../../../components/atoms/Surface';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { MetricCard } from '../../../../components/molecules/MetricCard';
import { InvoiceEnvironmentChip, InvoiceStatusChip, KsefStatusChip } from '../../../../components/molecules/StatusChip';
import { formatDate, formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import InvoiceActions from './InvoiceActions';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let companyId: string | null = null;
  let errorMsg: string | null = null;

  try {
    const { activeCompanyId } = await getActiveCompany();
    companyId = activeCompanyId;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : t.invoiceDetail.errors.companyLoadFailed;
  }

  if (errorMsg || !companyId) {
    return (
      <ErrorState message={errorMsg ?? t.invoiceDetail.errors.companyNotFound} />
    );
  }

  let invoice;
  try {
    invoice = await getInvoice(companyId, id);
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : t.invoiceDetail.errors.invoiceLoadFailed;
    return (
      <div className="space-y-4">
        <ErrorState message={errorMsg} />
        <Link href="/dashboard/invoices">
          <Button variant="secondary">{t.invoiceDetail.backToListButton}</Button>
        </Link>
      </div>
    );
  }

  const paymentMethodLabel = t.invoiceDetail.paymentMethods[invoice.paymentMethod] ?? invoice.paymentMethod;
  const correctionModeLabel = invoice.correctionMode ? t.invoiceDetail.correctionModes[invoice.correctionMode] ?? invoice.correctionMode : null;

  const ksefSettings = await getCompanyKsefSettings(companyId).catch(() => null);
  const ksefCredentialStatuses = ksefSettings?.credentials ?? undefined;

  return (
    <div className="space-y-8">
      {invoice.invoiceType === 'KOR' && invoice.correctedInvoice && (
        <Surface tone="glass" shape="organic" className="flex flex-wrap items-center gap-3 px-5 py-3 border-amber-400/20 bg-amber-400/10">
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">{t.invoiceDetail.correctionBannerPrefix}</span>
          <span className="text-sm font-medium text-foreground">{invoice.correctedInvoice.invoiceNumber ?? invoice.correctedInvoice.id}</span>
          <Link
            href={`/dashboard/invoices/${invoice.correctedInvoice.id}`}
            className="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            {t.invoiceDetail.correctionBannerViewOriginal}
          </Link>
        </Surface>
      )}
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-3">
          <Link href="/dashboard/invoices" className="text-sm font-medium text-muted transition hover:text-foreground">
            {t.invoiceDetail.backToInvoices}
          </Link>
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {invoice.invoiceNumber ?? t.invoiceDetail.draftTitle}
            </h1>
            <div className="flex flex-wrap items-center gap-3">
              <InvoiceStatusChip status={invoice.status} />
              <KsefStatusChip status={invoice.ksefStatus} />
              <InvoiceEnvironmentChip environment={invoice.environment} />
              <span className="text-sm text-muted">{t.invoiceDetail.issuedOn(formatDate(invoice.issueDate))}</span>
            </div>
          </div>
        </div>

        <div className="w-full max-w-2xl">
        <InvoiceActions
          companyId={companyId}
          invoiceId={id}
          invoiceType={invoice.invoiceType}
          status={invoice.status}
          ksefStatus={invoice.ksefStatus}
          totalGross={invoice.totalGross}
          paymentReceived={invoice.paymentReceived}
          ksefCredentialStatuses={ksefCredentialStatuses}
        />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <MetricCard label={t.invoiceDetail.metrics.net} value={formatMoney(invoice.totalNet)} />
        <MetricCard label={t.invoiceDetail.metrics.vat} value={formatMoney(invoice.totalVat)} />
        <MetricCard label={t.invoiceDetail.metrics.gross} value={formatMoney(invoice.totalGross)} accent="primary" />
        <MetricCard
          label={t.invoiceDetail.metrics.paid}
          value={formatMoney(invoice.paymentReceived)}
          hint={`${t.invoiceDetail.metrics.paymentMethodPrefix} ${paymentMethodLabel}`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)]">
        <InfoSection title={t.invoiceDetail.sections.seller}>
          <InfoRow label={t.invoiceDetail.fields.name} value={invoice.sellerName} />
          <InfoRow label={t.invoiceDetail.fields.nip} value={invoice.sellerNip} />
        </InfoSection>

        <InfoSection title={t.invoiceDetail.sections.buyer}>
          <InfoRow label={t.invoiceDetail.fields.name} value={invoice.buyerName} />
          <InfoRow label={t.invoiceDetail.fields.nip} value={invoice.buyerNip} />
        </InfoSection>

        <InfoSection title={t.invoiceDetail.sections.documentDetails}>
          <InfoRow label={t.invoiceDetail.fields.issueDate} value={formatDate(invoice.issueDate)} />
          <InfoRow label={t.invoiceDetail.fields.saleDate} value={formatDate(invoice.saleDate)} />
          <InfoRow label={t.invoiceDetail.fields.paymentMethod} value={paymentMethodLabel} />
          <InfoRow label={t.invoiceDetail.fields.paymentDueDate} value={formatDate(invoice.paymentDueDate)} />
          <InfoRow label={t.invoiceDetail.fields.currency} value={invoice.currency} />
          <InfoRow label={t.invoiceDetail.fields.environment} value={invoice.environment} />
          <InfoRow label={t.invoiceDetail.fields.correctionMode} value={correctionModeLabel} />
          <InfoRow label={t.invoiceDetail.fields.correctedInvoiceNumber} value={invoice.correctedInvoiceNumber} />
          <InfoRow label={t.invoiceDetail.fields.ksefReference} value={invoice.ksefReference} />
        </InfoSection>
      </div>

      <Surface tone="glass" shape="organic" className="space-y-5 p-6 xl:mr-8">
        <div>
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{t.invoiceDetail.sections.lineItemsTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.invoiceDetail.sections.lineItemsDescription}</p>
        </div>

        {invoice.lines.length === 0 ? (
          <EmptyState title={t.invoiceDetail.emptyLineItems.title} description={t.invoiceDetail.emptyLineItems.description} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full border-separate border-spacing-y-2 text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <HeaderCell className="w-14">{t.invoiceDetail.table.position}</HeaderCell>
                    <HeaderCell>{t.invoiceDetail.table.name}</HeaderCell>
                    <HeaderCell className="w-24">{t.invoiceDetail.table.unit}</HeaderCell>
                    <HeaderCell className="w-28 text-right">{t.invoiceDetail.table.quantity}</HeaderCell>
                    <HeaderCell className="w-40 text-right">{t.invoiceDetail.table.unitNetPrice}</HeaderCell>
                    <HeaderCell className="w-24">{t.invoiceDetail.table.vatRate}</HeaderCell>
                    <HeaderCell className="w-40 text-right">{t.invoiceDetail.table.netValue}</HeaderCell>
                    <HeaderCell className="w-40 text-right">{t.invoiceDetail.table.vatValue}</HeaderCell>
                    <HeaderCell className="w-40 text-right">{t.invoiceDetail.table.grossValue}</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="bg-surface-raised/22 transition hover:bg-surface-raised/40">
                      <BodyCell>{line.position}</BodyCell>
                      <BodyCell>{line.name}</BodyCell>
                      <BodyCell>{line.unit ?? t.invoiceDetail.notAvailable}</BodyCell>
                      <BodyCell className="text-right tabular-nums">{line.quantity}</BodyCell>
                      <BodyCell className="text-right tabular-nums">{formatMoney(line.unitNetPrice)}</BodyCell>
                      <BodyCell>{line.vatRate}%</BodyCell>
                      <BodyCell className="text-right tabular-nums">{formatMoney(line.netValue)}</BodyCell>
                      <BodyCell className="text-right tabular-nums">{formatMoney(line.vatValue)}</BodyCell>
                      <BodyCell className="text-right font-semibold tabular-nums">{formatMoney(line.grossValue)}</BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:hidden">
              {invoice.lines.map((line) => (
                <Surface key={line.id} tone="glass" shape="organic" className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoiceDetail.mobile.lineItem(line.position)}</p>
                      <p className="mt-1 font-semibold text-foreground">{line.name}</p>
                    </div>
                    <span className="text-sm text-muted">{line.unit ?? t.invoiceDetail.notAvailable}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoMetric label={t.invoiceDetail.table.quantity} value={line.quantity} />
                    <InfoMetric label={t.invoiceDetail.table.unitNetPrice} value={formatMoney(line.unitNetPrice)} align="right" />
                    <InfoMetric label={t.invoiceDetail.mobile.vatRate} value={`${line.vatRate}%`} />
                    <InfoMetric label={t.invoiceDetail.table.netValue} value={formatMoney(line.netValue)} align="right" />
                    <InfoMetric label={t.invoiceDetail.table.vatValue} value={formatMoney(line.vatValue)} />
                    <InfoMetric label={t.invoiceDetail.table.grossValue} value={formatMoney(line.grossValue)} align="right" strong />
                  </div>
                </Surface>
              ))}
            </div>
          </>
        )}

        <div className="grid gap-4 rounded-[2rem_1.25rem_2.25rem_1.5rem] bg-surface-raised/50 p-4 backdrop-blur-xl sm:grid-cols-3">
          <TotalItem label={t.invoiceDetail.metrics.net} value={formatMoney(invoice.totalNet)} />
          <TotalItem label={t.invoiceDetail.metrics.vat} value={formatMoney(invoice.totalVat)} />
          <TotalItem label={t.invoiceDetail.metrics.gross} value={formatMoney(invoice.totalGross)} bold />
        </div>
      </Surface>

      {invoice.vatBreakdown.length > 0 ? (
        <Surface tone="glass" shape="organic" className="space-y-5 p-6 xl:translate-x-6">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{t.invoiceDetail.sections.vatBreakdownTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.invoiceDetail.sections.vatBreakdownDescription}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {invoice.vatBreakdown.map((row) => (
              <Surface key={row.id} tone="glass" shape="organic" className="space-y-3 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoiceDetail.vatBreakdownRate(row.vatRate)}</p>
                <InfoMetric label={t.invoiceDetail.metrics.net} value={formatMoney(row.netAmount)} />
                <InfoMetric label={t.invoiceDetail.metrics.vat} value={formatMoney(row.vatAmount)} strong />
              </Surface>
            ))}
          </div>
        </Surface>
      ) : null}

      {invoice.notes ? (
        <Surface tone="glass" shape="organic" className="space-y-3 p-6 max-w-4xl">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">{t.invoiceDetail.sections.notes}</h2>
          <p className="text-sm leading-6 text-muted">{invoice.notes}</p>
        </Surface>
      ) : null}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Surface tone="glass" shape="organic" className="space-y-4 p-5">
      <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{title}</h2>
      {children}
    </Surface>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;

  return (
    <div className="text-sm">
      <span className="text-muted">{label}: </span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function TotalItem({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</div>
      <div className={bold ? 'mt-1 text-lg font-semibold tabular-nums text-foreground' : 'mt-1 text-sm font-medium tabular-nums text-foreground'}>
        {value}
      </div>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}>{children}</th>
  );
}

function BodyCell({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-4 align-middle ${className}`}>{children}</td>
  );
}

function InfoMetric({
  label,
  value,
  align = 'left',
  strong = false,
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
  strong?: boolean;
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className={strong ? 'mt-1 text-sm font-semibold text-foreground' : 'mt-1 text-sm font-medium text-foreground'}>{value}</p>
    </div>
  );
}
