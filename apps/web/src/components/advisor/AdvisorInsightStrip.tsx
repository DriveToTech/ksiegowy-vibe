'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { advisorRequest, type AdvisorEnvironment, type AdvisorInsight, type AdvisorInsightView } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';

export function AdvisorInsightStrip({ companyId, environment, view, contractorId }: {
  companyId: string; environment: AdvisorEnvironment; view: AdvisorInsightView; contractorId?: string;
}) {
  return <ScopedAdvisorInsightStrip key={`${companyId}:${environment}:${view}:${contractorId ?? ''}`}
    companyId={companyId} environment={environment} view={view} contractorId={contractorId} />;
}

function ScopedAdvisorInsightStrip({ companyId, environment, view, contractorId }: {
  companyId: string; environment: AdvisorEnvironment; view: AdvisorInsightView; contractorId?: string;
}) {
  const [insight, setInsight] = useState<AdvisorInsight | null>(null);
  const [error, setError] = useState('');
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view, ...(contractorId ? { contractorId } : {}) });
    void advisorRequest<AdvisorInsight | null>(companyId, `/insights?${query}`, {
      headers: { 'x-ksef-environment': environment }, signal: controller.signal,
    }).then((result) => { if (!controller.signal.aborted) setInsight(result); })
      .catch(() => { if (!controller.signal.aborted) setError(text.insights.unavailable); });
    return () => controller.abort();
  }, [companyId, environment, view, contractorId, dismissedKeys]);
  if (!insight || dismissedKeys.includes(insight.key)) return null;
  return <aside aria-label={text.insights.title} className="rounded-card border border-primary/30 bg-surface-panel p-4">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{insight.title}</p>
        <p className="text-sm text-foreground-secondary">{insight.description}</p>
        <ul className="flex flex-wrap gap-2">{insight.evidence.map((record) => <li key={`${record.kind}:${record.id}`}>
          <Link href={`/dashboard/${record.kind === 'incoming' ? 'incoming' : 'invoices'}/${encodeURIComponent(record.id)}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline focus-visible:outline-2 focus-visible:outline-primary">
            {text.insights.evidence}: {record.title}
          </Link>
        </li>)}</ul>
      </div>
      <button type="button" aria-label={text.insights.dismiss}
        className="inline-flex min-h-11 shrink-0 items-center rounded-control px-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-primary"
        onClick={() => {
          setError('');
          const key = insight.key;
          setDismissedKeys((previous) => [...previous, key]);
          void advisorRequest(companyId, `/insights/${encodeURIComponent(key)}/dismiss`, {
            method: 'POST', headers: { 'x-ksef-environment': environment },
          }).catch(() => { setDismissedKeys((previous) => previous.filter((item) => item !== key)); setError(text.insights.unavailable); });
        }}>{text.insights.dismiss}</button>
    </div>
    {error && <p role="alert" className="text-sm text-error-ink">{error}</p>}
  </aside>;
}
