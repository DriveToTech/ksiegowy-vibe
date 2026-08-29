import Link from 'next/link';
import type { HouseholdAccount } from '../../../../lib/api-types';
import { getHouseholdAccounts, getHouseholdGoalsOverview } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatDate, formatMoney, todayAsCalendarDate } from '../../../../lib/format';
import { getHouseholdGoalForecast } from '../../../../lib/household-goal-forecast';
import { t } from '../../../../lib/translations';
import { Badge } from '../../../../components/atoms/Badge';
import { Button } from '../../../../components/atoms/Button';
import { Surface } from '../../../../components/atoms/Surface';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { GoalStatusChip } from '../../../../components/molecules/StatusChip';
import { PageHeader } from '../../../../components/molecules/PageHeader';

export default async function HouseholdGoalsPage() {
  const session = await requireAuthSession('/household/goals');
  const householdId = session.activeHouseholdId as string;
  const result = await Promise.all([
    getHouseholdGoalsOverview(householdId),
    getHouseholdAccounts(householdId),
  ]).catch(() => null);

  if (!result) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageEyebrow} title={t.household.goals.pageTitle} />
        <ErrorState message="Nie udało się wczytać oszczędności i celów." />
      </div>
    );
  }

  const [overview, accounts] = result;
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.household.goals.pageEyebrow}
        title={t.household.goals.pageTitle}
        description={t.household.goals.pageDescription}
        actions={
            <Button href="/household/goals/new">{t.household.goals.addGoal}</Button>
        }
      />

      <Surface className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t.household.goals.summaryTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.household.goals.lookback(overview.lookbackMonths)}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryMetric label={t.household.goals.averageMonthlySurplus} value={formatMoney(overview.averageMonthlySurplus)} />
          <SummaryMetric label={t.household.goals.availableForGoals} value={formatMoney(overview.availableForGoals)} />
          <SummaryMetric label={t.household.goals.scheduledMonthlyDemand} value={formatMoney(overview.scheduledMonthlyDemand)} />
          <SummaryMetric label={t.household.goals.fixedAutomationMonthlyDemand} value={formatMoney(overview.fixedAutomationMonthlyDemand)} />
        </div>
        {overview.hasVariableRules ? <p className="text-sm text-muted">{t.household.goals.variableForecastDisclosure}</p> : null}
      </Surface>

      {overview.goals.length === 0 ? (
        <EmptyState
          title={t.household.goals.emptyTitle}
          description={t.household.goals.emptyDescription}
          action={<Button href="/household/goals/new">{t.household.goals.addGoal}</Button>}
        />
      ) : (
        <section aria-labelledby="household-goals-list-title" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="household-goals-list-title" className="text-base font-semibold text-foreground">{t.household.goals.competingGoalsTitle}</h2>
            <p className="text-sm text-muted">{t.household.goals.competingGoalsDescription}</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {overview.goals.map((item) => (
              <GoalOverviewCard key={item.goal.id} item={item} account={accountsById.get(item.goal.accountId)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-inset bg-surface-raised p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function GoalOverviewCard({ item, account }: { item: Awaited<ReturnType<typeof getHouseholdGoalsOverview>>['goals'][number]; account?: HouseholdAccount }) {
  const target = item.goal.targetAmount ? Number(item.goal.targetAmount) : null;
  const current = Number(item.goal.currentAmount);
  const progress = target && target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : null;
  const forecast = getHouseholdGoalForecast(item.goal, item.forecastDate, todayAsCalendarDate());

  return (
    <Surface className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/household/goals/${item.goal.id}`} className="block truncate text-base font-semibold text-foreground hover:text-primary-strong">
            {item.goal.name}
          </Link>
           <div className="mt-1 flex flex-wrap items-center gap-2">
             <p className="truncate text-sm text-muted">{account?.name ?? t.household.goals.accountLabel}</p>
             {account ? <Badge tone={account.visibility === 'PRIVATE' ? 'warning' : 'success'}>{t.household.goals.visibilityLabels[account.visibility]}</Badge> : null}
           </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <GoalStatusChip status={item.goal.status} />
          <Badge tone={item.goal.activeRules.length > 0 ? 'primary' : 'draft'}>{item.goal.activeRules.length} reg.</Badge>
        </div>
      </div>
      {progress !== null ? (
        <div className="space-y-2">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-muted">{t.household.goals.balanceLabel}</span>
            <span className="tabular-nums text-foreground">{formatMoney(item.goal.currentAmount)} / {formatMoney(item.goal.targetAmount ?? '0')}</span>
          </div>
          <progress className="h-2.5 w-full overflow-hidden rounded-full accent-primary" value={current} max={target ?? 0} aria-label={`${item.goal.name}: ${progress.toFixed(1)}%`} />
        </div>
      ) : (
        <div className="rounded-inset bg-surface-raised px-3 py-2 text-sm text-muted">{t.household.goals.noCeilingLabel} · {formatMoney(item.goal.currentAmount)}</div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted">{t.household.goals.monthlyPlanLabel}</p>
          <p className="mt-1 tabular-nums text-foreground">{item.monthlyDemand === '0.00' ? '—' : formatMoney(item.monthlyDemand)}</p>
        </div>
        <div>
          <p className="text-xs text-muted">{t.household.goals.forecastLabel}</p>
           <p className="mt-1 text-foreground">{forecast.state === 'AVAILABLE' ? formatDate(forecast.forecastDate) : forecastMessage(forecast.state)}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-outline pt-3 text-xs text-muted">
        <span>{t.household.goals.allocationLabel}: {formatMoney(item.allocation)}</span>
        {Number(item.shortfall) > 0 ? <span>{t.household.goals.shortfallLabel}: {formatMoney(item.shortfall)}</span> : null}
        {item.hasVariableRules ? <span>{t.household.goals.variableForecastDisclosure}</span> : null}
      </div>
    </Surface>
  );
}

function forecastMessage(state: ReturnType<typeof getHouseholdGoalForecast>['state']): string {
  if (state === 'PAUSED') return t.household.goals.forecastPaused;
  if (state === 'COMPLETED') return t.household.goals.forecastCompleted;
  if (state === 'ARCHIVED') return t.household.goals.forecastArchived;
  if (state === 'FUTURE_FIXED_RULE') return t.household.goals.forecastFutureRule;
  return t.household.goals.forecastUnavailable;
}
