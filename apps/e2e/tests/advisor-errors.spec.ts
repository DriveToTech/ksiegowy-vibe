import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

// Source: docs/specs/tax-advisor-error-contract.md. Retry is offered only for retryable codes and always uses a new requestId.
const conversation = { id: 'conversation', title: 'Errors', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
const question = 'Co wynika z dokumentów?';
const answer = { status: 'answered', shortAnswer: 'Odpowiedź po ponowieniu', explanation: 'Zapis dokumentów.', assumptions: [], questions: [], sources: [], calculations: [], evidence: [],
  provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'none', sourceReviewMethod: 'not-applicable' } };

// `failures` are consumed in order, one per message request; once empty the request succeeds.
async function routeAdvisorApi(page: Page, failures: Array<{ status: number; code: string; retryAfterSeconds?: number }>) {
  const requestIds: string[] = [];
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (pathname.endsWith('/settings')) return route.fulfill({ json: { enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [],
      retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: '2026-09-19T12:00:00.000Z' }] } });
    if (pathname.endsWith('/messages')) {
      requestIds.push(request.postDataJSON().requestId);
      const failure = failures.shift();
      if (failure) return route.fulfill({ status: failure.status, json: { code: failure.code, retryAfterSeconds: failure.retryAfterSeconds } });
      return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n` });
    }
    if (pathname.endsWith('/conversations')) return route.fulfill({ json: request.method() === 'POST' ? conversation : [] });
    if (pathname.endsWith('/insights')) return route.fulfill({ json: null });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  return requestIds;
}

async function askQuestion(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/dashboard');
  await page.getByRole('banner').getByRole('button', { name: 'Doradca', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Doradca' });
  await panel.locator('textarea').fill(question);
  await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
  return panel;
}

test('PROVIDER_UNAVAILABLE offers Retry that sends a new requestId and keeps the question', async ({ authenticatedPage: page }) => {
  const requestIds = await routeAdvisorApi(page, [{ status: 502, code: 'PROVIDER_UNAVAILABLE' }]);
  const panel = await askQuestion(page);
  const card = panel.getByRole('alert');
  await expect(card.getByRole('heading', { name: 'Dostawca nie odpowiedział.' })).toBeVisible();
  await expect(card).toContainText('Ponowne pytanie może naliczyć kolejny koszt u dostawcy.');
  await expect(panel.locator('textarea')).toHaveValue(question);
  await card.getByRole('button', { name: 'Spróbuj ponownie' }).click();
  await expect(panel.getByRole('heading', { name: answer.shortAnswer })).toBeVisible();
  expect(requestIds).toHaveLength(2);
  expect(new Set(requestIds).size).toBe(2);
});

test('RATE_LIMITED says it costs nothing and shows the retry countdown', async ({ authenticatedPage: page }) => {
  const requestIds = await routeAdvisorApi(page, [{ status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 10 }]);
  const panel = await askQuestion(page);
  const card = panel.getByRole('alert');
  await expect(card.getByRole('heading', { name: 'Za dużo pytań naraz.' })).toBeVisible();
  await expect(card).toContainText('To nic nie kosztuje');
  await expect(card).not.toContainText('naliczyć kolejny koszt');
  await expect(card).toContainText(/Spróbuj ponownie za \d+ s\./);
  await expect(card.getByRole('button', { name: 'Spróbuj ponownie' })).toBeDisabled();
  await expect(card.getByRole('button', { name: 'Spróbuj ponownie' })).toBeEnabled({ timeout: 15000 });
  expect(requestIds).toHaveLength(1);
});

test('PROVIDER_QUOTA_EXCEEDED has no Retry and links to the provider settings', async ({ authenticatedPage: page }) => {
  const requestIds = await routeAdvisorApi(page, [{ status: 502, code: 'PROVIDER_QUOTA_EXCEEDED' }]);
  const panel = await askQuestion(page);
  const card = panel.getByRole('alert');
  await expect(card.getByRole('heading', { name: 'Dostawca odrzucił żądanie z powodu limitu lub braku środków.' })).toBeVisible();
  await expect(card).toContainText('Sprawdź limity i saldo w koncie OpenAI API.');
  await expect(card.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Ustawienia Doradcy' })).toHaveAttribute('href', '/dashboard/settings?section=advisor');
  await expect(panel.locator('textarea')).toHaveValue(question);
  expect(requestIds).toHaveLength(1);
});

test('PROVIDER_INVALID_CREDENTIALS has no Retry and sends the user to settings', async ({ authenticatedPage: page }) => {
  const requestIds = await routeAdvisorApi(page, [{ status: 502, code: 'PROVIDER_INVALID_CREDENTIALS' }]);
  const panel = await askQuestion(page);
  const card = panel.getByRole('alert');
  await expect(card.getByRole('heading', { name: 'Dostawca odrzucił klucz API OpenAI API.' })).toBeVisible();
  await expect(card).toContainText('Pytanie zostało w polu poniżej.');
  await expect(card.getByRole('button', { name: 'Spróbuj ponownie' })).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'Otwórz ustawienia Doradcy' })).toHaveAttribute('href', '/dashboard/settings?section=advisor');
  await expect(panel.locator('textarea')).toHaveValue(question);
  expect(requestIds).toHaveLength(1);
});
