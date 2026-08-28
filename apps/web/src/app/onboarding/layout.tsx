import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCompanyKsefSettings } from '../../lib/api';
import { requireAuthSession } from '../../lib/auth';
import { BrandImage } from '../../components/brand/BrandImage';
import { OnboardingStepRail } from '../../components/organisms/OnboardingStepRail';
import { t } from '../../lib/translations';

export default async function OnboardingLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireAuthSession('/onboarding');
  const companyId = session.activeCompanyId;
  const company = companyId ? (session.companies.find((item) => item.id === companyId) ?? null) : null;

  const hasKsefToken = companyId
    ? await getCompanyKsefSettings(companyId)
        .then((settings) => settings.credentials.some((credential) => credential.hasToken))
        .catch(() => false)
    : false;

  // Reverse guard: a user who already has a company and a working KSeF credential
  // is done — step 4 (invite) is optional, so this is the completion signal.
  if (company && hasKsefToken) {
    redirect('/dashboard');
  }

  const steps = [
    { key: 'account', title: t.onboarding.steps.account.title, hint: t.onboarding.steps.account.hint, path: '/onboarding/account', done: true },
    { key: 'company', title: t.onboarding.steps.company.title, hint: t.onboarding.steps.company.hint, path: '/onboarding/company', done: Boolean(company) },
    { key: 'ksef', title: t.onboarding.steps.ksef.title, hint: t.onboarding.steps.ksef.hint, path: '/onboarding/ksef', done: hasKsefToken },
    { key: 'team', title: t.onboarding.steps.team.title, hint: t.onboarding.steps.team.hint, path: '/onboarding/team', done: false },
  ];

  return (
    <main className="flex min-h-full w-full items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="flex w-full max-w-[1280px] flex-col overflow-hidden rounded-frame border border-outline bg-background shadow-frame">
        <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-outline bg-chrome px-[22px]">
          <Link href="/" className="inline-flex shrink-0">
            <BrandImage className="w-[132px]" priority />
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-sm text-muted">
            {company ? t.onboarding.settingUp(company.name) : t.onboarding.settingUpGeneric}
          </p>
          <Link href="/dashboard" className="shrink-0 text-sm text-muted transition hover:text-foreground-secondary">
            {t.onboarding.saveAndFinishLater}
          </Link>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[300px_1fr]">
          <aside className="flex flex-col gap-3 border-b border-outline p-6 lg:border-b-0 lg:border-r lg:p-[34px]">
            <OnboardingStepRail steps={steps} footer={t.onboarding.ksefReminder} />
          </aside>
          <div className="flex flex-col gap-5 p-6 lg:p-[34px_44px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
