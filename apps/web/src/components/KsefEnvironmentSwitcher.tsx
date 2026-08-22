'use client';

import { useRouter } from 'next/navigation';
import { cn } from '../lib/cn';
import { t } from '../lib/translations';
import {
  ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME,
  KSEF_ENVIRONMENT_COOKIE_MAX_AGE,
  type KsefEnvironment,
} from '../lib/ksef-environment';
import { Select } from './atoms/Select';

interface KsefEnvironmentSwitcherProps {
  activeEnvironment: KsefEnvironment;
  compact?: boolean;
}

const environmentToneClasses: Record<KsefEnvironment, string> = {
  TEST: 'border-success bg-success text-success-ink',
  PRODUCTION: 'border-warning bg-warning text-warning-ink',
};

export function KsefEnvironmentSwitcher({ activeEnvironment, compact = false }: KsefEnvironmentSwitcherProps) {
  const router = useRouter();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    document.cookie = `${ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME}=${event.target.value}; path=/; max-age=${KSEF_ENVIRONMENT_COOKIE_MAX_AGE}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className={compact ? 'flex min-w-0 items-center gap-2' : 'space-y-3'}>
      <div className={compact ? 'contents' : 'space-y-2'}>
        <p className={compact ? 'sr-only' : 'text-xs font-medium uppercase tracking-[0.16em] text-muted'}>
          {t.header.ksefContext}
        </p>
        <span
          className={cn(
            'inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[10px] font-semibold tracking-[0.08em] sm:px-3 sm:text-xs sm:tracking-[0.14em]',
            environmentToneClasses[activeEnvironment],
          )}
        >
          {activeEnvironment}
        </span>
      </div>

      <Select
        value={activeEnvironment}
        onChange={handleChange}
        aria-label={t.ksefEnvironmentSwitcher.selectEnvironment}
        className={compact ? 'min-w-0 w-[6.25rem] sm:w-32' : 'max-w-full'}
      >
        <option value="TEST">TEST</option>
        <option value="PRODUCTION">PRODUCTION</option>
      </Select>
    </div>
  );
}
