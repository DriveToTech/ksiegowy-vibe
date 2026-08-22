import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../../lib/auth';
import { CompanyDetailsForm } from '../../dashboard/settings/CompanyDetailsForm';

export default async function OnboardingCompanyPage() {
  const session = await requireAuthSession('/onboarding');

  if (session.activeCompanyId) {
    redirect('/onboarding/ksef');
  }

  return <CompanyDetailsForm company={null} canEdit redirectTo="/onboarding/ksef" />;
}
