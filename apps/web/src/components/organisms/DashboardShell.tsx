import type { ReactNode } from 'react';
import { t } from '../../lib/translations';
import type { Company } from '../../lib/api-types';
import { cn } from '../../lib/cn';
import type { KsefEnvironment } from '../../lib/ksef-environment';
import { CompanySwitcher } from '../CompanySwitcher';
import { KsefEnvironmentSwitcher } from '../KsefEnvironmentSwitcher';
import { Surface } from '../atoms/Surface';
import { BrandImage } from '../brand/BrandImage';
import { DashboardNavigation } from './DashboardNavigation';
import { SidebarQuickActions } from './SidebarQuickActions';

const navigationItems = [
  { href: '/dashboard', label: t.nav.overview, icon: 'overview' as const },
  { href: '/dashboard/invoices', label: t.nav.outgoingInvoices, icon: 'outgoing' as const },
  { href: '/dashboard/incoming', label: t.nav.incomingInvoices, icon: 'incoming' as const },
  { href: '/dashboard/contractors', label: t.nav.contractors, icon: 'contractors' as const },
  { href: '/dashboard/settings', label: t.nav.settings, icon: 'settings' as const },
];

interface DashboardShellProps {
  children: ReactNode;
  companies: Company[];
  activeCompanyId: string | null;
  activeKsefEnvironment: KsefEnvironment;
}

export function DashboardShell({ children, companies, activeCompanyId, activeKsefEnvironment }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-4 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:px-8 lg:py-6">
        <aside className="hidden lg:block">
          <Surface
            tone="glass"
            shape="organic"
            className="sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col overflow-hidden p-5"
          >
            <div className="space-y-2 px-3 pb-8 pt-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Workspace</p>
              <BrandImage alt="Księgowy Vibe logo" className="w-[178px]" />
              <p className="max-w-[14rem] text-sm text-muted">Nowoczesny pulpit księgowy dla faktur, OCR i KSeF.</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
              <nav aria-label="Nawigacja dashboardu" className="flex flex-col gap-1">
                <DashboardNavigation items={navigationItems} />
              </nav>
              <div className="space-y-4 pb-1">
                <SidebarQuickActions />
                <Surface tone="raised" shape="organic" className="space-y-4 p-4">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Aktywna firma</p>
                    <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} />
                  </div>

                  <div className="h-px bg-outline/10" />

                  <KsefEnvironmentSwitcher activeEnvironment={activeKsefEnvironment} />
                </Surface>
              </div>
            </div>
          </Surface>
        </aside>

        <div className="min-w-0 space-y-6 pb-28 lg:pb-0">
          <Surface tone="glass" shape="organic" className="px-4 py-4 lg:hidden">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Dashboard</p>
                  <BrandImage alt="Księgowy Vibe logo" className="w-[150px]" sizes="150px" />
                </div>
                <div className="min-w-[180px]">
                  <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} />
                </div>
              </div>

              <KsefEnvironmentSwitcher activeEnvironment={activeKsefEnvironment} compact />
            </div>
          </Surface>

          <div className={cn('min-w-0 space-y-8 pt-2 lg:pl-4 xl:pl-10')}>{children}</div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-4 lg:hidden">
        <nav
          aria-label="Mobilna nawigacja dashboardu"
          className="mx-auto grid max-w-xl grid-cols-5 gap-2 rounded-full border border-outline/15 bg-surface-panel/55 p-2 backdrop-blur-[28px]"
        >
          <DashboardNavigation items={navigationItems} mobile />
        </nav>
      </div>
    </div>
  );
}
