import { t } from '../../lib/translations';
import { EmptyState } from './EmptyState';

interface InOutChartProps {
  months: Array<{ month: string; income: string; expense: string }>;
}

export function InOutChart({ months }: InOutChartProps) {
  const hasData = months.some((month) => (parseFloat(month.income) || 0) > 0 || (parseFloat(month.expense) || 0) > 0);
  if (!hasData) {
    return (
      <EmptyState
        title={t.household.dashboard.chartEmptyTitle}
        description={t.household.dashboard.chartEmptyDescription}
      />
    );
  }

  const maxValue = Math.max(1, ...months.flatMap((month) => [parseFloat(month.income) || 0, parseFloat(month.expense) || 0]));

  return (
    <div className="flex h-full flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t.household.dashboard.chartTitle}</h2>
      <div className="flex flex-1 items-end gap-3.5">
        {months.map((month) => {
          const income = parseFloat(month.income) || 0;
          const expense = parseFloat(month.expense) || 0;

          return (
            <div key={month.month} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-[108px] w-full items-end gap-[3px]">
                <div className="flex-1 rounded-t-[4px] bg-primary" style={{ height: `${(income / maxValue) * 100}%` }} />
                <div className="flex-1 rounded-t-[4px] bg-foreground/20" style={{ height: `${(expense / maxValue) * 100}%` }} />
              </div>
              <span className="font-mono text-[10px] text-muted">{month.month}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 border-t border-outline pt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-primary" />{t.household.dashboard.moneyInLabel}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px] bg-foreground/20" />{t.household.dashboard.moneyOutLabel}</span>
      </div>
    </div>
  );
}
