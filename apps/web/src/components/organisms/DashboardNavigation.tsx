'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { t } from '../../lib/translations';
import { NativeDialog } from '../atoms/NativeDialog';
import { AppIcon } from '../icons/AppIcon';

interface NavigationItem {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: 'overview' | 'outgoing' | 'incoming' | 'contractors' | 'compliance' | 'settings' | 'more';
  badge?: string;
  badgeTone?: 'muted' | 'warning';
}

interface DashboardNavigationProps {
  items: NavigationItem[];
  mobile?: boolean;
  moreItems?: NavigationItem[];
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavigation({ items, mobile = false, moreItems = [] }: DashboardNavigationProps) {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isMoreActive = moreItems.some((item) => isActivePath(pathname, item.href));

  return (
    <>
      {items.map((item) => {
        const isActive = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={mobile ? item.mobileLabel ?? item.label : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              mobile
                ? 'min-h-11 min-w-0 rounded-inset px-1 py-3 text-center text-[10px] font-medium leading-tight transition'
                : 'min-h-11 rounded-control border border-transparent px-4 py-2 text-sm font-medium transition',
              isActive
                ? 'bg-[image:var(--nav-active)] border-[var(--nav-active-border)] text-foreground'
                : mobile
                  ? 'bg-surface-raised text-muted hover:text-foreground-secondary'
                  : 'text-muted hover:bg-foreground/5 hover:text-foreground-secondary',
            )}
          >
            <span className={cn('flex min-w-0 items-center gap-3', mobile ? 'flex-col justify-center gap-1' : 'justify-between')}>
              <span className="flex min-w-0 items-center gap-3">
                <AppIcon name={item.icon} className="h-4 w-4 shrink-0" />
                <span className={mobile ? 'sr-only' : 'truncate'}>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
              </span>
              {!mobile && item.badge ? (
                <span className={cn('font-mono text-[11px]', item.badgeTone === 'warning' ? 'text-warning-ink' : 'text-muted')}>
                  {item.badge}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
      {mobile && moreItems.length > 0 ? (
        <>
          <button
            type="button"
            aria-label={t.nav.more}
            aria-controls="dashboard-more-sheet"
            aria-expanded={isMoreOpen}
            aria-current={isMoreActive ? 'page' : undefined}
            onClick={() => setIsMoreOpen(true)}
            className={cn(
              'min-h-11 min-w-0 rounded-inset px-1 py-3 text-center text-[10px] font-medium leading-tight transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              isMoreActive
                ? 'border border-[var(--nav-active-border)] bg-[image:var(--nav-active)] text-foreground'
                : 'bg-surface-raised text-muted hover:text-foreground-secondary',
            )}
          >
            <span className="flex min-w-0 flex-col items-center justify-center gap-1">
              <AppIcon name="more" className="h-4 w-4 shrink-0" />
              <span className="sr-only">{t.nav.more}</span>
            </span>
          </button>

          <NativeDialog
            id="dashboard-more-sheet"
            open={isMoreOpen}
            onClose={() => setIsMoreOpen(false)}
            title={t.nav.more}
            bottomSheet
            className="m-0 mt-auto max-h-[80dvh] w-full max-w-none rounded-b-none"
          >
            <nav aria-label={t.nav.more} className="grid gap-2">
              {moreItems.map((item) => {
                const isActive = isActivePath(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => setIsMoreOpen(false)}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-control border px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                      isActive
                        ? 'border-[var(--nav-active-border)] bg-[image:var(--nav-active)] text-foreground'
                        : 'border-transparent text-muted hover:bg-foreground/5 hover:text-foreground-secondary',
                    )}
                  >
                    <AppIcon name={item.icon} className="h-5 w-5 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </NativeDialog>
        </>
      ) : null}
    </>
  );
}
