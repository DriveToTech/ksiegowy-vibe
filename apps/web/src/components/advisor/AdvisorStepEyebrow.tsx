import { advisorText as text } from '../../lib/advisor-translations';

// Decorative step counter; hidden from assistive technology so heading and legend names stay unchanged.
export function AdvisorStepEyebrow({ step }: { step: 1 | 2 | 3 }) {
  return <span aria-hidden="true" className="mb-1 block font-mono text-[10px] font-normal uppercase tracking-[0.08em] text-muted">{text.stepLabel(step)}</span>;
}
