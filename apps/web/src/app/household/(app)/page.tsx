import Link from 'next/link';
import { getHouseholdDashboard } from '../../../lib/api';
import { requireAuthSession } from '../../../lib/auth';
import { formatMoney } from '../../../lib/format';
import { t } from '../../../lib/translations';
import { Button } from '../../../components/atoms/Button';
import { EmptyState } from '../../../components/molecules/EmptyState';
import { EnvelopeProgressCard } from '../../../components/molecules/EnvelopeProgressCard';
import { ErrorState } from '../../../components/molecules/ErrorState';
import { InOutChart } from '../../../components/molecules/InOutChart';
import { NetWorthChart } from '../../../components/molecules/NetWorthChart';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { SafeToSpendCard } from '../../../components/molecules/SafeToSpendCard';

export default async function HouseholdDashboardPage() {
  const session = await requireAuthSession('/household');
  const householdId = session.activeHouseholdId as string; // guaranteed by the layout guard

  const dashboard = await getHouseholdDashboard(householdId).catch(() => null);

  if (!dashboard) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.dashboard.pageEyebrow} title={t.household.dashboard.pageTitle} />
        <ErrorState message={t.household.dashboard.loadError} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.household.dashboard.pageEyebrow}
        title={t.household.dashboard.pageTitle}
        actions={
          <Link href="/household/ledger/new">
            <Button>{t.household.dashboard.addPayment}</Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SafeToSpendCard amount={dashboard.safeToSpend} />
        <StatCard label={t.household.dashboard.moneyInLabel} value={formatMoney(dashboard.moneyIn)} />
        <StatCard label={t.household.dashboard.moneyOutLabel} value={formatMoney(dashboard.moneyOut)} />
        <NetWorthChart netWorth={dashboard.netWorth} changePercent={dashboard.netWorthChangePercent} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <EnvelopeProgressCard envelopes={dashboard.envelopes} />

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5 rounded-card border border-success/30 bg-success/10 p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-success-ink">{t.household.dashboard.savingsRateLabel}</p>
            <p className="text-[22px] font-semibold tracking-[-0.02em] text-foreground">{dashboard.savingsRatePercent}%</p>
            <p className="text-[12px] leading-relaxed text-muted">{formatMoney(dashboard.savingsAmountThisMonth)} {t.household.dashboard.savingsAmountSuffix}</p>
          </div>

          <div className="rounded-card border border-outline bg-surface-panel p-5">
            <h2 className="mb-3 text-sm font-semibold text-foreground">{t.household.dashboard.upcomingTitle}</h2>
            {dashboard.upcomingCommitments.length === 0 ? (
              <EmptyState title={t.household.dashboard.upcomingEmptyTitle} description={t.household.dashboard.upcomingEmptyDescription} />
            ) : (
              <div className="flex flex-col gap-2">
                {dashboard.upcomingCommitments.map((commitment) => (
                  <div key={commitment.id} className="flex items-center gap-3 rounded-inset bg-surface-raised px-3 py-2.5 text-[12.5px]">
                    <span className="w-10 shrink-0 font-mono text-muted">{commitment.nextDueDate.slice(8, 10)}.{commitment.nextDueDate.slice(5, 7)}</span>
                    <span className="flex-1">{commitment.name}</span>
                    <span className="font-medium tabular-nums">{formatMoney(commitment.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <InOutChart months={dashboard.monthlyInOut} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-outline bg-surface-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="text-[25px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">{value}</p>
    </div>
  );
}
