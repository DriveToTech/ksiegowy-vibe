import { redirect } from 'next/navigation';
import { getCompanyKsefSettings } from '../../lib/api';
import { requireAuthSession } from '../../lib/auth';

export default async function OnboardingIndexPage() {
  const session = await requireAuthSession('/onboarding');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    redirect('/onboarding/company');
  }

  const hasKsefToken = await getCompanyKsefSettings(companyId)
    .then((settings) => settings.credentials.some((credential) => credential.hasToken))
    .catch(() => false);

  redirect(hasKsefToken ? '/dashboard' : '/onboarding/ksef');
}
