import { getHouseholdAccounts, getHouseholdGoal, getHouseholdGoalAutomationRules } from '../../../../../../lib/api';
import { requireAuthSession } from '../../../../../../lib/auth';
import { t } from '../../../../../../lib/translations';
import { Banner } from '../../../../../../components/molecules/Banner';
import { ErrorState } from '../../../../../../components/molecules/ErrorState';
import { PageHeader } from '../../../../../../components/molecules/PageHeader';
import { GoalAutomationRules } from '../../../../../../components/organisms/GoalAutomationRules';

export default async function HouseholdGoalRulesPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const session = await requireAuthSession(`/household/goals/${goalId}/rules`);
  const householdId = session.activeHouseholdId as string;
  const detail = await getHouseholdGoal(householdId, goalId);
  const [accounts, rules] = await Promise.all([
    getHouseholdAccounts(householdId).catch(() => []),
    getHouseholdGoalAutomationRules(householdId, goalId).catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={detail.goal.name} eyebrowHref={`/household/goals/${goalId}`} title={t.household.goals.rules.pageTitle} description={t.household.goals.rules.pageDescription} />
      {accounts.length === 0 ? <ErrorState message="Nie udało się wczytać dostępnych kont dla reguł." /> : null}
      {rules === null ? (
        <ErrorState message="Reguły automatyzacji są chwilowo niedostępne." />
      ) : (
        <>
          {detail.goal.status === 'PAUSED' ? <Banner tone="warning" role="status">{t.household.goals.rules.pausedNotice}</Banner> : null}
          <GoalAutomationRules householdId={householdId} goal={detail.goal} accounts={accounts} rules={rules} readOnly={detail.goal.status === 'ARCHIVED' || detail.goal.status === 'COMPLETED'} readOnlyReason={detail.goal.status === 'COMPLETED' ? 'COMPLETED' : 'ARCHIVED'} />
        </>
      )}
    </div>
  );
}
