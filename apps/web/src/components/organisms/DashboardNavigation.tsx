'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/cn';
import { AppIcon } from '../icons/AppIcon';

interface NavigationItem {
  href: string;
  label: string;
  icon: 'overview' | 'outgoing' | 'incoming' | 'contractors' | 'settings';
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
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              mobile
                ? 'min-h-16 rounded-full px-3 py-3 text-center text-[11px] font-medium transition'
                : 'rounded-xl px-4 py-3 text-sm font-medium transition',
              isActive
                ? 'rounded-full bg-gradient-to-r from-primary via-primary-strong to-cyan-300 text-primary-ink shadow-[var(--shadow-aura)]'
                : mobile
                  ? 'rounded-full bg-surface-raised/55 text-muted backdrop-blur-xl hover:text-foreground'
                  : 'text-muted hover:bg-surface-raised/55 hover:text-foreground',
            )}
          >
            <span className={cn('flex items-center gap-3', mobile ? 'flex-col justify-center gap-1' : '')}>
              <AppIcon name={item.icon} className={mobile ? 'h-4 w-4' : 'h-4 w-4'} />
              <span>{item.label}</span>
            </span>
          </Link>
        );
      })}
    </>
  );
}
