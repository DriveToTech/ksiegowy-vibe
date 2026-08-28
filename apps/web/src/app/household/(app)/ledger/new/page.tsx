import Link from 'next/link';
import { getHouseholdAccounts, getHouseholdCategories, getHouseholdEnvelopes, getHouseholdMembers } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { Button } from '../../../../../components/atoms/Button';
import { EmptyState } from '../../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { TransactionForm } from '../../../../../components/organisms/TransactionForm';

export default async function NewHouseholdTransactionPage() {
  const session = await requireAuthSession('/household/ledger/new');
  const householdId = session.activeHouseholdId as string;

  const [accounts, categories, members, envelopes] = await Promise.all([
    getHouseholdAccounts(householdId).catch(() => []),
    getHouseholdCategories(householdId).catch(() => []),
    getHouseholdMembers(householdId).catch(() => []),
    getHouseholdEnvelopes(householdId).catch(() => []),
  ]);

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.transactionForm.newPageEyebrow} title={t.household.transactionForm.newPageTitle} />
        <EmptyState
          title={t.household.dashboard.accountsTitle}
          description={t.household.onboarding.accountsStepDescription}
          action={
            <Link href="/household/settings/accounts">
              <Button>{t.household.onboarding.accountsStepTitle}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.transactionForm.newPageEyebrow} title={t.household.transactionForm.newPageTitle} />
      <TransactionForm householdId={householdId} accounts={accounts} categories={categories} members={members} envelopes={envelopes} />
    </div>
  );
}
