import type { BudgetEnvelope } from '../../lib/api-types';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { EmptyState } from './EmptyState';

interface EnvelopeProgressCardProps {
  envelopes: BudgetEnvelope[];
}

export function EnvelopeProgressCard({ envelopes }: EnvelopeProgressCardProps) {
  if (envelopes.length === 0) {
    return (
      <EmptyState
        title={t.household.dashboard.envelopesEmptyTitle}
        description={t.household.dashboard.envelopesEmptyDescription}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 self-start rounded-card border border-outline bg-surface-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t.household.dashboard.envelopesTitle}</h2>
      <div className="flex flex-col gap-3">
        {envelopes.map((envelope) => {
          const limit = parseFloat(envelope.monthlyLimit) || 0;
          const spent = parseFloat(envelope.spent) || 0;
          const percent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
          const isOver = limit > 0 && spent > limit;

          return (
            <div key={envelope.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-foreground">{envelope.categoryName}</span>
                <span className={isOver ? 'tabular-nums text-error-ink' : 'tabular-nums text-foreground-secondary'}>
                  {formatMoney(spent)} / {formatMoney(limit)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className={isOver ? 'h-full rounded-full bg-error-ink' : 'h-full rounded-full bg-[image:var(--brand-gradient)]'}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
