import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';

export const advisorReadinessTitleIdentifier = 'advisor-readiness-title';

export interface AdvisorReadinessRow {
  label: string;
  chip: string;
  tone: 'draft' | 'primary' | 'success' | 'warning' | 'danger';
  reason?: string;
}

// Three rows, each with its own gate reason. `rows === null` renders a skeleton while the settings snapshot is loading.
// The title stays in the DOM (screen readers and focus return target) but is not drawn, as in the A8 board.
export function AdvisorReadinessSummary({ rows }: { rows: AdvisorReadinessRow[] | null }) {
  return <section aria-labelledby={advisorReadinessTitleIdentifier} aria-busy={rows === null} className="overflow-hidden rounded-inset bg-surface-raised">
    <h3 id="advisor-readiness-title" tabIndex={-1} className="sr-only">{text.readiness.title}</h3>
    {rows === null
      ? <div aria-hidden className="h-[132px] animate-pulse bg-skeleton motion-reduce:animate-none" />
      : <dl>
        {rows.map((row) => <div key={row.label} className="grid min-h-11 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-outline px-3.5 py-2 first:border-t-0 sm:grid-cols-[150px_auto_1fr]">
          <dt className="text-[12.5px] text-foreground-secondary">{row.label}</dt>
          <dd className="justify-self-start"><Badge variant="tag" tone={row.tone}>{row.chip}</Badge></dd>
          {row.reason && <dd className="col-span-full text-[12.5px] text-muted sm:col-span-1">{row.reason}</dd>}
        </div>)}
      </dl>}
  </section>;
}
