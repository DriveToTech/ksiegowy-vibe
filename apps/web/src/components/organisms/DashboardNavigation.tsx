'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/cn';
import { AppIcon } from '../icons/AppIcon';

interface NavigationItem {
  href: string;
  label: string;
  mobileLabel?: string;
  icon: 'overview' | 'outgoing' | 'incoming' | 'contractors' | 'settings';
  badge?: string;
  badgeTone?: 'muted' | 'warning';
}

interface DashboardNavigationProps {
  items: NavigationItem[];
  mobile?: boolean;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/dashboard') {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavigation({ items, mobile = false }: DashboardNavigationProps) {
  const pathname = usePathname();

  return (
    <>
      {items.map((item) => {
        const isActive = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={mobile ? item.label : undefined}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              mobile
                ? 'min-h-16 min-w-0 rounded-inset px-1 py-3 text-center text-[10px] font-medium leading-tight transition'
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
                <span className={mobile ? 'w-full whitespace-nowrap' : 'truncate'}>{mobile ? item.mobileLabel ?? item.label : item.label}</span>
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
    </>
  );
}
