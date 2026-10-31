import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];
const conversation = { id: 'conversation', title: 'Gate', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };

function answerStream(companyId: string) {
  const answer = { status: 'answered', shortAnswer: `Answer for ${companyId}`, explanation: 'Record summary only.', assumptions: [], questions: [], sources: [], calculations: [],
    evidence: [{ id: 'evidence-1', kind: 'outgoing', title: 'FV/1', status: 'ISSUED', currency: 'PLN', gross: '123.00', vat: '23.00', updatedAt: '2026-09-19T12:00:00.000Z' }],
    provenance: { companyId, environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'none' } };
  return `event: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n`;
}

// Routes the advisor API of any company; `taxCoveredPeriods` drives taxSourceCoverage for the requested ?period.
async function routeAdvisorApi(page: Page, options: { taxCoveredPeriods?: string[]; canManageConnections?: boolean } = {}) {
  const requests = { settingsCompanies: [] as string[], messageScopes: [] as unknown[], writes: [] as string[] };
  await page.route('**/companies/*/advisor/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const companyId = url.pathname.split('/')[2];
    if (request.method() !== 'GET') requests.writes.push(`${request.method()} ${url.pathname}`);
    if (url.pathname.endsWith('/settings')) {
      requests.settingsCompanies.push(companyId);
      const period = url.searchParams.get('period');
      return route.fulfill({ json: { enabled: true, canManagePolicy: false, canManageConnections: options.canManageConnections ?? true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
        connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }],
        ...(period && options.taxCoveredPeriods ? { taxSourceCoverage: { period, covered: options.taxCoveredPeriods.includes(period), sourceVersion: 'reviewed-2026' } } : {}) } });
    }
    if (url.pathname.endsWith('/connectors')) return route.fulfill({ json: { endpoint: 'https://api.example.com/advisor/mcp', clients: ['CHATGPT'],
      grants: [{ client: 'CHATGPT', environment: 'TEST', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null }] } });
    if (url.pathname.endsWith('/messages')) {
      requests.messageScopes.push(request.postDataJSON().scope);
      return route.fulfill({ contentType: 'text/event-stream', body: answerStream(companyId) });
    }
    if (url.pathname.endsWith('/conversations')) return route.fulfill({ json: request.method() === 'POST' ? conversation : [] });
    if (url.pathname.endsWith('/insights')) return route.fulfill({ json: null });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  return requests;
}

function advisorPanel(page: Page, width: number) {
  return width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
}

function advisorTrigger(page: Page, width: number) {
  return width >= 1280 ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
}

for (const viewport of viewports) {
  test(`tax question kind follows reviewed source coverage of the selected period at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize(viewport);
    const requests = await routeAdvisorApi(page, { taxCoveredPeriods: ['2026-10'] });
    await page.goto('/dashboard');
    await advisorTrigger(page, viewport.width).click();
    const panel = advisorPanel(page, viewport.width);
    await panel.getByRole('button', { name: 'Zmień' }).click();
    const kind = panel.getByLabel('Rodzaj pytania');
    const taxOption = kind.locator('option[value="tax"]');
    const reason = panel.locator('#advisor-tax-unavailable');
    const note = panel.locator('#advisor-tax-note');
    const textarea = panel.locator('textarea');

    await panel.locator('input[type="month"]').fill('2026-10');
    await expect(taxOption).toHaveJSProperty('disabled', false);
    await expect(reason).toHaveCount(0);
    await kind.selectOption('tax');

    // Uncovered period: tax is disabled, the reason is announced and the selection falls back to records.
    await panel.locator('input[type="month"]').fill('2026-09');
    await expect(taxOption).toHaveJSProperty('disabled', true);
    await expect(reason).toBeVisible();
    await expect(kind).toHaveAttribute('aria-describedby', 'advisor-tax-unavailable');
    await expect(kind).toHaveValue('records');
    await expect(note).toBeVisible();
    await expect(textarea).toHaveAttribute('aria-describedby', 'advisor-tax-note');
    await expect(note).toContainText('Zmieniono rodzaj pytania na „Dokumenty firmy”.');
    await expect(panel.getByText('Brak zatwierdzonych źródeł podatkowych. Dostępne są wyjaśnienia dokumentów')).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);

    await textarea.fill('Summarize these records');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Answer for test-company-id' })).toBeVisible();
    expect(requests.messageScopes).toEqual([{ questionKind: 'records', period: '2026-09', includeRecords: false }]);
    await expect(note).toBeVisible();
    await expect(note).not.toContainText('Zmieniono rodzaj pytania');

    await panel.locator('input[type="month"]').fill('2026-10');
    await expect(note).toHaveCount(0);
    await expect(textarea).not.toHaveAttribute('aria-describedby');
  });
}

test('switching company clears the previous advisor conversation and reads the new company', async ({ multiCompanyPage: page }) => {
  await page.setViewportSize(viewports[0]);
  const requests = await routeAdvisorApi(page);
  await page.goto('/dashboard');
  await advisorTrigger(page, 1440).click();
  const panel = advisorPanel(page, 1440);
  await panel.locator('textarea').fill('Summarize these records');
  await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Answer for test-company-id' })).toBeVisible();

  await page.getByRole('combobox', { name: 'Wybierz firmę' }).first().selectOption('second-company-id');
  await expect(page.getByRole('combobox', { name: 'Wybierz firmę' }).first()).toHaveValue('second-company-id');
  await advisorTrigger(page, 1440).click();
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Answer for test-company-id' })).toHaveCount(0);
  await expect(panel.getByText('Answer for test-company-id')).toHaveCount(0);
  await expect(panel.locator('textarea')).toHaveValue('');
  await expect.poll(() => requests.settingsCompanies).toContain('second-company-id');
  expect(requests.messageScopes).toHaveLength(1);
});

for (const viewport of viewports) {
  test(`viewer Explain only reads: suggestions are links and nothing is written at ${viewport.width}px`, async ({ viewerPage: page }) => {
    await page.setViewportSize(viewport);
    const requests = await routeAdvisorApi(page);
    const accountingWrites: string[] = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (request.method() !== 'GET' && pathname.startsWith('/companies/') && !pathname.includes('/advisor/')) accountingWrites.push(`${request.method()} ${pathname}`);
    });
    await page.goto('/dashboard/invoices/accepted-invoice-id');
    await page.getByRole('button', { name: 'Wyjaśnij z doradcą' }).click();
    const panel = advisorPanel(page, viewport.width);
    await panel.getByRole('button', { name: 'Zmień' }).click();
    await panel.getByRole('checkbox', { name: /Dołącz zestawienie/ }).check();
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'Answer for test-company-id' })).toBeVisible();
    await panel.getByText('Dokumenty źródłowe (1)', { exact: true }).click();
    await expect(panel.getByRole('link', { name: /FV\/1/ })).toHaveAttribute('href', '/dashboard/invoices/evidence-1');
    // Everything the advisor offers to act on is an anchor to an existing screen; no extra action buttons exist.
    await expect(panel.getByRole('button', { name: /zapisz|wystaw|zatwierdź|odrzuć|popraw/i })).toHaveCount(0);
    expect(requests.writes.sort()).toEqual([`POST /companies/test-company-id/advisor/conversations`, `POST /companies/test-company-id/advisor/conversations/conversation/messages`].sort());
    expect(accountingWrites).toEqual([]);
  });
}

for (const viewport of viewports) {
  test(`keyboard shortcut opens the advisor, Escape closes it and focus returns at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize(viewport);
    await routeAdvisorApi(page);
    await page.goto('/dashboard');
    const trigger = advisorTrigger(page, viewport.width);
    const panel = advisorPanel(page, viewport.width);
    await trigger.focus();

    await page.keyboard.press('Control+j');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    // Cmd+J opens and the same shortcut toggles it closed again, restoring focus.
    await page.keyboard.press('Meta+j');
    await expect(panel).toBeVisible();
    await page.keyboard.press('Meta+j');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

for (const viewport of viewports) {
  test(`viewer cannot save connections or grant access but can disconnect and revoke at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize(viewport);
    const requests = await routeAdvisorApi(page, { canManageConnections: false });
    await page.goto('/dashboard/settings?section=advisor');
    const settings = page.locator('#settings-panel');
    const roleReason = 'Tylko administrator lub księgowy może zapisywać połączenia i udzielać dostępu.';

    await expect(settings.getByRole('button', { name: 'Zapisz połączenie' })).toBeDisabled();
    await expect(settings.getByText(roleReason, { exact: false }).first()).toBeVisible();
    await expect(settings.getByRole('region', { name: 'Sprawdzenie' }).getByRole('button', { name: 'Odłącz' })).toBeEnabled();

    await settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ }).click();
    await expect(settings.getByRole('button', { name: 'Zezwól na odczyt' })).toBeDisabled();
    await expect(settings.locator('#advisor-grant-reason')).toContainText(roleReason);
    await expect(settings.getByRole('button', { name: 'Cofnij zgodę' })).toBeEnabled();
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    expect(requests.writes).toEqual([]);
  });
}
