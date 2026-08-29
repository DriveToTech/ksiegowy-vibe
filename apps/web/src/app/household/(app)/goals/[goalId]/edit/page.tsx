import { getHouseholdAccounts, getHouseholdGoal } from '../../../../../../lib/api';
import { requireAuthSession } from '../../../../../../lib/auth';
import { t } from '../../../../../../lib/translations';
import { ErrorState } from '../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../components/molecules/PageHeader';
import { GoalForm } from '../../../../../../components/organisms/GoalForm';

export default async function EditHouseholdGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const session = await requireAuthSession(`/household/goals/${goalId}/edit`);
  const householdId = session.activeHouseholdId as string;
  const result = await Promise.all([
    getHouseholdGoal(householdId, goalId),
    getHouseholdAccounts(householdId),
  ]).catch(() => null);

  if (!result) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.pageTitle} title={t.household.goals.editPageTitle} />
        <ErrorState message="Nie udało się wczytać celu do edycji." />
      </div>
    );
  }

  const [detail, accounts] = result;
  if (detail.goal.status === 'ARCHIVED') {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow={t.household.goals.detailBack} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.editPageTitle} />
        <ErrorState message="Archiwalny cel jest tylko do odczytu." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.goals.detailBack} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.editPageTitle} description={t.household.goals.formDescription} />
      <GoalForm householdId={householdId} accounts={accounts} goal={detail.goal} movementCount={detail.movements.length} />
    </div>
  );
}
