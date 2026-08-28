import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../../../lib/auth';
import { t } from '../../../../lib/translations';
import { CreateHouseholdForm } from './CreateHouseholdForm';

export default async function HouseholdOnboardingStepPage() {
  const session = await requireAuthSession('/household/onboarding/household');

  if (session.activeHouseholdId) {
    redirect('/household/onboarding/accounts');
  }

  return (
    <div className="max-w-lg space-y-2">
      <h1 className="text-xl font-semibold text-foreground">{t.household.onboarding.householdStepTitle}</h1>
      <p className="text-sm text-muted">{t.household.onboarding.householdStepDescription}</p>
      <div className="pt-4">
        <CreateHouseholdForm />
      </div>
    </div>
  );
}
