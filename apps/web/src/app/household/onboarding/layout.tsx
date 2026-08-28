import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAuthSession } from '../../../lib/auth';
import { BrandImage } from '../../../components/brand/BrandImage';
import { OnboardingStepRail } from '../../../components/organisms/OnboardingStepRail';
import { t } from '../../../lib/translations';

export default async function HouseholdOnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireAuthSession('/household/onboarding');
  const household = session.households.find((item) => item.id === session.activeHouseholdId) ?? null;

  const steps = [
    { key: 'household', title: t.household.onboarding.householdStepTitle, hint: household?.name ?? '', path: '/household/onboarding/household', done: Boolean(household) },
    { key: 'accounts', title: t.household.onboarding.accountsStepTitle, hint: t.household.onboarding.accountsStepDescription, path: '/household/onboarding/accounts', done: false },
  ];

  return (
    <main className="flex min-h-full w-full items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="flex w-full max-w-[1280px] flex-col overflow-hidden rounded-frame border border-outline bg-background shadow-frame">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-outline bg-chrome px-[22px]">
          <Link href="/" className="inline-flex shrink-0">
            <BrandImage className="w-[132px]" priority />
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-muted">
            {household ? t.onboarding.settingUp(household.name) : t.onboarding.settingUpGeneric}
          </p>
          <Link href="/household" className="shrink-0 text-sm text-muted transition hover:text-foreground-secondary">
            {t.onboarding.saveAndFinishLater}
          </Link>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <aside className="flex flex-col gap-3 border-b border-outline p-6 lg:border-b-0 lg:border-r lg:p-[34px]">
            <OnboardingStepRail steps={steps} />
          </aside>
          <div className="flex flex-col gap-5 p-6 lg:p-[34px_44px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
