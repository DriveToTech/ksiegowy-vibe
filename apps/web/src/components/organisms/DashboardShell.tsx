import type { ReactNode } from 'react';
import { t } from '../../lib/translations';
import { Surface } from '../atoms/Surface';
import { DashboardNavigation } from './DashboardNavigation';

const navigationItems = [
  { href: '/dashboard', label: t.nav.overview, mobileLabel: 'Start', icon: 'overview' as const },
  { href: '/dashboard/invoices', label: t.nav.outgoingInvoices, mobileLabel: 'Sprzedaż', icon: 'outgoing' as const },
  { href: '/dashboard/incoming', label: t.nav.incomingInvoices, mobileLabel: 'Zakupy', icon: 'incoming' as const },
  { href: '/dashboard/contractors', label: t.nav.contractors, mobileLabel: 'Firmy', icon: 'contractors' as const },
  { href: '/dashboard/settings', label: t.nav.settings, mobileLabel: 'Ustawienia', icon: 'settings' as const },
];

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-4 sm:px-6 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-8 lg:py-6">
        <aside className="hidden lg:block">
          <Surface tone="chrome" className="sticky top-24 p-4">
            <p className="px-3 pb-3 text-xs font-medium uppercase tracking-wider text-muted">Workspace</p>
            <nav aria-label="Nawigacja dashboardu" className="flex flex-col gap-1">
              <DashboardNavigation items={navigationItems} />
            </nav>
          </Surface>
        </aside>

        <main id="dashboard-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 space-y-8 overflow-y-auto pb-8 lg:flex-none lg:overflow-visible lg:pb-0">
          {children}
        </main>

        <div className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:hidden">
          <nav
            aria-label="Mobilna nawigacja dashboardu"
            className="mx-auto grid max-w-xl grid-cols-5 gap-2 rounded-full border border-outline bg-surface-panel p-2 backdrop-blur-[28px]"
          >
            <DashboardNavigation items={navigationItems} mobile />
          </nav>
        </div>
      </div>
    </div>
  );
}
