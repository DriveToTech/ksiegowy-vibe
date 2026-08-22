import type { ReactNode } from 'react';
import Link from 'next/link';
import { getIncomingInvoices, getInvoices } from '../../lib/api';
import type { AuthSession } from '../../lib/auth';
import { t } from '../../lib/translations';
import { AppHeader } from './AppHeader';
import { DashboardNavigation } from './DashboardNavigation';

const navigationItems = [
  { href: '/dashboard', label: t.nav.overview, mobileLabel: 'Start', icon: 'overview' as const },
  { href: '/dashboard/invoices', label: t.nav.outgoingInvoices, mobileLabel: 'Sprzedaż', icon: 'outgoing' as const },
  { href: '/dashboard/incoming', label: t.nav.incomingInvoices, mobileLabel: 'Zakupy', icon: 'incoming' as const },
  { href: '/dashboard/contractors', label: t.nav.contractors, mobileLabel: t.nav.contractors, icon: 'contractors' as const },
  { href: '/dashboard/compliance', label: t.nav.compliance, mobileLabel: t.nav.compliance, icon: 'contractors' as const },
  { href: '/dashboard/settings', label: t.nav.settings, mobileLabel: t.nav.settings, icon: 'settings' as const },
];

const INCOMING_NEEDS_ACTION_STATUSES = new Set(['UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED']);

interface DashboardShellProps {
  children: ReactNode;
  session: AuthSession;
}

/**
 * The JPK_V7M VAT register is due on the 25th of the month following the
 * reporting period — a fixed statutory rule, not company-specific data.
 */
function jpkDeadlineWidget(now: Date) {
  const currentPeriodDeadline = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 25));
  const nextDeadline = now.getTime() <= currentPeriodDeadline.getTime()
    ? currentPeriodDeadline
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 25));
  const previousDeadline = new Date(Date.UTC(nextDeadline.getUTCFullYear(), nextDeadline.getUTCMonth() - 1, 25));
  const reportedMonth = new Date(Date.UTC(nextDeadline.getUTCFullYear(), nextDeadline.getUTCMonth() - 1, 1));

  const daysLeft = Math.max(0, Math.ceil((nextDeadline.getTime() - now.getTime()) / 86_400_000));
  const cycleLength = nextDeadline.getTime() - previousDeadline.getTime();
  const elapsed = now.getTime() - previousDeadline.getTime();
  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsed / cycleLength) * 100)));

  return {
    monthLabel: reportedMonth.toLocaleDateString('pl-PL', { month: 'long', timeZone: 'UTC' }),
    daysLeft,
    progressPercent,
  };
}

export async function DashboardShell({ children, session }: DashboardShellProps) {
  const companyId = session.activeCompanyId;

  const [outgoingTotal, incomingNeedsAction, recentRejected] = companyId
    ? await Promise.all([
        getInvoices(companyId, { limit: '1' }).then((result) => result.total).catch(() => null),
        getIncomingInvoices(companyId, { limit: '100' })
          .then((result) => result.data.filter((invoice) => INCOMING_NEEDS_ACTION_STATUSES.has(invoice.status)).length)
          .catch(() => null),
        getInvoices(companyId, { limit: '50' })
          .then((result) => result.data.filter((invoice) => invoice.ksefStatus === 'rejected').length)
          .catch(() => null),
      ])
    : [null, null, null];

  const items = navigationItems.map((item) => {
    if (item.href === '/dashboard/invoices' && outgoingTotal !== null) {
      return { ...item, badge: String(outgoingTotal) };
    }
    if (item.href === '/dashboard/incoming' && incomingNeedsAction) {
      return { ...item, badge: `${incomingNeedsAction} nowe`, badgeTone: 'warning' as const };
    }
    return item;
  });

  const jpk = jpkDeadlineWidget(new Date());

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground lg:p-6">
      <div className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col lg:overflow-hidden lg:rounded-frame lg:border lg:border-outline lg:shadow-frame lg:bg-background">
        <AppHeader
          user={session.user}
          companies={session.companies}
          activeCompanyId={session.activeCompanyId}
          activeKsefEnvironment={session.activeKsefEnvironment}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[226px_1fr] lg:overflow-hidden">
          <aside className="hidden lg:flex lg:min-h-0 lg:flex-col lg:gap-[22px] lg:overflow-y-auto lg:border-r lg:border-outline lg:bg-chrome lg:p-[18px_14px]">
            <nav aria-label="Nawigacja dashboardu" className="flex flex-col gap-0.5">
              <DashboardNavigation items={items} />
            </nav>

            {companyId && recentRejected ? (
              <div className="flex flex-col gap-2 rounded-inset border border-outline bg-foreground/5 p-[14px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.dashboardRail.rejectedEyebrow}</p>
                <p className="text-xl font-semibold tracking-[-0.02em] text-foreground">{t.dashboardRail.rejectedCount(recentRejected)}</p>
                <p className="text-xs leading-[1.45] text-muted">{t.dashboardRail.rejectedDescription}</p>
                <Link href="/dashboard/invoices" className="pt-0.5 text-xs font-semibold text-primary">
                  {t.dashboardRail.rejectedLink}
                </Link>
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-[7px] rounded-inset border border-outline bg-foreground/5 p-[14px]">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.dashboardRail.jpkEyebrow(jpk.monthLabel)}</p>
              <p className="text-xl font-semibold tracking-[-0.02em] text-foreground">{t.dashboardRail.jpkDueIn(jpk.daysLeft)}</p>
              <div className="h-[3px] rounded-full bg-foreground/10">
                <div
                  className="h-full rounded-full bg-[image:var(--brand-gradient)]"
                  style={{ width: `${jpk.progressPercent}%` }}
                />
              </div>
            </div>
          </aside>

          <main id="dashboard-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-[22px_26px_26px] lg:pb-[26px]">
            {children}
          </main>
        </div>

        <div className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] px-4 lg:hidden">
          <nav
            aria-label="Mobilna nawigacja dashboardu"
            className="mx-auto grid max-w-xl grid-cols-5 gap-2 rounded-inset border border-outline bg-chrome p-2"
          >
            <DashboardNavigation items={navigationItems} mobile />
          </nav>
        </div>
      </div>
    </div>
  );
}
