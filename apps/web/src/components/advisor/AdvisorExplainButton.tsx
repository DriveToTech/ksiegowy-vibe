'use client';

import { advisorText as text } from '../../lib/advisor-translations';
import { advisorMark, useAdvisorWorkspace, type AdvisorShowRequest } from './AdvisorWorkspace';

/** Opens the advisor seeded with the current document or contractor. Pauses (aria-disabled, not disabled) only while an answer is in flight. */
export function AdvisorExplainButton({ seed }: { seed: AdvisorShowRequest }) {
  const advisor = useAdvisorWorkspace();
  if (!advisor) return null;
  const busy = advisor.requestInFlight;
  return <span className="inline-flex flex-col items-start gap-1">
    <button type="button" aria-label={text.explain} aria-expanded={advisor.open} aria-controls="advisor-panel" aria-disabled={busy || undefined}
      aria-describedby={busy ? 'advisor-explain-busy' : undefined}
      onClick={() => { if (!busy) advisor.show({ question: text.explainQuestion, ...seed }); }}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border px-3.5 text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${busy ? 'cursor-not-allowed border-button-disabled-border bg-button-disabled text-foreground-disabled' : 'border-[var(--nav-active-border)] bg-primary-soft text-foreground'}`}>
      {advisorMark(busy ? 'size-[13px] rounded-[4px] opacity-45' : 'size-[13px] rounded-[4px]')}
      <span>{text.explain}</span>
    </button>
    {busy && <span id="advisor-explain-busy" className="max-w-[320px] text-xs text-muted">{text.explainButton.busyReason}</span>}
  </span>;
}
