import { getHouseholdAccounts } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { Button } from '../../../../../components/atoms/Button';
import { EmptyState } from '../../../../../components/molecules/EmptyState';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { GoalForm } from '../../../../../components/organisms/GoalForm';

export default async function NewHouseholdGoalPage() {
  const session = await requireAuthSession('/household/goals/new');
  const householdId = session.activeHouseholdId as string;
  const accounts = await getHouseholdAccounts(householdId).catch(() => null);

  if (!accounts) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.newPageTitle} />
        <ErrorState message="Nie udało się wczytać dostępnych kont." />
      </div>
    );
  }

  const eligibleAccounts = accounts.filter((account) => account.type !== 'CREDIT_CARD');
  if (eligibleAccounts.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.newPageTitle} />
        <EmptyState
          title={t.household.goals.accountUnavailable}
          description={t.household.goals.accountVisibilityHint}
           action={<Button href="/household/settings/accounts">{t.household.settings.accountsPageTitle}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.newPageTitle} description={t.household.goals.formDescription} />
      <GoalForm householdId={householdId} accounts={accounts} />
    </div>
  );
}
