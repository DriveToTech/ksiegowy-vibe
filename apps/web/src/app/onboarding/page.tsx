import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../lib/auth';
import { t } from '../../lib/translations';
import { Button } from '../../components/atoms/Button';

export default async function OnboardingIndexPage() {
  const session = await requireAuthSession('/onboarding');

  // The layout already redirects a fully-done company user (company + KSeF
  // credential) to /dashboard, so this only needs to route the two
  // in-progress-company states plus the household-only state.
  if (session.activeCompanyId) {
    redirect('/onboarding/ksef');
  }
  if (session.activeHouseholdId) {
    redirect('/household');
  }

  // Neither exists yet — this is the first-run entrypoint the plan calls for:
  // let the user pick a side rather than forcing the company wizard on
  // someone who only ever wants household budgeting.
  return (
    <div className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{t.householdOnboardingChoice.pageEyebrow}</p>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{t.householdOnboardingChoice.pageTitle}</h1>
        <p className="text-sm text-muted">{t.householdOnboardingChoice.pageDescription}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="text-base font-semibold text-foreground">{t.householdOnboardingChoice.companyTitle}</h2>
          <p className="flex-1 text-sm text-muted">{t.householdOnboardingChoice.companyDescription}</p>
          <Link href="/onboarding/company">
            <Button className="w-full">{t.householdOnboardingChoice.companyAction}</Button>
          </Link>
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="text-base font-semibold text-foreground">{t.householdOnboardingChoice.householdTitle}</h2>
          <p className="flex-1 text-sm text-muted">{t.householdOnboardingChoice.householdDescription}</p>
          <Link href="/household/onboarding/household">
            <Button className="w-full">{t.householdOnboardingChoice.householdAction}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
