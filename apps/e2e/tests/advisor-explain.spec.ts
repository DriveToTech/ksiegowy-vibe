import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const conversation = { id: 'conversation', title: 'Explain', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
const panelOf = (page: Page) => page.getByRole('complementary', { name: 'Doradca' });

async function routeAdvisorApi(page: Page, options: { hold?: Promise<void>; settings?: Record<string, unknown>; writes?: string[] } = {}) {
  const { hold, settings, writes } = options;
  const scopes: unknown[] = [];
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (request.method() !== 'GET') writes?.push(`${request.method()} ${pathname}`);
    if (pathname.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true,
      allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
      connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: '2026-09-19T12:00:00.000Z' }], ...settings } });
    if (pathname.endsWith('/messages')) {
      scopes.push(request.postDataJSON().scope);
      await hold;
      return route.fulfill({ status: 500, json: { code: 'PROVIDER_ERROR' } });
    }
    if (pathname.endsWith('/conversations')) return route.fulfill({ json: request.method() === 'POST' ? conversation : [] });
    if (pathname.endsWith('/insights')) return route.fulfill({ json: null });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  return scopes;
}

const entries = [
  { name: 'outgoing invoice', path: '/dashboard/invoices/accepted-invoice-id', reference: 'DEMO-INV-008' },
  { name: 'incoming document', path: '/dashboard/incoming/incoming-ocr-review-id', reference: 'INCOMING-DEMO-004' },
];

for (const entry of entries) {
  test(`Explain on ${entry.name} shows the reference and blocks sending until a choice`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const scopes = await routeAdvisorApi(page);
    await page.goto(entry.path);
    await page.getByRole('button', { name: 'Wyjaśnij z doradcą' }).click();
    const panel = panelOf(page);
    await expect(panel).toContainText(entry.reference);
    await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await panel.getByRole('radio', { name: /Zapytaj bez danych firmy/ }).click();
    await panel.locator('textarea').fill('Co to za dokument?');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect.poll(() => scopes.length).toBe(1);
    expect(scopes[0]).not.toHaveProperty('documentId');
  });
}

test('Explain on contractor carries the contractor reference', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await routeAdvisorApi(page);
  await page.goto('/dashboard/contractors');
  await page.getByRole('button', { name: 'Wyjaśnij z doradcą' }).click();
  await expect(panelOf(page)).toContainText('Saldo kontrahenta: Bluebird Example Studio LLC');
  await expect(panelOf(page).getByRole('radio', { name: /Dołącz faktury kontrahenta/ })).toBeVisible();
});

test('Explain is aria-disabled with a visible reason while an answer is in flight', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  let release = () => {};
  await routeAdvisorApi(page, { hold: new Promise<void>((resolve) => { release = resolve; }) });
  await page.goto('/dashboard/invoices/accepted-invoice-id');
  const explain = page.getByRole('button', { name: 'Wyjaśnij z doradcą' });
  await explain.click();
  const panel = panelOf(page);
  await panel.getByRole('radio', { name: /Dołącz ten dokument/ }).click();
  await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
  await expect(explain).toHaveAttribute('aria-disabled', 'true');
  await expect(explain).toHaveAccessibleDescription('Poczekaj, aż Doradca skończy bieżącą odpowiedź.');
  release();
  await expect(explain).not.toHaveAttribute('aria-disabled', 'true');
});

test('Explain under a blocker shows the blocker, keeps the reference and sends nothing', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const writes: string[] = [];
  const scopes = await routeAdvisorApi(page, { settings: { enabled: false }, writes });
  await page.goto('/dashboard/invoices/accepted-invoice-id');
  await page.getByRole('button', { name: 'Wyjaśnij z doradcą' }).click();
  const panel = panelOf(page);
  await expect(panel.locator('#advisor-blocker-reason')).toHaveText('Doradca jest wyłączony dla tej firmy.');
  await expect(panel).toContainText('DEMO-INV-008');
  // The blocker replaces the consent choice: nothing about the document can be included.
  await expect(panel.getByRole('radio')).toHaveCount(0);
  await expect(panel.getByRole('textbox', { name: 'Pytanie do Doradcy' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toHaveAttribute('aria-disabled', 'true');
  await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click({ force: true });
  expect(scopes).toEqual([]);
  expect(writes).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`contractor Explain sends the contractor scope only after choosing to include at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize(viewport);
    let submittedScope: unknown;
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const request = route.request();
      const { pathname } = new URL(request.url());
      if (pathname.endsWith('/settings')) return route.fulfill({ json: { enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [],
        retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] } });
      if (pathname.endsWith('/insights')) return route.fulfill({ json: null });
      if (pathname.endsWith('/messages')) {
        submittedScope = request.postDataJSON().scope;
        return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify({
          status: 'answered', shortAnswer: 'Saldo wyjaśnione', explanation: 'Według wystawionych faktur.', assumptions: [], questions: [], sources: [], calculations: [],
          contractorBalance: { contractorId: 'test-contractor-second-id', name: 'Juniper Fictional Works LLC', period: '2026-09',
            balances: [{ currency: 'PLN', currentOutstanding: '300.00', recordedPayments: '100.00' }] },
          evidence: [{ id: 'invoice-1', kind: 'outgoing', title: 'FV/1', status: 'ISSUED', currency: 'PLN', gross: '400.00', vat: '75.00', updatedAt: '2026-09-01T00:00:00.000Z' }],
          provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model',
            generatedAt: '2026-09-01T00:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'none', sourceReviewMethod: 'not-applicable' },
        })}\n\nevent: done\ndata: {}\n\n` });
      }
      if (pathname.endsWith('/conversations')) return route.fulfill({ json: request.method() === 'POST' ? conversation : [] });
      return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
    });
    await page.goto('/dashboard/contractors');
    if (viewport.width < 1280) await page.getByRole('button', { name: /Juniper Fictional Works LLC/ }).click();
    else await page.getByRole('button', { name: 'Juniper Fictional Works LLC' }).click();
    await page.locator('input[type="month"]').filter({ visible: true }).first().fill('2026-09');
    await page.getByRole('button', { name: 'Wyjaśnij z doradcą' }).click();
    const panel = viewport.width >= 1280 ? panelOf(page) : page.getByRole('dialog', { name: 'Doradca' });
    await expect(panel).toContainText('Saldo kontrahenta: Juniper Fictional Works LLC');
    await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await panel.getByRole('radio', { name: 'Dołącz faktury kontrahenta do końca 2026-09' }).click();
    await expect(panel).toContainText('nie stan historyczny');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel).toContainText(/300,00\s*zł/);
    await expect(panel).toContainText('Wpłaty zapisane na tych fakturach');
    expect(submittedScope).toEqual({ questionKind: 'records', period: '2026-09', includeRecords: true, contractorId: 'test-contractor-second-id' });
    await panel.getByText('Dokumenty źródłowe (1)').click();
    await expect(panel.getByRole('link', { name: /^FV\/1 400,00/ })).toHaveAttribute('href', '/dashboard/invoices/invoice-1');
  });
}
