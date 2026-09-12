import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getContractors, getIncomingInvoices, getInvoices } from '../../lib/api';
import { Button } from '../../components/atoms/Button';
import { EmptyState } from '../../components/molecules/EmptyState';
import { DashboardDataIssue } from './DashboardDataIssue';
import { PageHeader } from '../../components/molecules/PageHeader';
import { InvoicesTable } from '../../components/organisms/InvoicesTable';
import { t } from '../../lib/translations';
import { formatMoney } from '../../lib/format';
import { requireAuthSession } from '../../lib/auth';

const INCOMING_NEEDS_ACTION_STATUSES = new Set(['UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED']);

const kpiCells = [
  { key: 'accepted' as const, dot: 'bg-success-ink', labelKey: 'accepted', hintKey: 'acceptedHint' },
  { key: 'inClearance' as const, dot: 'bg-warning-ink', labelKey: 'inClearance', hintKey: 'inClearanceHint' },
  { key: 'rejected' as const, dot: 'bg-error-ink', labelKey: 'rejected', hintKey: 'rejectedHint' },
  { key: 'notSubmitted' as const, dot: 'bg-neutral-status-ink', labelKey: 'notSubmitted', hintKey: 'notSubmittedHint' },
] as const;

export default async function DashboardPage() {
  const session = await requireAuthSession('/dashboard');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    redirect('/onboarding');
  }

  const activeEnvironment = session.activeKsefEnvironment;
  if (!activeEnvironment) {
    redirect('/onboarding');
  }

  const [invoicesRequest, incomingRequest, contractorsRequest] = await Promise.allSettled([
    getInvoices(companyId, activeEnvironment, { limit: '100' }),
    getIncomingInvoices(companyId, activeEnvironment, { limit: '100' }),
    getContractors(companyId, activeEnvironment),
  ]);

  if (invoicesRequest.status === 'rejected') {
    throw invoicesRequest.reason instanceof Error
      ? invoicesRequest.reason
      : new Error('Nie udało się pobrać faktur sprzedażowych.');
  }

  const invoicesResult = invoicesRequest.value;
  const incomingInvoices = incomingRequest.status === 'fulfilled' ? incomingRequest.value.data : null;
  const contractorCount = contractorsRequest.status === 'fulfilled' ? contractorsRequest.value.length : null;
  const invoices = invoicesResult.data;

  const now = new Date();

  const kpiCounts = {
    accepted: invoices.filter((invoice) => invoice.ksefStatus === 'accepted').length,
    inClearance: invoices.filter((invoice) => invoice.ksefStatus === 'pending').length,
    rejected: invoices.filter((invoice) => invoice.ksefStatus === 'rejected').length,
    notSubmitted: invoices.filter((invoice) => invoice.status === 'ISSUED' && invoice.ksefStatus === 'not_submitted').length,
  };

  const monthBuckets = Array.from({ length: 6 }, (_, index) => {
    const bucketDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    return {
      year: bucketDate.getUTCFullYear(),
      month: bucketDate.getUTCMonth(),
      label: bucketDate.toLocaleDateString('pl-PL', { month: 'short', timeZone: 'UTC' }).replace('.', '').toUpperCase(),
      gross: 0,
    };
  });
  for (const invoice of invoices) {
    const issueDate = new Date(invoice.issueDate);
    const bucket = monthBuckets.find((b) => b.year === issueDate.getUTCFullYear() && b.month === issueDate.getUTCMonth());
    if (bucket) bucket.gross += parseFloat(invoice.totalGross) || 0;
  }
  const maxGross = Math.max(1, ...monthBuckets.map((bucket) => bucket.gross));

  const currentMonthInvoices = invoices.filter((invoice) => {
    const issueDate = new Date(invoice.issueDate);
    return issueDate.getUTCFullYear() === now.getUTCFullYear() && issueDate.getUTCMonth() === now.getUTCMonth();
  });
  const monthGross = currentMonthInvoices.reduce((sum, invoice) => sum + (parseFloat(invoice.totalGross) || 0), 0);
  const monthVat = currentMonthInvoices.reduce((sum, invoice) => sum + (parseFloat(invoice.totalVat) || 0), 0);

  const incomingNeedsAction = incomingInvoices === null
    ? null
    : incomingInvoices.filter((invoice) => INCOMING_NEEDS_ACTION_STATUSES.has(invoice.status)).length;

  const alerts: Array<{ tone: 'error' | 'warning' | 'primary'; title: string; meta: string }> = [];
  if (kpiCounts.rejected > 0) {
    alerts.push({ tone: 'error', title: t.dashboard.needsAttention.rejected(kpiCounts.rejected), meta: t.dashboard.needsAttention.rejectedMeta });
  }
  if (kpiCounts.notSubmitted > 0) {
    alerts.push({ tone: 'warning', title: t.dashboard.needsAttention.notSubmitted(kpiCounts.notSubmitted), meta: t.dashboard.needsAttention.notSubmittedMeta });
  }
  if (incomingNeedsAction !== null && incomingNeedsAction > 0) {
    alerts.push({ tone: 'primary', title: t.dashboard.needsAttention.incoming(incomingNeedsAction), meta: t.dashboard.needsAttention.incomingMeta });
  }

  const toneBorderClass: Record<(typeof alerts)[number]['tone'], string> = {
    error: 'border-error-ink',
    warning: 'border-warning-ink',
    primary: 'border-primary',
  };

  const recent = invoices.slice(0, 6);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.dashboard.pageEyebrow}
        title={t.dashboard.pageTitle}
        description={t.dashboard.pageDescription}
          actions={
          <>
            <Button href="/dashboard/incoming" variant="secondary">{t.dashboard.goToIncoming}</Button>
            <Button href="/dashboard/invoices/new">{t.dashboard.createInvoice}</Button>
          </>
        }
      />

      {incomingRequest.status === 'rejected' ? (
        <DashboardDataIssue message="Nie udało się pobrać faktur przychodzących. Wskaźnik spraw wymagających uwagi jest niedostępny." />
      ) : null}
      {contractorsRequest.status === 'rejected' ? (
        <DashboardDataIssue message="Nie udało się pobrać kontrahentów. Część informacji i akcje zależne od tej listy są niedostępne." />
      ) : null}

      <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
        <div className="flex items-center justify-between border-b border-outline px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">{t.dashboard.kpi.title}</h2>
          <span className="font-mono text-[11px] text-muted">{t.dashboard.kpi.schemaTag}</span>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4">
          {kpiCells.map((cell, index) => (
            <div
              key={cell.key}
              className={`flex flex-col gap-1.5 px-5 py-4 ${index < kpiCells.length - 1 ? 'border-r border-outline' : ''} ${index >= 2 ? 'border-t border-outline xl:border-t-0' : ''}`}
            >
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-[2px] ${cell.dot}`} />
                {t.dashboard.kpi[cell.labelKey]}
              </div>
              <p className="text-[27px] font-semibold tracking-[-0.03em] text-foreground">{kpiCounts[cell.key]}</p>
              <p className="text-xs text-muted">{t.dashboard.kpi[cell.hintKey]}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4 rounded-card border border-outline bg-surface-panel p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-foreground">{t.dashboard.chart.title}</h2>
            <span className="font-mono text-[11px] text-muted">
              {monthBuckets[0]?.label} – {monthBuckets[monthBuckets.length - 1]?.label} {now.getUTCFullYear()}
            </span>
          </div>
          <div className="flex h-[150px] items-end gap-4">
            {monthBuckets.map((bucket, index) => {
              const isCurrent = index === monthBuckets.length - 1;
              return (
                <div key={`${bucket.year}-${bucket.month}`} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`w-full rounded-t-[7px] rounded-b-[2px] ${isCurrent ? 'bg-[image:var(--brand-gradient)]' : 'bg-foreground/10'}`}
                    style={{ height: `${Math.max(4, (bucket.gross / maxGross) * 130)}px` }}
                  />
                  <span className={`font-mono text-[10px] ${isCurrent ? 'text-foreground' : 'text-muted'}`}>{bucket.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 border-t border-outline pt-3">
            <ChartStat label={t.dashboard.chart.monthGross} value={formatMoney(monthGross)} />
            <ChartStat label={t.dashboard.chart.vatPayable} value={formatMoney(monthVat)} />
            <ChartStat label={t.dashboard.metrics.invoicesThisMonthLabel} value={String(currentMonthInvoices.length)} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="text-sm font-semibold text-foreground">{t.dashboard.needsAttention.title}</h2>
          {incomingNeedsAction === null ? (
            <p className="text-sm text-muted">Nie udało się ustalić, czy faktury przychodzące wymagają uwagi.</p>
          ) : alerts.length === 0 ? (
            <p className="text-sm text-muted">{t.dashboard.needsAttention.empty}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <div key={alert.title} className={`rounded-inset border-l-[3px] bg-surface-raised px-3.5 py-3 ${toneBorderClass[alert.tone]}`}>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{alert.meta}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{t.dashboard.recentDocuments.title}</h2>
        {recent.length === 0 ? (
          <EmptyState
            title={t.dashboard.emptyInvoicesTitle}
            description={contractorCount === null
              ? 'Brak faktur sprzedażowych. Nie udało się pobrać liczby kontrahentów.'
              : contractorCount > 0
                ? t.dashboard.emptyInvoicesDescription
                : t.outgoingInvoices.emptyState.withoutContractorsDescription}
            action={
              contractorCount === 0 ? (
                <Button href="/dashboard/contractors" variant="secondary">{t.dashboard.addContractor}</Button>
              ) : undefined
            }
          />
        ) : (
          <InvoicesTable
            invoices={recent}
            showNet={false}
            compact
            header={
              invoicesResult.total > recent.length ? (
                <Link href="/dashboard/invoices" className="ml-auto inline-flex min-h-11 items-center text-xs font-semibold text-primary transition hover:text-primary-strong">
                  {t.dashboard.recentDocuments.seeAll(invoicesResult.total)}
                </Link>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function ChartStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="text-lg font-semibold tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
    </div>
  );
}
