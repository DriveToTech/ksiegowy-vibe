'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../../lib/cn';
import { t } from '../../lib/translations';
import { AppIcon } from '../icons/AppIcon';

const quickActions = [
  {
    href: '/dashboard/invoices/new',
    title: t.dashboard.quickActions.newInvoiceTitle,
    description: t.dashboard.quickActions.newInvoiceDescription,
    icon: 'outgoing' as const,
  },
  {
    href: '/dashboard/incoming',
    title: t.dashboard.quickActions.incomingInvoiceTitle,
    description: t.dashboard.quickActions.incomingInvoiceDescription,
    icon: 'incoming' as const,
  },
];

export function SidebarQuickActions() {
  const pathname = usePathname();
  const isOverviewPage = pathname === '/dashboard';

  return (
    <details open={isOverviewPage} className="rounded-[2rem_1.25rem_2.25rem_1.5rem] bg-surface-raised/45 backdrop-blur-xl">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[2rem_1.25rem_2.25rem_1.5rem] px-4 py-3 text-left [&::-webkit-details-marker]:hidden">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{t.dashboard.quickActions.title}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">{t.dashboard.quickActions.subtitle}</p>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-muted"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="grid gap-2 px-3 pb-3 pt-1">
        {quickActions.map((action) => {
          const isActive = pathname === action.href || pathname.startsWith(`${action.href}/`);

          return (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                'rounded-[1.5rem] px-4 py-3 transition',
                isActive
                  ? 'bg-gradient-to-r from-primary via-primary-strong to-cyan-300 text-primary-ink shadow-[var(--shadow-aura)]'
                  : 'bg-surface-panel/45 text-foreground hover:bg-surface-panel/70',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    isActive ? 'bg-primary-ink/10' : 'bg-surface-raised/70 text-primary-strong',
                  )}
                >
                  <AppIcon name={action.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{action.title}</span>
                  <span className={cn('mt-1 block text-xs', isActive ? 'text-primary-ink/80' : 'text-muted')}>
                    {action.description}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}

        <Link
          href="/dashboard/settings"
          className="flex items-center justify-between rounded-[1.5rem] px-4 py-3 text-sm font-medium text-muted transition hover:bg-surface-panel/45 hover:text-foreground"
        >
          <span>{t.dashboard.quickActions.manageCompanySettings}</span>
          <AppIcon name="settings" className="h-4 w-4 shrink-0" />
        </Link>
      </div>
    </details>
  );
}
