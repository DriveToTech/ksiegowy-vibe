'use client';

import { cn } from '../lib/cn';
import type { KsefEnvironment } from '../lib/ksef-environment';

interface KsefEnvironmentBadgeProps {
  environment: KsefEnvironment;
}

const environmentToneClasses: Record<KsefEnvironment, string> = {
  TEST: 'border-warning-ink/30 bg-warning text-warning-ink',
  PRODUCTION: 'border-error-ink/30 bg-error text-error-ink',
};

const environmentDotClasses: Record<KsefEnvironment, string> = {
  TEST: 'bg-warning-ink',
  PRODUCTION: 'bg-error-ink',
};

export function KsefEnvironmentBadge({ environment }: KsefEnvironmentBadgeProps) {
  return (
    <span
      aria-label={`Środowisko KSeF: ${environment}`}
      className={cn(
        'inline-flex h-[26px] shrink-0 items-center gap-[7px] rounded-control border px-[11px] font-mono text-[11px] tracking-[0.1em]',
        environmentToneClasses[environment],
      )}
    >
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', environmentDotClasses[environment])} />
      {environment}
    </span>
  );
}
