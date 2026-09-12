'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Company } from '../../lib/api-types';
import type { AuthenticatedUser } from '../../lib/auth';
import type { KsefEnvironment } from '../../lib/ksef-environment';
import { t } from '../../lib/translations';
import { BrandImage } from '../brand/BrandImage';
import { CompanySwitcher } from '../CompanySwitcher';
import { KsefEnvironmentBadge } from '../KsefEnvironmentBadge';
import { SessionActions } from './SessionActions';
import { ThemeSwitcher } from './ThemeSwitcher';

interface AppHeaderProps {
  user: AuthenticatedUser | null;
  companies: Company[];
  activeCompanyId: string | null;
  activeKsefEnvironment: KsefEnvironment | null;
}

export function AppHeader({ user, companies, activeCompanyId, activeKsefEnvironment }: AppHeaderProps) {
  const headerReference = useRef<HTMLElement>(null);
  const profileMenuReference = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const header = headerReference.current;
    if (!header) return;

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    };

    updateHeaderHeight();
    const resizeObserver = new ResizeObserver(updateHeaderHeight);
    resizeObserver.observe(header);

    return () => {
      resizeObserver.disconnect();
      document.documentElement.style.removeProperty('--app-header-height');
    };
  }, []);

  useEffect(() => {
    const closeProfileMenu = (event: PointerEvent) => {
      const profileMenu = profileMenuReference.current;
      if (profileMenu && event.target instanceof Node && !profileMenu.contains(event.target)) {
        profileMenu.open = false;
      }
    };

    document.addEventListener('pointerdown', closeProfileMenu);
    return () => document.removeEventListener('pointerdown', closeProfileMenu);
  }, []);

  return (
    <header ref={headerReference} data-sticky-header className="sticky top-0 z-40 border-b border-outline bg-chrome">
      <div className="app-header-content gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[60px] lg:gap-[18px] lg:px-[22px] lg:py-0">
        <div data-app-header-brand className="min-w-0 space-y-1 lg:flex lg:shrink-0 lg:items-center lg:gap-[10px] lg:space-y-0 lg:border-r lg:border-outline lg:pr-[18px] lg:py-0">
          <Link href="/" className="inline-flex min-h-11 items-center">
            <BrandImage alt="Księgowy Vibe logo" className="w-[156px] max-[374px]:w-[112px] sm:w-[172px] lg:w-[132px]" priority />
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-muted lg:hidden">{t.header.subtitle}</p>
        </div>
        {user ? (
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:items-center lg:gap-[18px]">
            <div data-app-header-company className="min-w-0 lg:max-w-64 lg:shrink">
              <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} compact />
            </div>
            {activeKsefEnvironment ? (
              <div data-app-header-ksef className="min-w-0">
                <KsefEnvironmentBadge environment={activeKsefEnvironment} />
              </div>
            ) : null}
            <div className="hidden min-w-0 flex-1 lg:flex">
              <div className="flex h-[34px] w-full max-w-[300px] items-center justify-between rounded-control border border-outline bg-secondary-surface px-3 text-[13px] text-muted">
                <span className="truncate">{t.header.searchPlaceholder}</span>
                <span className="font-mono text-[11px] text-muted">⌘K</span>
              </div>
            </div>
            <div data-app-header-theme-session className="flex min-w-0 items-center justify-end gap-2 max-[374px]:gap-1 lg:ml-auto lg:gap-3">
              <ThemeSwitcher />
              <details ref={profileMenuReference} className="relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-control px-2 transition hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&::-webkit-details-marker]:hidden">
                  <span className="hidden min-w-0 text-right leading-[1.3] sm:block">
                    <span className="block max-w-40 truncate text-[13px] font-medium text-foreground">{user.name ?? user.email}</span>
                    <span className="block max-w-40 truncate text-[11px] text-muted">{user.email}</span>
                  </span>
                  {user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-control border border-outline object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control border border-outline bg-surface-raised text-sm font-semibold text-foreground">
                      {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </summary>
                <div className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-56 rounded-card border border-outline bg-surface-panel p-2 shadow-frame">
                  <div className="border-b border-outline px-3 py-2">
                    <p className="truncate text-sm font-medium text-foreground">{user.name ?? user.email}</p>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                  </div>
                  <Link href="/dashboard/settings" className="flex min-h-11 items-center rounded-control px-3 text-sm text-muted hover:bg-surface-raised hover:text-foreground">Ustawienia</Link>
                  <SessionActions />
                </div>
              </details>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
