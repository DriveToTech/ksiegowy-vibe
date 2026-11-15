'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { advisorRequest, type AdvisorEnvironment, type AdvisorInsight, type AdvisorInsightView } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';

const UNDO_WINDOW_MILLISECONDS = 8000;

interface AdvisorInsightStripProps {
  companyId: string; environment: AdvisorEnvironment; view: AdvisorInsightView; contractorId?: string;
}

export function AdvisorInsightStrip(props: AdvisorInsightStripProps) {
  return <ScopedAdvisorInsightStrip key={`${props.companyId}:${props.environment}:${props.view}:${props.contractorId ?? ''}`} {...props} />;
}

function ScopedAdvisorInsightStrip({ companyId, environment, view, contractorId }: AdvisorInsightStripProps) {
  const [insight, setInsight] = useState<AdvisorInsight | null>(null);
  const [phase, setPhase] = useState<'visible' | 'undo' | 'dismissed'>('visible');
  const [dismissFailed, setDismissFailed] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKey = useRef<string | null>(null);
  const mounted = useRef(true);

  const sendDismiss = (key: string) => advisorRequest(companyId, `/insights/${encodeURIComponent(key)}/dismiss`, {
    method: 'POST', headers: { 'x-ksef-environment': environment },
  });

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ view, ...(contractorId ? { contractorId } : {}) });
    // A load error renders nothing, so it is deliberately swallowed.
    void advisorRequest<AdvisorInsight | null>(companyId, `/insights?${query}`, {
      headers: { 'x-ksef-environment': environment }, signal: controller.signal,
    }).then((result) => { if (!controller.signal.aborted) setInsight(result); })
      .catch(() => undefined);
    return () => controller.abort();
  }, [companyId, environment, view, contractorId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (undoTimer.current) clearTimeout(undoTimer.current);
      // Navigation inside the undo window sends the pending dismissal immediately.
      if (pendingKey.current) void sendDismiss(pendingKey.current).catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scope props are fixed per keyed instance
  }, []);

  if (!insight || phase === 'dismissed') return null;

  if (phase === 'undo') {
    return <div role="status" className="flex min-h-11 items-center justify-between gap-3 rounded-[12px] border border-dashed border-outline-strong bg-surface-raised py-0 pl-[15px] pr-2 text-[13px] text-foreground-secondary">
      <span>{text.insights.hidden(insight.title)}</span>
      <button type="button" className="inline-flex min-h-11 items-center rounded-control px-3 text-[13px] font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        onClick={() => {
          if (undoTimer.current) clearTimeout(undoTimer.current);
          pendingKey.current = null;
          setPhase('visible');
        }}>{text.insights.undo}</button>
    </div>;
  }

  const startUndo = () => {
    const key = insight.key;
    setDismissFailed(false);
    pendingKey.current = key;
    setPhase('undo');
    undoTimer.current = setTimeout(() => {
      pendingKey.current = null;
      setPhase('dismissed');
      sendDismiss(key).catch(() => { if (mounted.current) { setPhase('visible'); setDismissFailed(true); } });
    }, UNDO_WINDOW_MILLISECONDS);
  };

  return <aside aria-label={text.insights.title}
    className="flex items-start gap-3 rounded-[12px] border border-primary-border bg-surface-panel py-3 pl-[15px] pr-2">
    <span aria-hidden="true" className="mt-[3px] h-[15px] w-[15px] shrink-0 rounded-[5px] bg-[image:var(--primary-gradient)]" />
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[14px] gap-y-[2px]">
      <p className="min-w-0 flex-[1_1_100%] text-[13px] leading-[1.5] text-foreground-secondary sm:flex-[1_1_360px]">
        <strong className="font-semibold text-foreground">{insight.title}.</strong> {insight.description}
      </p>
      {insight.evidence.slice(0, 1).map((record) => <Link key={`${record.kind}:${record.id}`}
        href={`/dashboard/${record.kind === 'incoming' ? 'incoming' : 'invoices'}/${encodeURIComponent(record.id)}`}
        className="inline-flex min-h-11 items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary whitespace-nowrap max-w-full">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 flex-none"><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" /><path d="M13.5 3.5V8H18" /></svg>
        {text.insights.evidence}: <span className="truncate">{record.title}</span>
      </Link>)}
      {dismissFailed && <p role="alert" className="basis-full text-xs text-error-ink">{text.insights.unavailable}</p>}
    </div>
    <button type="button" aria-label={text.insights.hideLabel} title={text.insights.hideLabel} onClick={startUndo}
      className="inline-grid size-11 shrink-0 place-items-center rounded-control text-muted transition hover:bg-surface-raised hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  </aside>;
}
