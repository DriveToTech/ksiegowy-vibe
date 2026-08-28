import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';

interface SafeToSpendCardProps {
  amount: string;
}

export function SafeToSpendCard({ amount }: SafeToSpendCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-primary/30 bg-surface-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">{t.household.dashboard.safeToSpendLabel}</p>
      <p className="text-[28px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">{formatMoney(amount)}</p>
      <p className="text-[12.5px] leading-relaxed text-muted">{t.household.dashboard.safeToSpendHint}</p>
    </div>
  );
}
