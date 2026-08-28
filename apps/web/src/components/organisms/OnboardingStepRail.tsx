'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/cn';

export interface OnboardingRailStep {
  key: string;
  title: string;
  hint: string;
  path: string;
  done: boolean;
}

interface OnboardingStepRailProps {
  steps: OnboardingRailStep[];
  footer?: ReactNode;
}

/**
 * Parameterized in place (not forked) so both the company wizard and the new
 * household wizard can render their own step list through the same rail —
 * see the plan's note on reusing OnboardingStepRail. `footer` replaces the
 * previously hardcoded KSeF reminder, which is company-specific.
 */
export function OnboardingStepRail({ steps, footer }: OnboardingStepRailProps) {
  const pathname = usePathname();
  const currentStep = steps.find((step) => pathname.startsWith(step.path));

  return (
    <div className="flex h-full flex-col gap-3">
      {steps.map((step, index) => {
        const isActive = !step.done && step.key === currentStep?.key;

        return (
          <div
            key={step.key}
            className={cn(
              'flex items-start gap-3 rounded-inset border p-[14px_16px]',
              isActive
                ? 'border-[var(--nav-active-border)] bg-[image:var(--nav-active)]'
                : 'border-outline bg-surface-panel',
            )}
          >
            <span
              className={cn(
                'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] font-mono text-[11px]',
                step.done ? 'bg-success/20 text-success-ink' : isActive ? 'bg-primary/20 text-primary' : 'bg-foreground/8 text-muted',
              )}
            >
              {step.done ? '✓' : index + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-foreground">{step.title}</span>
              <span className="text-xs text-muted">{step.hint}</span>
            </span>
          </div>
        );
      })}

      {footer ? (
        <div className="mt-auto rounded-inset border-l-[3px] border-warning-ink bg-surface-raised p-[14px_16px] text-xs leading-relaxed text-foreground-secondary">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
