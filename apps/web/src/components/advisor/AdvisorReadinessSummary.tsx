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
  return <section aria-labelledby={advisorReadinessTitleIdentifier} aria-busy={rows === null} className="space-y-2 rounded-card border border-outline bg-surface-panel p-4">
    <h3 id="advisor-readiness-title" tabIndex={-1} className="font-medium">{text.readiness.title}</h3>
    {rows === null
      ? <div aria-hidden className="h-16 animate-pulse rounded-inset bg-surface-raised motion-reduce:animate-none" />
      : <dl className="divide-y divide-outline">
        {rows.map((row) => <div key={row.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 first:pt-1 last:pb-0">
          <div className="min-w-0 flex-1 basis-48">
            <dt className="text-sm font-medium">{row.label}</dt>
            {row.reason && <dd className="text-sm text-muted">{row.reason}</dd>}
          </div>
          <dd><Badge variant="tag" tone={row.tone}>{row.chip}</Badge></dd>
        </div>)}
      </dl>}
  </section>;
}
