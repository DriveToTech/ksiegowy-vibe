import { test, expect } from './fixtures/auth';

// Covers the Phase 1 company-vs-household entrypoint choice at /onboarding: a signed-in
// user with neither a company nor a household picks a side, and the household path leads
// into the household onboarding wizard's first step. The company path (-> /onboarding/company)
// and the "no company at all" -> /onboarding/company auto-redirect from /dashboard are already
// covered by onboarding.spec.ts — intentionally not duplicated here.

test('a user with no company and no household sees the entrypoint choice at /onboarding', async ({ onboardingPage: page }) => {
  await page.goto('/onboarding');

  await expect(page.getByRole('heading', { name: 'Co chcesz skonfigurować najpierw?' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Rozpocznij konfigurację firmy' })).toHaveAttribute('href', '/onboarding/company');
  await expect(page.getByRole('link', { name: 'Rozpocznij konfigurację domu' })).toHaveAttribute('href', '/household/onboarding/household');
});

test('choosing the household path leads into the household onboarding wizard', async ({ onboardingPage: page }) => {
  await page.goto('/onboarding');

  await page.getByRole('link', { name: 'Rozpocznij konfigurację domu' }).click();

  await expect(page).toHaveURL(/\/household\/onboarding\/household$/);
  await expect(page.getByRole('heading', { name: 'Nazwij swoje gospodarstwo domowe' })).toBeVisible();
  // CreateHouseholdForm's Input isn't wired to its FormField label (no htmlFor/id — see the
  // note in household-ledger.spec.ts), so this targets the lone textbox on the page by role.
  await expect(page.getByRole('textbox')).toBeVisible();
});
