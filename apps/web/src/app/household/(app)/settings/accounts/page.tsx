import { getHouseholdAccounts } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { formatMoney } from '../../../../../lib/format';
import { t } from '../../../../../lib/translations';
import { Badge } from '../../../../../components/atoms/Badge';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { AccountForm } from './AccountForm';

export default async function HouseholdAccountsSettingsPage() {
  const session = await requireAuthSession('/household/settings/accounts');
  const householdId = session.activeHouseholdId as string;

  const accounts = await getHouseholdAccounts(householdId).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.dashboard.pageEyebrow} title={t.household.settings.accountsPageTitle} />

      {accounts.length > 0 ? (
        <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
          {accounts.map((account, index) => (
            <div key={account.id} className={index > 0 ? 'flex items-center justify-between border-t border-outline px-5 py-4' : 'flex items-center justify-between px-5 py-4'}>
              <div>
                <p className="font-medium text-foreground">{account.name}{account.accountNumberMask ? ` · ${account.accountNumberMask}` : ''}</p>
                <p className="text-sm text-muted">{t.household.accountPicker.typeLabels[account.type]}</p>
              </div>
              <div className="flex items-center gap-3">
                {account.visibility === 'PRIVATE' ? <Badge tone="warning">{t.household.accountPicker.visibilityLabels.PRIVATE}</Badge> : null}
                <p className="tabular-nums font-semibold text-foreground">{formatMoney(account.balance)}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <AccountForm householdId={householdId} />
    </div>
  );
}
