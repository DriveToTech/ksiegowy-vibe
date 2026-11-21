'use client';

import { useId, useState } from 'react';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { advisorSecondaryButtonClassName } from './AdvisorThread';
import { advisorMark } from './AdvisorWorkspace';

/** On-demand period summary: only prepares the question; nothing is sent until the user chooses to include records. */
export function AdvisorBriefingCard({ onPrepare }: { onPrepare: (period: string) => void }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const titleId = useId();
  const monthId = useId();
  return <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-2xl border border-[var(--primary-border)] bg-surface-panel p-4">
    <div className="flex items-center gap-2.5">
      {advisorMark('size-[18px] rounded-md')}
      <h3 id={titleId} className="m-0 text-[15px] font-semibold">{text.briefingCard.title}</h3>
      <span className="ml-auto whitespace-nowrap rounded-chip bg-draft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-draft-ink">{text.briefingCard.onDemand}</span>
    </div>
    <p className="m-0 text-[13px] leading-[1.55] text-foreground-secondary">{text.briefingCard.description}</p>
    <div className="flex flex-wrap items-center gap-3">
      <label htmlFor={monthId} className="flex items-center gap-2 text-[12.5px] text-foreground-secondary">{text.briefingCard.month}
        <input id={monthId} type="month" value={month} onChange={(event) => setMonth(event.target.value)}
          className="h-11 rounded-control border border-outline-control bg-surface-raised px-3 font-mono text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
      </label>
      <Button type="button" variant="secondary" className={advisorSecondaryButtonClassName} disabled={!month} onClick={() => onPrepare(month)}>{text.briefingCard.prepare}</Button>
    </div>
    <p className="m-0 text-xs text-muted">{text.briefingCard.hint}</p>
  </section>;
}
