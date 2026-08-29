import { getHouseholdAccounts, getHouseholdGoal } from '../../../../../../lib/api';
import { getHouseholdGoalActionAvailability } from '../../../../../../lib/household-goal-availability';
import { requireAuthSession } from '../../../../../../lib/auth';
import { t } from '../../../../../../lib/translations';
import { ErrorState } from '../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../components/molecules/PageHeader';
import { GoalTransferForm } from '../../../../../../components/organisms/GoalTransferForm';

export default async function WithdrawFromHouseholdGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const session = await requireAuthSession(`/household/goals/${goalId}/withdraw`);
  const householdId = session.activeHouseholdId as string;
  const result = await Promise.all([
    getHouseholdGoal(householdId, goalId),
    getHouseholdAccounts(householdId),
  ]).catch(() => null);

  if (!result) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.transfer.withdrawTitle} />
        <ErrorState message="Nie udało się wczytać danych transferu." />
      </div>
    );
  }

  const [detail, accounts] = result;
  if (!getHouseholdGoalActionAvailability(detail.goal).canWithdraw) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={detail.goal.name} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.transfer.withdrawTitle} />
        <ErrorState title="Wypłata niedostępna" message={detail.goal.status === 'ARCHIVED' ? t.household.goals.actions.archived : t.household.goals.actions.withdrawUnavailable} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={detail.goal.name} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.transfer.withdrawTitle} description={t.household.goals.transfer.withdrawDescription} />
      <GoalTransferForm householdId={householdId} goal={detail.goal} accounts={accounts} direction="WITHDRAW" />
    </div>
  );
}
