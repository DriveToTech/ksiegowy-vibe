import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const conversations = [{ id: 'first', title: 'Czy faktura wymaga NIP nabywcy?', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-11-08T09:12:00.000Z' }];

async function routeAdvisorApi(page: Page) {
  const requests: string[] = [];
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true,
      allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
      connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: '2026-11-01T12:00:00.000Z' }] } });
    if (pathname.endsWith('/conversations') && request.method() === 'GET') return route.fulfill({ json: conversations });
    if (pathname.endsWith('/insights')) return route.fulfill({ json: null });
    requests.push(`${request.method()} ${pathname}`);
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  return requests;
}

test('two columns at 1280 with the rail link reaching the page', async ({ authenticatedPage: page }) => {
  await routeAdvisorApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard');
  await page.getByRole('navigation').getByRole('link', { name: 'Doradca' }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/advisor$/);
  await expect(page.getByRole('heading', { name: 'Historia rozmów' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Czy faktura wymaga NIP.*OpenAI API/ })).toBeVisible();
  await expect(page.locator('#advisor-question')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Historia', exact: true })).toBeHidden();
});

test('Historia button switches between history and conversation below 1280', async ({ authenticatedPage: page }) => {
  await routeAdvisorApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/dashboard/advisor');
  await expect(page.locator('#advisor-question')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Historia rozmów' })).toBeHidden();
  await page.getByRole('button', { name: 'Historia', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Historia rozmów' })).toBeVisible();
  await expect(page.locator('#advisor-question')).toBeHidden();
});

test('briefing only prepares the question and cannot be sent without choosing to include records', async ({ authenticatedPage: page }) => {
  const requests = await routeAdvisorApi(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/dashboard/advisor');
  // History rows come from a client fetch, so they prove hydration finished before the month field is filled.
  await expect(page.getByRole('button', { name: /Czy faktura wymaga NIP.*OpenAI API/ })).toBeVisible();
  await page.getByLabel('Miesiąc').fill('2026-10');
  await page.getByRole('button', { name: 'Przygotuj pytanie' }).click();
  await expect(page.locator('#advisor-question')).toHaveValue(/Podsumuj dokumenty w tym okresie/);
  await expect(page.getByRole('radio', { name: /Dołącz dokumenty z 2026-10/ })).toBeVisible();
  const send = page.getByRole('button', { name: 'Zapytaj', exact: true });
  await expect(send).toHaveAttribute('aria-disabled', 'true');
  await send.click({ force: true });
  expect(requests.filter((request) => request.startsWith('POST'))).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`conversation card fits the workspace with the composer in view at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await routeAdvisorApi(page);
    await page.setViewportSize(viewport);
    await page.goto('/dashboard/advisor');
    const textarea = page.locator('#advisor-question');
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeInViewport({ ratio: 1 });
    await expect(page.locator('body')).toHaveJSProperty('scrollHeight', viewport.height);
  });
}
