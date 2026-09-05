import { test as base, type Page } from '@playwright/test';

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

export const test = base.extend<{
  authenticatedPage: Page;
  authenticatedPageNoCompany: Page;
  onboardingPage: Page;
}>({
  authenticatedPage: async ({ page }, use) => {
    await setAuthCookies(page, 'test-token', true);
    await use(page);
  },
  authenticatedPageNoCompany: async ({ page }, use) => {
    await setAuthCookies(page, 'no-company-token', false);
    await use(page);
  },
  // Onboarding tests create a company against the mock API, which tracks that company by
  // auth token. A shared token would let parallel test runs see each other's company, so
  // each test gets its own token derived from the (unique) Playwright test id.
  onboardingPage: async ({ page }, use, testInfo) => {
    const uniqueToken = `no-company-token-${testInfo.testId.replace(/[^a-zA-Z0-9]/g, '')}`;
    await setAuthCookies(page, uniqueToken, false);
    await use(page);
  },
});

export { expect } from '@playwright/test';
