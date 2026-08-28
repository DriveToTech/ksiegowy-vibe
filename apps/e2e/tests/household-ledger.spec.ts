import type { Locator, Page, Response } from '@playwright/test';
import { test, expect } from './fixtures/auth';

// Covers the Phase 1 household ledger journey from the plan's Testing Plan section:
// create household -> account -> transaction with a category -> see it reflected in
// envelope progress on the dashboard -> add a commitment -> see it in upcoming payments,
// including one transfer between two accounts excluded from envelope/income sums.
//
// NOTE on scope gaps found while building this: apps/web/src/app/household/(app)/envelopes
// only ever reads GET .../envelopes — there is no "add budget envelope" form anywhere in
// the Phase 1 frontend, so a monthlyLimit can't be configured through the UI. The mock API
// (apps/e2e/mock-api/server.js) pre-seeds one Groceries envelope per household to still
// exercise "a categorized transaction updates envelope progress", standing in for a limit a
// real user would have set up earlier — this is a mock-only accommodation, not a claim that
// the real backend auto-seeds envelopes (it doesn't; see household.service.ts's createHousehold).
// Separately, there is no UI to create a transfer either (createTransfer/POST .../transfers
// exists only in apps/api's household routes) — the transfer step below is seeded with a
// direct API call instead of a UI action, exactly as a user's bank-import or a future transfer
// form would produce it, and the ledger/dashboard assertions that follow are real UI checks.
//
// A further, unrelated gap surfaced while writing selectors: FormField (components/molecules/
// FormField.tsx) renders a visible <label> but never wires htmlFor/id to its control, so
// getByLabel() cannot resolve any household form field except AccountPicker (which sets its
// own aria-label). The tests below fall back to CSS label-adjacency selectors for those fields
// and to getByPlaceholder() where a placeholder happens to exist — worth a real fix in
// FormField so these forms are screen-reader accessible, not just a test-selector workaround.

function fieldByLabel(scope: Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}") + input, label:has-text("${labelText}") + select`);
}

function cardByHeading(page: Page, headingName: string): Locator {
  return page.getByRole('heading', { name: headingName, exact: true }).locator('xpath=..');
}

// StatCard renders its label as a plain <p>, not a heading, and the same label text (e.g.
// "Wpływy") also appears in the InOutChart legend below it — matched here as a literal <p>
// to land on the stat card specifically.
function statCard(page: Page, label: string): Locator {
  return page.locator(`p:text-is("${label}")`).locator('xpath=..');
}

function waitForApiResponse(page: Page, method: string, matchesPathname: (pathname: string) => boolean): Promise<Response> {
  return page.waitForResponse(
    (response) => response.request().method() === method && matchesPathname(new URL(response.url()).pathname),
  );
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

test('create household -> account -> categorized transaction -> envelope + upcoming commitment on dashboard, with a transfer excluded from sums', async ({ onboardingPage: page }) => {
  // 1. Create the household.
  await page.goto('/household/onboarding/household');
  await page.getByRole('textbox').fill('Dom testowy');

  const createHouseholdResponsePromise = waitForApiResponse(page, 'POST', (pathname) => pathname === '/households');
  await page.getByRole('button', { name: 'Dalej' }).click();
  const createHouseholdResponse = await createHouseholdResponsePromise;
  const apiBase = new URL(createHouseholdResponse.url()).origin;
  const householdId = (await createHouseholdResponse.json()).id as string;

  await expect(page).toHaveURL(/\/household\/onboarding\/accounts$/);

  // 2. Add two accounts (a transfer later needs both).
  const createAccount1ResponsePromise = waitForApiResponse(page, 'POST', (pathname) => pathname === `/households/${householdId}/accounts`);
  await fieldByLabel(page.locator('form'), 'Nazwa konta').fill('Konto wspólne');
  await page.getByPlaceholder('0,00').fill('1000');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  const account1 = await (await createAccount1ResponsePromise).json();
  await expect(page.getByText('Konto wspólne', { exact: true })).toBeVisible();

  const createAccount2ResponsePromise = waitForApiResponse(page, 'POST', (pathname) => pathname === `/households/${householdId}/accounts`);
  await fieldByLabel(page.locator('form'), 'Nazwa konta').fill('Konto oszczędnościowe');
  await page.getByPlaceholder('0,00').fill('200');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  const account2 = await (await createAccount2ResponsePromise).json();
  await expect(page.getByText('Konto oszczędnościowe', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Przejdź do pulpitu' }).click();
  await expect(page).toHaveURL(/\/household$/);
  await expect(page.getByRole('heading', { name: 'Start', level: 1 })).toBeVisible();

  // 3. Add a categorized expense against the first account.
  await page.getByRole('link', { name: 'Dodaj płatność' }).click();
  await expect(page).toHaveURL(/\/household\/ledger\/new$/);
  const transactionForm = page.locator('form');

  await page.getByPlaceholder('Odbiorca / płatnik').fill('Biedronka');
  await page.getByPlaceholder('0,00').fill('120.50');
  await fieldByLabel(transactionForm, 'Kategoria').selectOption({ label: 'Groceries' });
  await transactionForm.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page).toHaveURL(/\/household\/ledger$/);
  const ledgerTable = page.getByRole('table');
  await expect(ledgerTable.getByRole('link', { name: 'Biedronka' })).toBeVisible();
  await expect(ledgerTable.getByText('Groceries')).toBeVisible();

  // 4. Add a commitment. Two "Dodaj zobowiązanie" links render with no commitments yet (the
  // page header action and the empty state's own action) — .first() picks either, both go
  // to the same place.
  await page.goto('/household/commitments');
  await page.getByRole('link', { name: 'Dodaj zobowiązanie' }).first().click();
  await expect(page).toHaveURL(/\/household\/commitments\/new$/);
  const commitmentForm = page.locator('form');

  await fieldByLabel(commitmentForm, 'Nazwa').fill('Ubezpieczenie domu');
  await page.getByPlaceholder('0,00').fill('89.99');
  await commitmentForm.getByRole('button', { name: 'Zapisz' }).click();

  await expect(page).toHaveURL(/\/household\/commitments$/);
  const commitmentsTable = page.getByRole('table');
  await expect(commitmentsTable.getByRole('link', { name: 'Ubezpieczenie domu' })).toBeVisible();

  // 5. Transfer between the two accounts — no UI exists for this (see the note at the top of
  // this file), so it's seeded with the same request contract a future transfer form would use.
  const cookies = await page.context().cookies();
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const transferResponse = await page.request.post(`${apiBase}/households/${householdId}/transfers`, {
    headers: { cookie: cookieHeader },
    data: { fromAccountId: account1.id, toAccountId: account2.id, amount: '300.00', date: todayIso() },
  });
  expect(transferResponse.ok()).toBe(true);

  // The transfer's two legs still show up in the ledger as real movements of money...
  await page.goto('/household/ledger');
  await expect(page.getByRole('table').getByRole('link', { name: 'Przelew między kontami' })).toHaveCount(2);

  // ...but are excluded from income/spend sums and envelope spend on the dashboard.
  await page.goto('/household');
  await expect(statCard(page, 'Wpływy')).toContainText('0,00');
  await expect(statCard(page, 'Wydatki')).toContainText('120,50');

  const envelopeCard = cardByHeading(page, 'Koperty budżetowe');
  await expect(envelopeCard.getByText('Groceries')).toBeVisible();
  await expect(envelopeCard).toContainText('120,50');
  await expect(envelopeCard).toContainText('600,00');

  const upcomingCard = cardByHeading(page, 'Nadchodzące płatności');
  await expect(upcomingCard).toContainText('Ubezpieczenie domu');
  await expect(upcomingCard).toContainText('89,99');
});

test.describe('private account visibility', () => {
  test('a PRIVATE account is omitted, not redacted, from another household member\'s accounts view', async ({ authenticatedHouseholdOwnerPage: ownerPage, authenticatedHouseholdMemberPage: memberPage }) => {
    // Scoped to the page's <main> landmark: HouseholdShell's sidebar independently lists the
    // same account names, so an unscoped getByText would resolve to two elements.
    // The visibility <select> in AccountForm (further down the same page) also has a
    // "Prywatne" option, so the badge is matched as a literal <span>, not by text alone.
    const ownerContent = ownerPage.getByRole('main');
    await ownerPage.goto('/household/settings/accounts');
    await expect(ownerContent.getByText('Konto wspólne')).toBeVisible();
    await expect(ownerContent.getByText('Oszczędności własne')).toBeVisible();
    await expect(ownerContent.locator('span:text-is("Prywatne")')).toBeVisible();

    const memberContent = memberPage.getByRole('main');
    await memberPage.goto('/household/settings/accounts');
    await expect(memberContent.getByText('Konto wspólne')).toBeVisible();
    await expect(memberContent.getByText('Oszczędności własne')).toHaveCount(0);
    await expect(memberContent.locator('span:text-is("Prywatne")')).toHaveCount(0);
  });
});
