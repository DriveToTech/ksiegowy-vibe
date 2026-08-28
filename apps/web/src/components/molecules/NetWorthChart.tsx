import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';

interface NetWorthChartProps {
  netWorth: string;
  changePercent: string;
  history?: Array<{ month: string; value: string }>;
}

/**
 * The dashboard aggregate (per the plan's Domain Model) carries the current
 * net worth figure and its month-over-month change, not a full history
 * series — that's a Phase 2/3 reports concern. `history` is optional so this
 * renders as a compact stat now and grows a sparkline once that data exists.
 */
export function NetWorthChart({ netWorth, changePercent, history }: NetWorthChartProps) {
  const changeValue = parseFloat(changePercent) || 0;

  return (
    <div className="flex flex-col gap-2 rounded-card border border-outline bg-surface-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.dashboard.netWorthLabel}</p>
      <p className="text-[25px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">{formatMoney(netWorth)}</p>
      <p className={changeValue >= 0 ? 'text-[12.5px] text-primary' : 'text-[12.5px] text-error-ink'}>
        {changeValue >= 0 ? '+' : ''}{changePercent}% {t.household.dashboard.netWorthChangeSuffix}
      </p>
      {history && history.length > 0 ? (
        <div className="mt-1 flex h-10 items-end gap-1">
          {history.map((point) => {
            const maxValue = Math.max(1, ...history.map((entry) => parseFloat(entry.value) || 0));
            const value = parseFloat(point.value) || 0;
            return <div key={point.month} className="flex-1 rounded-t-[2px] bg-primary/60" style={{ height: `${(value / maxValue) * 100}%` }} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
