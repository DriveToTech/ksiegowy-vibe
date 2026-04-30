'use client';

import { useRouter } from 'next/navigation';
import { cn } from '../lib/cn';
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
  TEST: 'border-success/30 bg-success/15 text-success-ink',
  PRODUCTION: 'border-warning/40 bg-warning/15 text-warning-ink',
};

export function KsefEnvironmentSwitcher({ activeEnvironment, compact = false }: KsefEnvironmentSwitcherProps) {
  const router = useRouter();

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    document.cookie = `${ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME}=${event.target.value}; path=/; max-age=${KSEF_ENVIRONMENT_COOKIE_MAX_AGE}; SameSite=Lax`;
    router.refresh();
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div className={compact ? 'flex items-center justify-between gap-3' : 'space-y-2'}>
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">KSeF context</p>
        <span
          className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.14em]',
            environmentToneClasses[activeEnvironment],
          )}
        >
          {activeEnvironment}
        </span>
      </div>

      <Select
        value={activeEnvironment}
        onChange={handleChange}
        aria-label="Wybierz aktywne środowisko KSeF"
        className="max-w-full"
      >
        <option value="TEST">TEST</option>
        <option value="PRODUCTION">PRODUCTION</option>
      </Select>
    </div>
  );
}
