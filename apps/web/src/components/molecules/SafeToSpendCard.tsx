import { cn } from '../../lib/cn';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';

interface SafeToSpendCardProps {
  amount: string;
}

export function SafeToSpendCard({ amount }: SafeToSpendCardProps) {
  const isNegative = parseFloat(amount) < 0;

  return (
    <div className={cn('flex flex-col gap-2 rounded-card border bg-surface-panel p-5', isNegative ? 'border-error/30' : 'border-primary/30')}>
      <p className={cn('font-mono text-[10px] uppercase tracking-[0.14em]', isNegative ? 'text-error-ink' : 'text-primary')}>{t.household.dashboard.safeToSpendLabel}</p>
      <p className={cn('text-[28px] font-semibold tracking-[-0.03em] tabular-nums', isNegative ? 'text-error-ink' : 'text-foreground')}>{formatMoney(amount)}</p>
      <p className="text-[12.5px] leading-relaxed text-muted">{t.household.dashboard.safeToSpendHint}</p>
    </div>
  );
}
