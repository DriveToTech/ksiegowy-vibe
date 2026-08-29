import Link from 'next/link';
import { getHouseholdAccounts } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { Button } from '../../../../../components/atoms/Button';
import { EmptyState } from '../../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { NewCommitmentForm } from './NewCommitmentForm';

export default async function NewCommitmentPage() {
  const session = await requireAuthSession('/household/commitments/new');
  const householdId = session.activeHouseholdId as string;

  const accounts = await getHouseholdAccounts(householdId);

  if (accounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.commitmentForm.newPageEyebrow} title={t.household.commitmentForm.newPageTitle} />
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
      <PageHeader eyebrow={t.household.commitmentForm.newPageEyebrow} title={t.household.commitmentForm.newPageTitle} />
      <NewCommitmentForm householdId={householdId} accounts={accounts} />
    </div>
  );
}
