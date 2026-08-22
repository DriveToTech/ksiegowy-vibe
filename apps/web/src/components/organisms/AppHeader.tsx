'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Company } from '../../lib/api-types';
import type { AuthenticatedUser } from '../../lib/auth';
import type { KsefEnvironment } from '../../lib/ksef-environment';
import { t } from '../../lib/translations';
import { BrandImage } from '../brand/BrandImage';
import { CompanySwitcher } from '../CompanySwitcher';
import { KsefEnvironmentSwitcher } from '../KsefEnvironmentSwitcher';
import { SessionActions } from './SessionActions';
import { ThemeSwitcher } from './ThemeSwitcher';

interface AppHeaderProps {
  user: AuthenticatedUser | null;
  companies: Company[];
  activeCompanyId: string | null;
  activeKsefEnvironment: KsefEnvironment;
}

export function AppHeader({ user, companies, activeCompanyId, activeKsefEnvironment }: AppHeaderProps) {
  const headerReference = useRef<HTMLElement>(null);

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

  return (
    <header ref={headerReference} data-sticky-header className="sticky top-0 z-40 border-b border-outline bg-chrome">
      <div className="app-header-content gap-x-3 gap-y-2 px-4 py-3 sm:px-6 lg:h-[60px] lg:gap-4 lg:px-[22px] lg:py-0">
        <div data-app-header-brand className="min-w-0 space-y-1 lg:shrink-0 lg:border-r lg:border-outline lg:pr-4 lg:py-0">
          <Link href="/" className="inline-flex">
            <BrandImage alt="Księgowy Vibe logo" className="w-[156px] sm:w-[172px] lg:w-[132px]" priority />
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-muted lg:hidden">{t.header.subtitle}</p>
        </div>
        {user ? (
          <div className="contents lg:flex lg:min-w-0 lg:flex-1 lg:items-center lg:gap-4">
            <div data-app-header-company className="min-w-0 lg:max-w-64 lg:shrink">
              <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} compact />
            </div>
            <div data-app-header-ksef className="min-w-0">
              <KsefEnvironmentSwitcher activeEnvironment={activeKsefEnvironment} compact />
            </div>
            <div className="hidden min-w-0 flex-1 lg:flex">
              <div className="flex h-9 w-full max-w-[300px] items-center justify-between rounded-control border border-outline bg-foreground/5 px-3 text-sm text-muted">
                <span className="truncate">{t.header.searchPlaceholder}</span>
                <span className="font-mono text-[11px] text-muted">⌘K</span>
              </div>
            </div>
            <div data-app-header-theme-session className="flex min-w-0 items-center justify-end gap-2 lg:ml-auto">
              <ThemeSwitcher />
              <div className="hidden min-w-0 text-right sm:block">
                <p className="max-w-40 truncate text-sm font-semibold text-foreground">{user.name ?? user.email}</p>
                <p className="max-w-40 truncate text-xs text-muted">{user.email}</p>
              </div>
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  className="h-10 w-10 shrink-0 rounded-control border border-outline object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-outline bg-surface-raised text-sm font-semibold text-foreground">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </div>
              )}
              <SessionActions />
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
