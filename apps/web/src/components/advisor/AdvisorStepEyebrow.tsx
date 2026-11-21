// Decorative step number tile; hidden from assistive technology so heading and legend names stay unchanged.
export function AdvisorStepEyebrow({ step }: { step: 1 | 2 | 3 | 4 }) {
  return <i aria-hidden="true" className="mr-2.5 inline-grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-primary-soft font-mono text-[11px] font-medium not-italic text-primary">{step}</i>;
}
