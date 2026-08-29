import Link from 'next/link';
import type { HouseholdAccount, HouseholdGoalDetail, HouseholdGoalOverviewItem } from '../../lib/api-types';
import { formatDate, formatMoney, formatPercentage, todayAsCalendarDate } from '../../lib/format';
import { getHouseholdGoalActionAvailability } from '../../lib/household-goal-availability';
import { getHouseholdGoalForecast } from '../../lib/household-goal-forecast';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Surface } from '../atoms/Surface';
import { Banner } from '../molecules/Banner';
import { EmptyState } from '../molecules/EmptyState';
import { ErrorState } from '../molecules/ErrorState';
import { GoalLifecycleActions } from './GoalLifecycleActions';
import { GoalStatusChip } from '../molecules/StatusChip';

interface GoalDetailViewProps {
  householdId: string;
  detail: HouseholdGoalDetail;
  account: HouseholdAccount | null;
  overviewItem: HouseholdGoalOverviewItem | null;
  projectionAvailable: boolean;
}

export function GoalDetailView({ householdId, detail, account, overviewItem, projectionAvailable }: GoalDetailViewProps) {
  const { goal, movements } = detail;
  const target = goal.targetAmount ? Number(goal.targetAmount) : null;
  const current = Number(goal.currentAmount);
  const progress = target && target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : null;
  const remaining = target === null ? null : Math.max(0, target - current);
  const actionAvailability = getHouseholdGoalActionAvailability(goal);
  const forecast = getHouseholdGoalForecast(goal, overviewItem?.forecastDate ?? null, todayAsCalendarDate());
  const actionMessage = goal.status === 'ARCHIVED'
    ? t.household.goals.actions.archived
    : goal.status === 'COMPLETED'
      ? t.household.goals.actions.completedAddUnavailable
      : goal.status === 'PAUSED'
        ? t.household.goals.actions.paused
        : actionAvailability.canWithdraw ? null : t.household.goals.actions.withdrawUnavailable;

  return (
    <div className="space-y-5">
      <Surface className="space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <GoalStatusChip status={goal.status} />
              {account ? <Badge tone={account.visibility === 'PRIVATE' ? 'warning' : 'success'}>{t.household.goals.visibilityLabels[account.visibility]}</Badge> : null}
              <Badge tone="draft">{t.household.goals.kindLabels[goal.kind]}</Badge>
            </div>
            {goal.description ? <p className="max-w-2xl text-sm leading-relaxed text-muted">{goal.description}</p> : null}
          </div>
          <GoalLifecycleActions householdId={householdId} goalId={goal.id} status={goal.status} currentAmount={goal.currentAmount} />
        </div>

        {actionMessage ? <Banner tone={goal.status === 'ACTIVE' ? 'warning' : 'info'} role="status">{actionMessage}</Banner> : null}
        <div className="flex flex-wrap gap-2 border-t border-outline pt-4">
          {actionAvailability.canAdd ? <Button href={`/household/goals/${goal.id}/add`}>{t.household.goals.addMoney}</Button> : null}
          {actionAvailability.canWithdraw ? <Button href={`/household/goals/${goal.id}/withdraw`} variant="secondary">{t.household.goals.withdrawMoney}</Button> : null}
          {actionAvailability.canManageRules ? <Button href={`/household/goals/${goal.id}/rules`} variant="ghost">{t.household.goals.rulesAction}</Button> : null}
        </div>
      </Surface>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Surface className="space-y-5 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t.household.goals.detailProgressTitle}</h2>
              <p className="mt-1 text-sm text-muted">{formatMoney(goal.currentAmount)} {target !== null ? `z ${formatMoney(goal.targetAmount ?? '0')}` : t.household.goals.noCeilingLabel}</p>
            </div>
            {progress !== null ? <span className="font-mono text-sm text-primary-strong">{formatPercentage(progress, 1, 1)}</span> : null}
          </div>
          {progress !== null ? (
            <progress
              className="h-3 w-full overflow-hidden rounded-full accent-primary"
              value={current}
              max={target ?? 0}
              aria-label={`${t.household.goals.detailProgressTitle}: ${formatPercentage(progress, 1, 1)}`}
            />
          ) : (
            <div className="rounded-inset bg-surface-raised px-4 py-3 text-sm text-muted">{t.household.goals.noCeilingLabel}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label={t.household.goals.currentAmountLabel} value={formatMoney(goal.currentAmount)} />
            <Metric label={t.household.goals.remainingAmountLabel} value={remaining === null ? '—' : formatMoney(remaining)} />
            <Metric label={t.household.goals.monthlyPlanLabel} value={goal.monthlyAmount ? formatMoney(goal.monthlyAmount) : '—'} />
          </div>
        </Surface>

        <Surface className="space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t.household.goals.holdingAccountTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.household.goals.accountVisibilityHint}</p>
          </div>
          {account ? (
            <div className="rounded-inset bg-surface-raised p-4">
              <p className="font-medium text-foreground">{account.name}</p>
              {account.accountNumberMask ? <p className="mt-1 font-mono text-xs text-muted">{account.accountNumberMask}</p> : null}
              <div className="mt-4 flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted">{t.household.goals.accountBalanceLabel}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatMoney(goal.accountBalance)}</span>
              </div>
            </div>
          ) : (
            <ErrorState message="Informacje o koncie celu są chwilowo niedostępne." />
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            <span>{t.household.goals.targetDateLabel}: {formatDate(goal.targetDate)}</span>
            <span>{t.household.goals.totalsAdded}: {formatMoney(detail.totals.added)}</span>
            <span>{t.household.goals.totalsWithdrawn}: {formatMoney(detail.totals.withdrawn)}</span>
          </div>
        </Surface>
      </div>

      <Surface className="space-y-4 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t.household.goals.projectionTitle}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{t.household.goals.projectionDescription}</p>
        </div>
        {!projectionAvailable ? <ErrorState message={t.household.goals.projectionUnavailable} /> : (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t.household.goals.projectionTitle}</caption>
            <thead className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <tr>
                <th scope="col" className="px-3 py-2">{t.household.goals.projectionMetric}</th>
                <th scope="col" className="px-3 py-2">{t.household.goals.projectionValue}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-outline">
                <th scope="row" className="px-3 py-3 font-medium text-foreground">{t.household.goals.forecastLabel}</th>
                <td className="px-3 py-3 text-foreground">
                  {forecast.state === 'AVAILABLE' ? t.household.goals.forecastFixedOnly(formatDate(forecast.forecastDate)) : forecastMessage(forecast.state)}
                </td>
              </tr>
              <tr className="border-t border-outline">
                <th scope="row" className="px-3 py-3 font-medium text-foreground">{t.household.goals.projectionBasis}</th>
                <td className="px-3 py-3 text-muted">
                  {forecast.state === 'AVAILABLE' ? t.household.goals.projectionFixedRulesOnly : t.household.goals.projectionNoComputedDate}
                  {overviewItem?.hasVariableRules ? ` ${t.household.goals.variableForecastDisclosure}` : null}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </Surface>

      <Surface className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t.household.goals.rulesTitle}</h2>
            <p className="mt-1 text-sm text-muted">{t.household.goals.rulesDescription}</p>
          </div>
          {actionAvailability.canManageRules ? (
            <Link href={`/household/goals/${goal.id}/rules`} className="shrink-0 text-sm font-semibold text-primary-strong hover:text-primary">
              {t.household.goals.rulesAction}
            </Link>
          ) : null}
        </div>
        {!actionAvailability.canManageRules ? <p className="text-sm text-muted">{goal.status === 'ARCHIVED' ? t.household.goals.rules.readOnly : t.household.goals.rules.readOnlyCompleted}</p> : null}
        {goal.activeRules.length === 0 ? (
          <EmptyState title={t.household.goals.noRulesTitle} description={t.household.goals.noRulesDescription} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {goal.activeRules.map((rule) => (
              <div key={rule.id} className="rounded-inset bg-surface-raised p-4">
                <p className="text-sm font-semibold text-foreground">{t.household.goals.rules.typeLabels[rule.ruleType]}</p>
                <p className="mt-1 text-sm text-muted">{ruleSummary(rule)}</p>
              </div>
            ))}
          </div>
        )}
      </Surface>

      <Surface className="space-y-5 p-5 sm:p-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">{t.household.goals.movementsTitle}</h2>
          <p className="mt-1 text-sm text-muted">{t.household.goals.movementsEmptyDescription}</p>
        </div>
        {movements.length === 0 ? (
          <EmptyState title={t.household.goals.movementsEmptyTitle} description={t.household.goals.movementsEmptyDescription} />
        ) : (
          <>
            <GoalBalanceChart movements={movements.slice().reverse().map((movement) => ({ balanceAfter: movement.balanceAfter }))} />
            <div className="overflow-x-auto rounded-inset border border-outline">
              <table className="w-full min-w-[620px] text-left text-sm">
                <caption className="sr-only">{t.household.goals.movementsTitle}</caption>
                <thead className="bg-surface-raised font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th scope="col" className="px-4 py-3">{t.household.goals.movementDate}</th>
                    <th scope="col" className="px-4 py-3">{t.household.goals.movementType}</th>
                    <th scope="col" className="px-4 py-3">{t.household.goals.movementAmount}</th>
                    <th scope="col" className="px-4 py-3 text-right">{t.household.goals.movementBalance}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id} className="border-t border-outline">
                      <td className="px-4 py-3 text-muted">{formatDate(movement.effectiveDate)}</td>
                      <td className="px-4 py-3 text-foreground">{t.household.goals.movementSources[movement.source]}</td>
                      <td className={movement.amount.startsWith('-') ? 'px-4 py-3 tabular-nums text-error-ink' : 'px-4 py-3 tabular-nums text-success-ink'}>
                        {movement.amount.startsWith('-') ? formatMoney(movement.amount) : `+${formatMoney(movement.amount)}`}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">{formatMoney(movement.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Surface>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-inset bg-surface-raised p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ruleSummary(rule: HouseholdGoalOverviewItem['goal']['activeRules'][number]): string {
  if (rule.ruleType === 'FIXED_ON_DAY') return `${rule.fixedAmount ? formatMoney(rule.fixedAmount) : '—'} · dzień ${rule.dayOfMonth ?? '—'}`;
  if (rule.ruleType === 'PERCENT_OF_INCOME_OVER_THRESHOLD') return `${rule.percentage ? formatPercentage(rule.percentage, 1, 2) : '—'} · próg ${rule.incomeThreshold ? formatMoney(rule.incomeThreshold) : '—'}`;
  return `do ${rule.roundUpToAmount ? formatMoney(rule.roundUpToAmount) : '—'}`;
}

function forecastMessage(state: ReturnType<typeof getHouseholdGoalForecast>['state']): string {
  if (state === 'PAUSED') return t.household.goals.forecastPaused;
  if (state === 'COMPLETED') return t.household.goals.forecastCompleted;
  if (state === 'ARCHIVED') return t.household.goals.forecastArchived;
  if (state === 'FUTURE_FIXED_RULE') return t.household.goals.forecastFutureRule;
  return t.household.goals.forecastUnavailable;
}

function GoalBalanceChart({ movements }: { movements: Array<{ balanceAfter: string }> }) {
  const width = 640;
  const height = 170;
  const padding = 18;
  const values = movements.map((movement) => Number(movement.balanceAfter));
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = movements.length === 1 ? width / 2 : padding + index / (movements.length - 1) * (width - padding * 2);
    const y = height - padding - Math.max(0, value) / maximum * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="rounded-inset border border-outline bg-surface-raised p-3" aria-hidden="true">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full" preserveAspectRatio="none" focusable="false">
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="currentColor" strokeOpacity="0.2" />
        <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
