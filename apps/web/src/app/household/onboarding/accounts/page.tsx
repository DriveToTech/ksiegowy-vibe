import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHouseholdAccounts } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { accountBadge, formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import { Button } from '../../../../components/atoms/Button';
import { AccountForm } from '../../(app)/settings/accounts/AccountForm';

export default async function HouseholdOnboardingAccountsPage() {
  const session = await requireAuthSession('/household/onboarding/accounts');

  if (!session.activeHouseholdId) {
    redirect('/household/onboarding/household');
  }

  const accounts = await getHouseholdAccounts(session.activeHouseholdId);

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{t.household.onboarding.accountsStepTitle}</h1>
        <p className="text-sm text-muted">{t.household.onboarding.accountsStepDescription}</p>
      </div>

      {accounts.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
          {accounts.map((account, index) => {
            const badge = accountBadge(account);
            return (
              <div key={account.id} className={index > 0 ? 'flex items-center justify-between gap-3 border-t border-outline px-4 py-3' : 'flex items-center justify-between gap-3 px-4 py-3'}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{account.name}</span>
                  <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-chip px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] ${badge.toneClass}`}>{badge.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-sm text-muted">{formatMoney(account.balance)}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <AccountForm householdId={session.activeHouseholdId} />

      <Link href="/household">
        <Button variant={accounts.length > 0 ? 'primary' : 'secondary'}>{t.household.onboarding.finish}</Button>
      </Link>
    </div>
  );
}
