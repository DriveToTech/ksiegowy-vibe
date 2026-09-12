import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDashboardSummary } from '../../lib/api';
import { Button } from '../../components/atoms/Button';
import { EmptyState } from '../../components/molecules/EmptyState';
import { PageHeader } from '../../components/molecules/PageHeader';
import { InvoicesTable } from '../../components/organisms/InvoicesTable';
import { t } from '../../lib/translations';
import { formatMoney } from '../../lib/format';
import { requireAuthSession } from '../../lib/auth';

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

  const summary = await getDashboardSummary(companyId);
  const now = new Date();
  const kpiCounts = { ...summary.ksefCounts, inClearance: summary.ksefCounts.pending };
  const monthBuckets = summary.salesByMonth.map((bucket) => ({
    ...bucket,
    label: new Date(Date.UTC(bucket.year, bucket.month - 1, 1))
      .toLocaleDateString('pl-PL', { month: 'short', timeZone: 'UTC' })
      .replace('.', '')
      .toUpperCase(),
  }));
  const maxGross = Math.max(1, ...monthBuckets.map((bucket) => Number(bucket.gross)));

  const alerts: Array<{ tone: 'error' | 'warning' | 'primary'; title: string; meta: string; href: string }> = [];
  if (summary.attention.rejected > 0) {
    alerts.push({ tone: 'error', title: t.dashboard.needsAttention.rejected(summary.attention.rejected), meta: t.dashboard.needsAttention.rejectedMeta, href: '/dashboard/invoices?ksefStatus=rejected' });
  }
  if (summary.attention.notSubmitted > 0) {
    alerts.push({ tone: 'warning', title: t.dashboard.needsAttention.notSubmitted(summary.attention.notSubmitted), meta: t.dashboard.needsAttention.notSubmittedMeta, href: '/dashboard/invoices?ksefStatus=not_submitted' });
  }
  if (summary.attention.incoming > 0) {
    alerts.push({ tone: 'primary', title: t.dashboard.needsAttention.incoming(summary.attention.incoming), meta: t.dashboard.needsAttention.incomingMeta, href: '/dashboard/incoming' });
  }

  const toneBorderClass: Record<(typeof alerts)[number]['tone'], string> = {
    error: 'border-error-ink',
    warning: 'border-warning-ink',
    primary: 'border-primary',
  };

  const recent = summary.recentInvoices;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.dashboard.pageEyebrow}
        title={t.dashboard.pageTitle}
        description={t.dashboard.pageDescription}
        actions={
          <>
            <Link href="/dashboard/incoming">
              <Button variant="secondary">{t.dashboard.goToIncoming}</Button>
            </Link>
            <Link href="/dashboard/invoices/new">
              <Button>{t.dashboard.createInvoice}</Button>
            </Link>
          </>
        }
      />

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
                    style={{ height: `${Math.max(4, (Number(bucket.gross) / maxGross) * 130)}px` }}
                  />
                  <span className={`font-mono text-[10px] ${isCurrent ? 'text-foreground' : 'text-muted'}`}>{bucket.label}</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-6 border-t border-outline pt-3">
            <ChartStat label={t.dashboard.chart.monthGross} value={formatMoney(summary.currentMonth.gross)} />
            <ChartStat label={t.dashboard.chart.vatPayable} value={formatMoney(summary.currentMonth.vat)} />
            <ChartStat label={t.dashboard.metrics.invoicesThisMonthLabel} value={String(summary.currentMonth.invoiceCount)} />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="text-sm font-semibold text-foreground">{t.dashboard.needsAttention.title}</h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted">{t.dashboard.needsAttention.empty}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <Link key={alert.title} href={alert.href} className={`rounded-inset border-l-[3px] bg-surface-raised px-3.5 py-3 transition hover:bg-surface-row-hover ${toneBorderClass[alert.tone]}`}>
                  <p className="text-sm font-medium text-foreground">{alert.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{alert.meta}</p>
                </Link>
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
            description={summary.contractorCount > 0 ? t.dashboard.emptyInvoicesDescription : t.outgoingInvoices.emptyState.withoutContractorsDescription}
            action={
              summary.contractorCount === 0 ? (
                <Link href="/dashboard/contractors">
                  <Button variant="secondary">{t.dashboard.addContractor}</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <InvoicesTable
            invoices={recent}
            showNet={false}
            compact
            header={
              summary.totalInvoices > recent.length ? (
                <Link href="/dashboard/invoices" className="ml-auto text-xs font-semibold text-primary transition hover:text-primary-strong">
                  {t.dashboard.recentDocuments.seeAll(summary.totalInvoices)}
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
