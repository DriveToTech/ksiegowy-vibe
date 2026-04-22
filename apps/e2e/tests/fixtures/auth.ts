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
}>({
  authenticatedPage: async ({ page }, use) => {
    await setAuthCookies(page, 'test-token', true);
    await use(page);
  },
  authenticatedPageNoCompany: async ({ page }, use) => {
    await setAuthCookies(page, 'no-company-token', false);
    await use(page);
  },
});

export { expect } from '@playwright/test';
