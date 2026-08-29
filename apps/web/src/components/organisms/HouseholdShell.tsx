import type { ReactNode } from 'react';
import Link from 'next/link';
import { HouseholdSwitcher } from '../HouseholdSwitcher';
import { ModeSwitch } from '../ModeSwitch';
import { getHouseholdAccounts } from '../../lib/api';
import type { AuthSession } from '../../lib/auth';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { AppHeader } from './AppHeader';
import { DashboardNavigation } from './DashboardNavigation';
import { AppIcon } from '../icons/AppIcon';

const navigationItems = [
  { href: '/household', label: t.householdNav.home, mobileLabel: t.householdNav.home, icon: 'householdHome' as const },
  { href: '/household/ledger', label: t.householdNav.ledger, mobileLabel: t.householdNav.ledger, icon: 'householdLedger' as const },
  { href: '/household/envelopes', label: t.householdNav.budget, mobileLabel: t.householdNav.budget, icon: 'householdBudget' as const },
  { href: '/household/commitments', label: t.householdNav.commitments, mobileLabel: t.householdNav.commitments, icon: 'householdCommitments' as const },
  { href: '/household/goals', label: t.householdNav.goals, mobileLabel: t.householdNav.goals, icon: 'householdGoals' as const },
  { href: '/household/settings/accounts', label: t.householdNav.settings, mobileLabel: t.householdNav.settings, icon: 'settings' as const },
];

const mobileNavigationItems = [
  navigationItems[0],
  navigationItems[1],
  navigationItems[4],
  { href: '/household/more', label: t.householdNav.more, mobileLabel: t.householdNav.more, icon: 'householdMore' as const },
];

interface HouseholdShellProps {
  children: ReactNode;
  session: AuthSession;
  householdId: string;
}

/**
 * Fork of DashboardShell, not a mode-flag inside it: DashboardShell fires
 * business-only fetches (invoice/JPK badges) unconditionally, and the
 * mobile nav shape differs (see the plan's Frontend Structure section).
 */
export async function HouseholdShell({ children, session, householdId }: HouseholdShellProps) {
  const accounts = await getHouseholdAccounts(householdId);
  const totalBalance = accounts.reduce((sum, account) => sum + (parseFloat(account.balance) || 0), 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground lg:p-6">
      <div className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 flex-col lg:overflow-hidden lg:rounded-frame lg:border lg:border-outline lg:shadow-frame lg:bg-background">
        <AppHeader
          user={session.user}
          switcher={<HouseholdSwitcher households={session.households} activeHouseholdId={session.activeHouseholdId} compact />}
          modeSwitch={<ModeSwitch activeMode={session.activeMode} />}
          searchPlaceholder={t.household.searchPlaceholder}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[226px_1fr] lg:overflow-hidden">
          <aside className="hidden lg:flex lg:min-h-0 lg:flex-col lg:gap-[22px] lg:overflow-y-auto lg:border-r lg:border-outline lg:bg-chrome lg:p-[18px_14px]">
            <nav aria-label="Nawigacja gospodarstwa domowego" className="flex flex-col gap-0.5">
              <DashboardNavigation items={navigationItems} rootHref="/household" />
            </nav>

            {accounts.length > 0 ? (
              <div className="mt-auto flex flex-col gap-2 rounded-inset border border-outline bg-foreground/5 p-[14px]">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.dashboard.accountsTitle}</p>
                {accounts.map((account) => (
                  <div key={account.id} className="flex justify-between text-[12.5px]">
                    <span className="truncate text-foreground-secondary">{account.name}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney(account.balance)}</span>
                  </div>
                ))}
                <div className="h-px bg-outline" />
                <div className="flex justify-between text-[13px] font-semibold">
                  <span>{t.household.dashboard.totalLabel}</span>
                  <span className="tabular-nums">{formatMoney(totalBalance)}</span>
                </div>
              </div>
            ) : null}
          </aside>

          <main id="household-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 pb-24 sm:p-6 lg:p-[22px_26px_26px] lg:pb-[26px]">
            {children}
          </main>
        </div>

        <div className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom))] px-4 lg:hidden">
          <nav
            aria-label="Mobilna nawigacja gospodarstwa domowego"
            className="mx-auto grid max-w-xl grid-cols-5 gap-px rounded-inset border border-outline bg-chrome p-2"
          >
            <DashboardNavigation items={mobileNavigationItems.slice(0, 2)} rootHref="/household" mobile />
            <Link
              href="/household/ledger/new"
              aria-label={t.household.ledger.addPayment}
              className="flex min-h-16 min-w-[44px] flex-col items-center justify-center gap-1 rounded-inset bg-primary px-1 py-2 text-center text-[10px] font-semibold leading-tight text-primary-ink transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-ink/15">
                <AppIcon name="add" className="h-4 w-4 shrink-0" />
              </span>
              <span className="w-full truncate">{t.household.ledger.addPayment}</span>
            </Link>
            <DashboardNavigation items={mobileNavigationItems.slice(2)} rootHref="/household" mobile />
          </nav>
        </div>
      </div>
    </div>
  );
}
