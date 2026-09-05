'use client';

import { usePathname } from 'next/navigation';
import { cn } from '../../lib/cn';
import { t } from '../../lib/translations';

type OnboardingStep = 'account' | 'company' | 'ksef' | 'team';

const STEP_ORDER: OnboardingStep[] = ['account', 'company', 'ksef', 'team'];

const STEP_PATHS: Record<Exclude<OnboardingStep, 'account'>, string> = {
  company: '/onboarding/company',
  ksef: '/onboarding/ksef',
  team: '/onboarding/team',
};

interface OnboardingStepRailProps {
  completed: Set<'company' | 'ksef'>;
}

export function OnboardingStepRail({ completed }: OnboardingStepRailProps) {
  const pathname = usePathname();
  const currentStep = (Object.keys(STEP_PATHS) as Array<keyof typeof STEP_PATHS>).find((step) =>
    pathname.startsWith(STEP_PATHS[step]),
  );

  return (
    <div className="flex h-full flex-col gap-3">
      {STEP_ORDER.map((step, index) => {
        const isDone = step === 'account' ? true : step === 'team' ? false : completed.has(step);
        const isActive = !isDone && step === currentStep;

        return (
          <div
            key={step}
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
                isDone ? 'bg-success/20 text-success-ink' : isActive ? 'bg-primary/20 text-primary' : 'bg-foreground/8 text-muted',
              )}
            >
              {isDone ? '✓' : index + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-foreground">{t.onboarding.steps[step].title}</span>
              <span className="text-xs text-muted">{t.onboarding.steps[step].hint}</span>
            </span>
          </div>
        );
      })}

      <div className="mt-auto rounded-inset border-l-[3px] border-warning-ink bg-surface-raised p-[14px_16px] text-xs leading-relaxed text-foreground-secondary">
        {t.onboarding.ksefReminder}
      </div>
    </div>
  );
}
