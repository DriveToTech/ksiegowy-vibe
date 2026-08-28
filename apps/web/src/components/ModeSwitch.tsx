'use client';

import { useRouter } from 'next/navigation';
import type { AppMode } from '../lib/mode';
import { t } from '../lib/translations';
import { cn } from '../lib/cn';

const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const MODE_TARGETS: Record<AppMode, string> = {
  business: '/dashboard',
  personal: '/household',
};

/**
 * A navigation action, not a live in-page toggle: it commits the choice to
 * the active_mode cookie and routes to the other side's root, whose own
 * layout resolves whether that side is even set up yet (onboarding redirect).
 */
function commitMode(mode: AppMode): void {
  document.cookie = `active_mode=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}

export function ModeSwitch({ activeMode }: { activeMode: AppMode }) {
  const router = useRouter();

  const switchTo = (mode: AppMode) => {
    if (mode === activeMode) return;
    commitMode(mode);
    router.push(MODE_TARGETS[mode]);
  };

  return (
    <div className="flex gap-0.5 rounded-control border border-outline bg-surface-raised p-0.5" role="tablist" aria-label={t.modeSwitch.label}>
      {(['business', 'personal'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={activeMode === mode}
          onClick={() => switchTo(mode)}
          className={cn(
            'min-h-8 rounded-[7px] px-3 text-[12.5px] font-medium transition',
            activeMode === mode
              ? 'bg-[image:var(--nav-active)] border border-[var(--nav-active-border)] font-semibold text-foreground'
              : 'border border-transparent text-muted hover:text-foreground-secondary',
          )}
        >
          {mode === 'business' ? t.modeSwitch.business : t.modeSwitch.personal}
        </button>
      ))}
    </div>
  );
}
