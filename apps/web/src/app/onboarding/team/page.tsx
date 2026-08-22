import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../../lib/auth';
import { OnboardingInviteForm } from './OnboardingInviteForm';

export default async function OnboardingTeamPage() {
  const session = await requireAuthSession('/onboarding');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    redirect('/onboarding/company');
  }

  return <OnboardingInviteForm companyId={companyId} />;
}
