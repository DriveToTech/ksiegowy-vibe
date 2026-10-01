import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';

export const advisorReadinessTitleIdentifier = 'advisor-readiness-title';

export interface AdvisorReadinessRow {
  label: string;
  chip: string;
  tone: 'draft' | 'primary' | 'success' | 'warning' | 'danger';
  reason?: string;
}

// `rows === null` renders a skeleton while the settings snapshot is loading.
export function AdvisorReadinessSummary({ rows }: { rows: AdvisorReadinessRow[] | null }) {
  return <section aria-labelledby={advisorReadinessTitleIdentifier} aria-busy={rows === null} className="space-y-2 rounded-card border border-outline bg-surface-raised p-4">
    <h3 id="advisor-readiness-title" tabIndex={-1} className="font-medium">{text.readiness.title}</h3>
    {rows === null
      ? <div aria-hidden className="h-16 animate-pulse rounded-inset bg-surface-panel motion-reduce:animate-none" />
      : <dl className="space-y-2">
        {rows.map((row) => <div key={row.label} className="grid gap-1 md:grid-cols-[180px_auto_1fr] md:items-center md:gap-3">
          <dt className="text-sm text-muted">{row.label}</dt>
          <dd><Badge tone={row.tone}>{row.chip}</Badge></dd>
          {row.reason && <dd className="text-sm text-muted">{row.reason}</dd>}
        </div>)}
      </dl>}
  </section>;
}
