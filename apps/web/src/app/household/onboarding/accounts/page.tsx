import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getHouseholdAccounts } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import { Button } from '../../../../components/atoms/Button';
import { AccountForm } from '../../(app)/settings/accounts/AccountForm';

export default async function HouseholdOnboardingAccountsPage() {
  const session = await requireAuthSession('/household/onboarding/accounts');

  if (!session.activeHouseholdId) {
    redirect('/household/onboarding/household');
  }

  const accounts = await getHouseholdAccounts(session.activeHouseholdId).catch(() => []);

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{t.household.onboarding.accountsStepTitle}</h1>
        <p className="text-sm text-muted">{t.household.onboarding.accountsStepDescription}</p>
      </div>

      {accounts.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
          {accounts.map((account, index) => (
            <div key={account.id} className={index > 0 ? 'flex items-center justify-between border-t border-outline px-4 py-3' : 'flex items-center justify-between px-4 py-3'}>
              <span className="text-sm font-medium text-foreground">{account.name}</span>
              <span className="tabular-nums text-sm text-muted">{formatMoney(account.balance)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <AccountForm householdId={session.activeHouseholdId} />

      <Link href="/household">
        <Button variant="secondary">{t.household.onboarding.finish}</Button>
      </Link>
    </div>
  );
}
