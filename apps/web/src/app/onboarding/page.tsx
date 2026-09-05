import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../lib/auth';

export default async function OnboardingIndexPage() {
  const session = await requireAuthSession('/onboarding');

  // The layout already redirects a fully-done user (company + KSeF credential)
  // to /dashboard, so only two incomplete states remain here.
  redirect(session.activeCompanyId ? '/onboarding/ksef' : '/onboarding/company');
}
