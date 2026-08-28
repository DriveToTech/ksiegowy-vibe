import { test as base, type Page } from '@playwright/test';

// Must match apps/e2e/mock-api/server.js's TEST_HOUSEHOLD fixtures exactly.
export const HOUSEHOLD_OWNER_TOKEN = 'household-owner-token';
export const HOUSEHOLD_MEMBER_TOKEN = 'household-member-token';
export const TEST_HOUSEHOLD_ID = 'test-household-id';

async function setAuthCookies(page: Page, token: string, includeCompany: boolean) {
  await page.goto('/');

  await page.context().clearCookies();

  await page.evaluate(
    ({ authToken, hasActiveCompany }) => {
      document.cookie = `auth_token=${authToken}; path=/; SameSite=Lax`;

      if (hasActiveCompany) {
        document.cookie = 'active_company=test-company-id; path=/; SameSite=Lax';
        return;
      }

      document.cookie = 'active_company=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    },
    { authToken: token, hasActiveCompany: includeCompany },
  );
}

async function setHouseholdAuthCookies(page: Page, token: string, householdId: string) {
  await page.goto('/');
  await page.context().clearCookies();
  await page.evaluate(
    ({ authToken, activeHouseholdId }) => {
      document.cookie = `auth_token=${authToken}; path=/; SameSite=Lax`;
      document.cookie = `active_household=${activeHouseholdId}; path=/; SameSite=Lax`;
    },
    { authToken: token, activeHouseholdId: householdId },
  );
}

export const test = base.extend<{
  authenticatedPage: Page;
  authenticatedPageNoCompany: Page;
  onboardingPage: Page;
  authenticatedHouseholdOwnerPage: Page;
  authenticatedHouseholdMemberPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await setAuthCookies(page, 'test-token', true);
    await use(page);
  },
  authenticatedPageNoCompany: async ({ page }, use) => {
    await setAuthCookies(page, 'no-company-token', false);
    await use(page);
  },
  // Onboarding tests create a company (or household) against the mock API, which tracks
  // the new resource by auth token. A shared token would let parallel test runs see each
  // other's data, so each test gets its own token derived from the (unique) Playwright test id.
  onboardingPage: async ({ page }, use, testInfo) => {
    const uniqueToken = `no-company-token-${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '')}`;
    await setAuthCookies(page, uniqueToken, false);
    await use(page);
  },
  // Owner of the static TEST_HOUSEHOLD fixture — sees every SHARED account plus their own
  // PRIVATE ones. Static (not per-test unique) is safe here: these tests only read fixture
  // state, they don't mutate it, so parallel runs can't interfere with each other.
  //
  // Built on its own browser context (not the test's shared `page` fixture): a test that also
  // requests authenticatedHouseholdMemberPage needs a second, independently-cookied actor at
  // the same time — sharing one page/context would make the two fixtures overwrite the same
  // cookie jar.
  authenticatedHouseholdOwnerPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setHouseholdAuthCookies(page, HOUSEHOLD_OWNER_TOKEN, TEST_HOUSEHOLD_ID);
    await use(page);
    await context.close();
  },
  // A second member ("Anna") of the same static TEST_HOUSEHOLD — used to prove a PRIVATE
  // account owned by someone else is omitted from her view, not returned redacted.
  authenticatedHouseholdMemberPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await setHouseholdAuthCookies(page, HOUSEHOLD_MEMBER_TOKEN, TEST_HOUSEHOLD_ID);
    await use(page);
    await context.close();
  },
});

export { expect } from '@playwright/test';
