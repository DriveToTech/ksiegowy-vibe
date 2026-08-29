import { getHouseholdAccounts, getHouseholdGoal } from '../../../../../../lib/api';
import { getHouseholdGoalActionAvailability } from '../../../../../../lib/household-goal-availability';
import { requireAuthSession } from '../../../../../../lib/auth';
import { t } from '../../../../../../lib/translations';
import { ErrorState } from '../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../components/molecules/PageHeader';
import { GoalTransferForm } from '../../../../../../components/organisms/GoalTransferForm';

export default async function AddToHouseholdGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const session = await requireAuthSession(`/household/goals/${goalId}/add`);
  const householdId = session.activeHouseholdId as string;
  const result = await Promise.all([
    getHouseholdGoal(householdId, goalId),
    getHouseholdAccounts(householdId),
  ]).catch(() => null);

  if (!result) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.transfer.addTitle} />
        <ErrorState message="Nie udało się wczytać danych transferu." />
      </div>
    );
  }

  const [detail, accounts] = result;
  if (!getHouseholdGoalActionAvailability(detail.goal).canAdd) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={detail.goal.name} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.transfer.addTitle} />
        <ErrorState title="Wpłata niedostępna" message={detail.goal.status === 'ARCHIVED' ? t.household.goals.actions.archived : t.household.goals.actions.completedAddUnavailable} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={detail.goal.name} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.transfer.addTitle} description={t.household.goals.transfer.addDescription} />
      <GoalTransferForm householdId={householdId} goal={detail.goal} accounts={accounts} direction="ADD" />
    </div>
  );
}
