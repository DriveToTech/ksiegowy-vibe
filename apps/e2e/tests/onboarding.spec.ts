import { test, expect } from './fixtures/auth';

// Covers the Phase 4 first-run onboarding wizard: a signed-in user with no company is
// redirected from /dashboard to /onboarding and walks through company -> ksef -> team as
// separate top-level routes (no dashboard shell, no client wizard state — each step commits
// to the API on its own submit).
//
// "An existing user with a company is NOT redirected to /onboarding" is already covered by
// dashboard.spec.ts's `dashboard loads with the KSeF clearance KPI grid` test (it asserts the
// dashboard heading renders for `authenticatedPage`, which only holds if no redirect fired) —
// intentionally not duplicated here.

test('new user with no company is guided through company, ksef, and team steps to an active dashboard', async ({ onboardingPage: page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/onboarding\/company$/);
  await expect(page.getByRole('heading', { name: 'Skonfiguruj firmę' })).toBeVisible();
  // Next dev can finish the RSC navigation before the client form has hydrated; a reload gives
  // the form a stable client boundary before interaction without relying on network idle.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Skonfiguruj firmę' })).toBeVisible();

  // Step 1 — company details, via the NIP lookup that reuses CompanyDetailsForm.
  await page.getByLabel('NIP').fill('');
  await page.getByLabel('NIP').pressSequentially('1122334455');
  await expect(page.getByRole('button', { name: 'Pobierz dane po NIP' })).toBeEnabled();
  await page.getByRole('button', { name: 'Pobierz dane po NIP' }).click();
  await expect(page.getByText('Dane firmy zostały pobrane z rejestru po NIP')).toBeVisible();
  await expect(page.getByLabel('Nazwa firmy')).toHaveValue('Registry Demo Company 1122334455');

  await page.getByRole('button', { name: 'Utwórz firmę' }).click();

  // Company creation triggers a full-page navigation through /api/session/refresh to pick up
  // a fresh auth cookie before landing here. Regression guard for the JWT-staleness bug: the
  // ksef-settings fetch that backs this step runs server-side (React Server Component), so it
  // isn't visible to Playwright's page-level network capture — the observable symptom is this
  // step rendering its error banner instead of the credential form. If refresh is skipped or
  // broken, the browser still carries the pre-creation JWT, the company-scoped fetch 403s, and
  // the assertions below (error banner absent, credential field present and fillable) fail.
  await expect(page).toHaveURL(/\/onboarding\/ksef$/);
  await expect(page.getByRole('heading', { name: 'Integracja KSeF' })).toBeVisible();
  await expect(page.getByText('Nie udało się pobrać ustawień KSeF')).toHaveCount(0);
  // The KSeF form is another client boundary reached through a full-page session refresh.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Integracja KSeF' })).toBeVisible();

  // Step 2 — ksef: saving a working credential doubles as "Continue" (no separate nav control).
  await page.getByLabel('Token API KSeF (TEST)').fill('mock-ksef-token');
  const credentialResponse = page.waitForResponse((response) =>
    response.request().method() === 'PUT' && response.url().endsWith('/ksef-credentials/TEST'),
  );
  await page.getByRole('button', { name: 'Zapisz token TEST' }).click();
  await credentialResponse;
  await expect(page).toHaveURL(/\/onboarding\/team$/);

  // Step 3 — team: optional invite. No email is actually sent — the UI must surface a
  // copyable invite link instead.
  await expect(page.getByRole('heading', { name: 'Zaproś księgowego' })).toBeVisible();
  await page.getByLabel('Adres e-mail *').fill('bookkeeper@example.test');
  await page.getByRole('button', { name: 'Wyślij zaproszenie' }).click();
  await expect(page.getByText('Zaproszenie utworzone')).toBeVisible();
  await expect(page.getByText(/\/invite\/invite-token-/)).toBeVisible();

  await page.getByRole('link', { name: 'Zakończ i przejdź do panelu' }).click();

  // Landed on a fully active dashboard for the just-created company.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Panel operacyjny' })).toBeVisible();
  await expect(page.getByRole('banner').getByText('Registry Demo Company 1122334455', { exact: true })).toBeVisible();
});

test('"Save and finish later" returns to the dashboard once a company has been created', async ({ onboardingPage: page }) => {
  await page.goto('/onboarding/company');

  await page.getByLabel('Nazwa firmy').fill('Deferred Demo Ledger LLC');
  await page.getByLabel('NIP').fill('9988776655');
  await page.getByLabel('Adres *', { exact: true }).fill('5 Placeholder Avenue, Demo City, TEST-0003');
  await page.getByRole('button', { name: 'Utwórz firmę' }).click();

  await expect(page).toHaveURL(/\/onboarding\/ksef$/);

  // The link is present at every step, not just company — abandoning after step 2 (a company
  // with no KSeF credential yet) is a legitimate steady state, not an error to recover from.
  await page.getByRole('link', { name: 'Zapisz i dokończ później' }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Panel operacyjny' })).toBeVisible();
});
