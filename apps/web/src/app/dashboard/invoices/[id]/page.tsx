import Link from 'next/link';
import { getCompanyKsefSettings, getInvoice } from '../../../../lib/api';
import { Button } from '../../../../components/atoms/Button';
import { Surface } from '../../../../components/atoms/Surface';
import { Banner } from '../../../../components/molecules/Banner';
import { ClearanceStepper, type ClearanceStep } from '../../../../components/molecules/ClearanceStepper';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { formatDate, formatMoney } from '../../../../lib/format';
import { requireAuthSession } from '../../../../lib/auth';
import type { KsefEnvironment } from '../../../../lib/ksef-environment';
import { t } from '../../../../lib/translations';
import InvoiceActions from './InvoiceActions';

function buildClearanceSteps(invoice: {
  createdAt: string;
  ksefStatus: string;
  status: string;
  paymentReceived: string;
  totalGross: string;
  paymentDueDate: string | null;
}): ClearanceStep[] {
  const isPaid = parseFloat(invoice.paymentReceived) >= parseFloat(invoice.totalGross) && parseFloat(invoice.totalGross) > 0;

  const sentState: ClearanceStep['state'] = invoice.ksefStatus === 'not_submitted' ? 'pending' : 'done';
  const clearanceState: ClearanceStep['state'] =
    invoice.ksefStatus === 'rejected' ? 'error' : invoice.ksefStatus === 'accepted' ? 'done' : 'pending';

  return [
    { label: t.invoiceDetail.stepper.created, meta: formatDate(invoice.createdAt), state: 'done' },
    { label: t.invoiceDetail.stepper.sent, meta: sentState === 'done' ? t.invoiceDetail.stepper.doneMeta : t.invoiceDetail.stepper.pendingMeta, state: sentState },
    {
      label: invoice.ksefStatus === 'rejected' ? t.invoiceDetail.stepper.rejected : t.invoiceDetail.stepper.accepted,
      meta: clearanceState === 'pending' ? t.invoiceDetail.stepper.pendingMeta : t.invoiceDetail.stepper.doneMeta,
      state: clearanceState,
    },
    {
      label: t.invoiceDetail.stepper.paid,
      meta: isPaid ? t.invoiceDetail.stepper.doneMeta : t.invoiceDetail.stepper.due(formatDate(invoice.paymentDueDate)),
      state: isPaid ? 'done' : 'pending',
    },
  ];
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await requireAuthSession(`/dashboard/invoices/${id}`);
  const companyId = session.activeCompanyId;
  const activeEnvironment: KsefEnvironment | null = session.activeKsefEnvironment;

  if (!companyId || !activeEnvironment) {
    return (
      <ErrorState message={t.invoiceDetail.errors.companyNotFound} />
    );
  }

  let invoice;
  try {
    invoice = await getInvoice(companyId, id, activeEnvironment);
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : t.invoiceDetail.errors.invoiceLoadFailed;
    return (
      <div className="space-y-4">
        <ErrorState message={errorMsg} />
        <Button href="/dashboard/invoices" variant="secondary">{t.invoiceDetail.backToListButton}</Button>
      </div>
    );
  }

  const paymentMethodLabel = t.invoiceDetail.paymentMethods[invoice.paymentMethod] ?? invoice.paymentMethod;
  const correctionModeLabel = invoice.correctionMode ? t.invoiceDetail.correctionModes[invoice.correctionMode] ?? invoice.correctionMode : null;

  const ksefSettings = await getCompanyKsefSettings(companyId).catch(() => null);
  const ksefCredentialStatuses = ksefSettings?.credentials ?? undefined;

  const isPaid = parseFloat(invoice.paymentReceived) >= parseFloat(invoice.totalGross) && parseFloat(invoice.totalGross) > 0;
  const clearanceSteps = buildClearanceSteps(invoice);

  return (
    <div className="space-y-6">
      <Link href="/dashboard/invoices" className="inline-flex min-h-11 items-center text-sm font-medium text-muted transition hover:text-foreground">
        {t.invoiceDetail.backToInvoices}
      </Link>

      {invoice.invoiceType === 'KOR' && invoice.correctedInvoice && (
        <Banner tone="warning" className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-warning-ink">{t.invoiceDetail.correctionBannerPrefix}</span>
          <span className="text-sm font-medium text-foreground">{invoice.correctedInvoice.invoiceNumber ?? invoice.correctedInvoice.id}</span>
          <Link
            href={`/dashboard/invoices/${invoice.correctedInvoice.id}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            {t.invoiceDetail.correctionBannerViewOriginal}
          </Link>
        </Banner>
      )}

      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <h1 className="font-mono text-[26px] font-medium tracking-[-0.01em] text-foreground">
            {invoice.invoiceNumber ?? (invoice.status === 'ISSUING' ? t.invoiceDetail.issuingTitle : t.invoiceDetail.draftTitle)}
          </h1>
          <p className="text-sm text-muted">
            {t.invoiceDetail.issuedOn(formatDate(invoice.issueDate))}
            {invoice.saleDate ? ` · ${t.invoiceDetail.fields.saleDate.toLowerCase()} ${formatDate(invoice.saleDate)}` : ''}
            {invoice.paymentDueDate ? ` · ${t.invoiceDetail.fields.paymentDueDate.toLowerCase()} ${formatDate(invoice.paymentDueDate)}` : ''}
          </p>
        </div>

        <div className="flex flex-col items-start gap-1 xl:items-end">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.invoiceDetail.metrics.gross}</p>
          <p className="text-[34px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">{formatMoney(invoice.totalGross)}</p>
          <p className={`text-sm ${isPaid ? 'text-success-ink' : 'text-warning-ink'}`}>
            {isPaid ? t.invoiceDetail.paidLabel : t.invoiceDetail.unpaidLabel} · {formatMoney(invoice.paymentReceived)} {t.invoiceDetail.receivedSuffix}
          </p>
        </div>
      </div>

      <InvoiceActions
        companyId={companyId}
        invoiceId={id}
        invoiceNumber={invoice.invoiceNumber}
        invoiceType={invoice.invoiceType}
        status={invoice.status}
        ksefStatus={invoice.ksefStatus}
         totalGross={invoice.totalGross}
         paymentReceived={invoice.paymentReceived}
         activeEnvironment={activeEnvironment}
         ksefCredentialStatuses={ksefCredentialStatuses}
      />

      <Surface tone="panel" className="space-y-5 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.clearanceTitle}</h2>
          <span className="inline-flex items-center gap-1.5 rounded-chip border border-warning-ink/30 bg-warning px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-warning-ink">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning-ink" />
            {invoice.environment}
          </span>
        </div>
        <ClearanceStepper steps={clearanceSteps} />
        {invoice.ksefReference ? (
          <div className="flex flex-col gap-3 rounded-inset bg-surface-raised p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.invoiceDetail.fields.ksefReference}</p>
              <p className="font-mono text-sm text-foreground">{invoice.ksefReference}</p>
            </div>
            <p className="text-xs text-muted sm:ml-auto sm:max-w-xs">{t.invoiceDetail.ksefReferenceHint}</p>
          </div>
        ) : null}
      </Surface>

      <div className="grid gap-4 lg:grid-cols-3">
        <InfoSection title={t.invoiceDetail.sections.seller}>
          <InfoRow label={t.invoiceDetail.fields.name} value={invoice.sellerName} />
          <InfoRow label={t.invoiceDetail.fields.nip} value={invoice.sellerNip} />
        </InfoSection>

        <InfoSection title={t.invoiceDetail.sections.buyer}>
          <InfoRow label={t.invoiceDetail.fields.name} value={invoice.buyerName} />
          <InfoRow label={t.invoiceDetail.fields.nip} value={invoice.buyerNip} />
        </InfoSection>

        <InfoSection title={t.invoiceDetail.sections.documentDetails}>
          <InfoRow label={t.invoiceDetail.fields.paymentMethod} value={paymentMethodLabel} />
          <InfoRow label={t.invoiceDetail.fields.currency} value={invoice.currency} />
          <InfoRow label={t.invoiceDetail.fields.correctionMode} value={correctionModeLabel} />
          <InfoRow label={t.invoiceDetail.fields.correctedInvoiceNumber} value={invoice.correctedInvoiceNumber} />
        </InfoSection>
      </div>

      <Surface tone="panel" className="space-y-5 p-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.lineItemsTitle}</h2>
          <p className="mt-1 text-xs text-muted">{t.invoiceDetail.sections.lineItemsDescription}</p>
        </div>

        {invoice.lines.length === 0 ? (
          <EmptyState title={t.invoiceDetail.emptyLineItems.title} description={t.invoiceDetail.emptyLineItems.description} />
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-outline text-left">
                    <HeaderCell className="w-10">{t.invoiceDetail.table.position}</HeaderCell>
                    <HeaderCell>{t.invoiceDetail.table.name}</HeaderCell>
                    <HeaderCell className="w-20">{t.invoiceDetail.table.unit}</HeaderCell>
                    <HeaderCell className="w-20 text-right">{t.invoiceDetail.table.quantity}</HeaderCell>
                    <HeaderCell className="w-32 text-right">{t.invoiceDetail.table.unitNetPrice}</HeaderCell>
                    <HeaderCell className="w-20 text-right">{t.invoiceDetail.table.vatRate}</HeaderCell>
                    <HeaderCell className="w-32 text-right">{t.invoiceDetail.table.netValue}</HeaderCell>
                    <HeaderCell className="w-32 text-right">{t.invoiceDetail.table.grossValue}</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="border-b border-outline tabular-nums last:border-b-0">
                      <BodyCell className="text-muted">{line.position}</BodyCell>
                      <BodyCell>{line.name}</BodyCell>
                      <BodyCell className="text-muted">{line.unit ?? t.invoiceDetail.notAvailable}</BodyCell>
                      <BodyCell className="text-right">{line.quantity}</BodyCell>
                      <BodyCell className="text-right">{formatMoney(line.unitNetPrice)}</BodyCell>
                      <BodyCell className="text-right">{line.vatRate}%</BodyCell>
                      <BodyCell className="text-right">{formatMoney(line.netValue)}</BodyCell>
                      <BodyCell className="text-right font-semibold">{formatMoney(line.grossValue)}</BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:hidden">
              {invoice.lines.map((line) => (
                <Surface key={line.id} tone="inset" className="space-y-4 p-4">
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

        <div className="grid gap-4 rounded-inset bg-surface-raised p-4 sm:grid-cols-3">
          <TotalItem label={t.invoiceDetail.metrics.net} value={formatMoney(invoice.totalNet)} />
          <TotalItem label={t.invoiceDetail.metrics.vat} value={formatMoney(invoice.totalVat)} />
          <TotalItem label={t.invoiceDetail.metrics.gross} value={formatMoney(invoice.totalGross)} bold />
        </div>
      </Surface>

      {invoice.vatBreakdown.length > 0 ? (
        <Surface tone="panel" className="space-y-5 p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.vatBreakdownTitle}</h2>
            <p className="mt-1 text-xs text-muted">{t.invoiceDetail.sections.vatBreakdownDescription}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {invoice.vatBreakdown.map((row) => (
              <div key={row.id} className="space-y-3 border-t border-outline pt-3 first:border-t-0 first:pt-0 md:border-t-0">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.invoiceDetail.vatBreakdownRate(row.vatRate)}</p>
                <InfoMetric label={t.invoiceDetail.metrics.net} value={formatMoney(row.netAmount)} />
                <InfoMetric label={t.invoiceDetail.metrics.vat} value={formatMoney(row.vatAmount)} strong />
              </div>
            ))}
          </div>
        </Surface>
      ) : null}

      {invoice.notes ? (
        <Surface tone="panel" className="max-w-4xl space-y-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">{t.invoiceDetail.sections.notes}</h2>
          <p className="text-sm leading-relaxed text-foreground-secondary">{invoice.notes}</p>
        </Surface>
      ) : null}
    </div>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Surface tone="panel" className="space-y-3 p-5">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{title}</h2>
      {children}
    </Surface>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;

  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

function TotalItem({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted">{label}</div>
      <div className={bold ? 'mt-1 text-lg font-semibold tabular-nums text-foreground' : 'mt-1 text-sm font-medium tabular-nums text-foreground'}>
        {value}
      </div>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted ${className}`}>{children}</th>
  );
}

function BodyCell({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 align-middle text-foreground ${className}`}>{children}</td>
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
