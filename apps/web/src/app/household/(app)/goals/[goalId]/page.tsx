import { getHouseholdAccounts, getHouseholdGoal, getHouseholdGoalsOverview } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { GoalDetailView } from '../../../../../components/organisms/GoalDetailView';

export default async function HouseholdGoalDetailPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const session = await requireAuthSession(`/household/goals/${goalId}`);
  const householdId = session.activeHouseholdId as string;
  const detail = await getHouseholdGoal(householdId, goalId);
  const [accounts, overview] = await Promise.all([
    getHouseholdAccounts(householdId).catch(() => []),
    getHouseholdGoalsOverview(householdId).catch(() => null),
  ]);
  const overviewItem = overview?.goals.find((item) => item.goal.id === goalId) ?? null;
  const account = accounts.find((item) => item.id === detail.goal.accountId) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.goals.detailBack} eyebrowHref="/household/goals" title={detail.goal.name} />
      {accounts.length === 0 ? <ErrorState message="Informacje o koncie celu są chwilowo niedostępne." /> : null}
      <GoalDetailView
        householdId={householdId}
        detail={detail}
        account={account}
        overviewItem={overviewItem}
        projectionAvailable={overview !== null}
      />
    </div>
  );
}
