import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/phase3-translations';
import { PageHeader } from '../../../../../components/molecules/PageHeader';
import { InvestmentPositionForm } from '../../../../../components/organisms/InvestmentPositionForm';

export default async function NewHouseholdInvestmentPage() {
  const session = await requireAuthSession('/household/investing/new');
  const householdId = session.activeHouseholdId as string;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.investing.pageTitle} title={t.household.investing.newPageTitle} description={t.household.investing.formDescription} />
      <InvestmentPositionForm householdId={householdId} />
    </div>
  );
}
