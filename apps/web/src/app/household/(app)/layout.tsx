import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { HouseholdShell } from '../../../components/organisms/HouseholdShell';
import { requireAuthSession } from '../../../lib/auth';

export default async function HouseholdLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const session = await requireAuthSession('/household');

  // Straight to the household wizard, not the generic /onboarding choice
  // screen: arriving at /household already states the user's intent (they
  // may well have a company too, e.g. via ModeSwitch) — see the equivalent
  // fix on the business side in app/dashboard/page.tsx.
  if (!session.activeHouseholdId) {
    redirect('/household/onboarding/household');
  }

  return (
    <HouseholdShell session={session} householdId={session.activeHouseholdId}>
      {children}
    </HouseholdShell>
  );
}
