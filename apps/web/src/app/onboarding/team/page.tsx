import { redirect } from 'next/navigation';
import { getCompanyKsefSettings } from '../../../lib/api';
import { requireAuthSession } from '../../../lib/auth';
import { OnboardingInviteForm } from './OnboardingInviteForm';

export default async function OnboardingTeamPage() {
  const session = await requireAuthSession('/onboarding');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    redirect('/onboarding/company');
  }

  const hasKsefToken = await getCompanyKsefSettings(companyId)
    .then((settings) => settings.credentials.some((credential) => credential.hasToken))
    .catch(() => false);

  if (!hasKsefToken) {
    redirect('/onboarding/ksef');
  }

  return <OnboardingInviteForm companyId={companyId} />;
}
