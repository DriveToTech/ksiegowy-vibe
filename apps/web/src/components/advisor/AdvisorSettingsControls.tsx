import type { ReactNode, Ref } from 'react';
import { cn } from '../../lib/cn';

// Native checkbox stays on top (transparent) for pointer, keyboard and test targeting; the sibling span draws the box.
export function AdvisorCheckbox({ checked, disabled, onChange, children, className, inputReference }: {
  checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: ReactNode; className?: string; inputReference?: Ref<HTMLInputElement>;
}) {
  return <label className={cn('inline-flex min-h-11 cursor-pointer items-center gap-2 text-[13px] has-[:disabled]:cursor-not-allowed has-[:disabled]:text-foreground-disabled', className)}>
    <span className="relative size-[18px] shrink-0">
      <input ref={inputReference} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="peer absolute inset-0 m-0 size-full cursor-[inherit] opacity-0" />
      <span aria-hidden="true" className="pointer-events-none grid size-full place-items-center rounded-[5px] border border-outline-control bg-surface-raised text-primary-ink transition peer-checked:border-primary peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:opacity-50 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.2 2.2L9.5 3.8" /></svg>
      </span>
    </span>
    <span>{children}</span>
  </label>;
}

export function AdvisorSwitch({ checked, disabled, label, stateLabel, onChange }: {
  checked: boolean; disabled?: boolean; label: string; stateLabel: string; onChange: (checked: boolean) => void;
}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
    className="inline-flex min-h-11 shrink-0 items-center gap-2.5 text-[12.5px] text-foreground-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60">
    {stateLabel}
    <span aria-hidden="true" className={cn('relative h-6 w-10 rounded-full border transition', checked ? 'border-primary bg-primary' : 'border-outline-control bg-outline-strong')}>
      <span className={cn('absolute top-0.5 size-[18px] rounded-full shadow-sm transition-all', checked ? 'left-[18px] bg-white' : 'left-0.5 bg-surface-panel')} />
    </span>
  </button>;
}

const noteTones = { warning: 'border-l-warning-ink', primary: 'border-l-primary', success: 'border-l-success-ink', error: 'border-l-error-ink' } as const;

// Inset note with a 3px tone edge, used for action blockers and recovery hints.
export function AdvisorNote({ tone = 'warning', className, children, ...props }: { tone?: keyof typeof noteTones; className?: string; children: ReactNode; id?: string; role?: 'status' | 'alert' }) {
  return <div {...props} className={cn('rounded-inset border-l-[3px] bg-surface-raised px-3 py-2.5 text-[12.5px] leading-normal text-foreground-secondary [&_strong]:font-semibold [&_strong]:text-foreground', noteTones[tone], className)}>{children}</div>;
}
