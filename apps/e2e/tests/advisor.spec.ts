import type { AdvisorAnswer } from '../../../packages/types/src/advisor';
import { test, expect } from './fixtures/auth';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`advisor requires an explicit send and renders grounded results at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
    await page.setViewportSize(viewport);
    let requests = 0;
    let submittedScope: unknown;
    const conversation = { id: 'conversation', title: 'Monthly records', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
    const answer: AdvisorAnswer = { status: 'answered', shortAnswer: 'Recorded sales total', explanation: 'This is a record total, not tax due.', assumptions: [], questions: [], sources: [],
      calculations: [{ currency: 'PLN', issuedGross: '123.00', issuedVat: '23.00', acceptedGross: '123.00', rejectedGross: '0.00', invoiceCount: 1 }],
      evidence: [{ id: 'accepted-invoice-id', kind: 'outgoing', title: 'Invoice evidence', status: 'ISSUED', currency: 'PLN', gross: '123.00', vat: '23.00', updatedAt: '2026-09-19T12:00:00.000Z' }],
      provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'unreviewed', sourceReviewMethod: 'not-applicable' } };
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
        connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] } });
      if (path.endsWith('/messages')) {
        requests += 1; submittedScope = route.request().postDataJSON().scope;
        return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n` });
      }
      return route.fulfill({ json: route.request().method() === 'POST' ? conversation : requests ? [conversation] : [] });
    });
    await page.goto('/dashboard');
    const trigger = viewport.width >= 1280 ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
    await trigger.click();
    const panel = viewport.width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
    await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toBeVisible();
    expect(requests).toBe(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await panel.screenshot({ path: testInfo.outputPath(`advisor-panel-empty-${theme}.png`) });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await panel.getByRole('checkbox', { name: /Dołącz dane firmy z/ }).check();
    await panel.locator('textarea').fill('Summarize these records');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel.getByRole('heading', { name: answer.shortAnswer })).toBeVisible();
    expect(requests).toBe(1);
    expect(submittedScope).toEqual({ questionKind: 'records', period: new Date().toISOString().slice(0, 7), includeRecords: true });
    await expect(panel.locator('dl > div').filter({ hasText: 'VAT na wystawionych' })).toContainText(/23,00\s*zł/);
    await expect(panel.locator('dl > div').filter({ hasText: 'Odrzucone' })).toContainText(/0,00\s*zł/);
    await panel.getByText('Dokumenty źródłowe (1)', { exact: true }).click();
    await expect(panel.getByRole('link', { name: /Invoice evidence 123,00/ })).toHaveAttribute('href', '/dashboard/invoices/accepted-invoice-id');
    if (viewport.width >= 1280) await expect(panel).toHaveCSS('width', '400px');
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: testInfo.outputPath(`advisor-${theme}.png`), fullPage: true });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
    if (viewport.width >= 1280) {
      await page.keyboard.press('Control+j');
      await expect(panel).toBeVisible();
    }
  });
}
test('advisor settings offer in-app and external chat connection modes', async ({ authenticatedPage: page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings')) return route.fulfill({ json: {
      enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: ['CHATGPT', 'CLAUDE'],
      retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0, connections: [],
    } });
    if (path.endsWith('/connectors')) return route.fulfill({ json: {
      endpoint: 'https://api.example.com/advisor/mcp', clients: ['CHATGPT', 'CLAUDE'],
      grants: [{ client: 'CHATGPT', environment: 'TEST', status: 'WAITING', expiresAt: '2026-10-19T12:00:00.000Z', lastUsedAt: null, revokedAt: null },
        { client: 'CLAUDE', environment: 'TEST', status: 'WAITING', expiresAt: '2026-10-19T12:00:00.000Z', lastUsedAt: null, revokedAt: null }],
    } });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  await page.goto('/dashboard/settings');
  await page.getByRole('button', { name: 'Doradca', exact: true }).click();
  const settings = page.locator('#settings-panel');
  await expect(settings.getByRole('button', { name: /Doradca w Księgowym Vibe/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('heading', { name: 'Gotowość' })).toBeVisible();
  await settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ }).click();
  await expect(settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(settings.getByRole('link', { name: 'Otwórz ChatGPT' })).toHaveAttribute('href', 'https://chatgpt.com');
  await settings.getByRole('radio', { name: 'Claude' }).check();
  await expect(settings.getByRole('link', { name: 'Otwórz Claude' })).toHaveAttribute('href', 'https://claude.ai/new');
  await expect(settings.getByRole('link', { name: 'Otwórz Claude' })).toHaveAttribute('target', '_blank');
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1440);
  await page.screenshot({ path: testInfo.outputPath('advisor-settings-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Doradca', exact: true })).toBeInViewport();
  await expect(settings.getByRole('button', { name: /Doradca w Księgowym Vibe/ })).toBeVisible();
  await expect(settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  await page.screenshot({ path: testInfo.outputPath('advisor-settings-mobile.png'), fullPage: true });
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`advisor renders a declined answer without empty sections at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
    await page.setViewportSize(viewport);
    const conversation = { id: 'conversation', title: 'Out of scope', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
    const answer: AdvisorAnswer = { status: 'declined', shortAnswer: 'This question is outside tax and bookkeeping advice.', explanation: 'I can explain VAT, PIT and CIT rules and summarize your recorded invoices.',
      assumptions: [], questions: [], sources: [], calculations: [], evidence: [],
      provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'not-applicable', sourceReviewMethod: 'not-applicable' } };
    let asked = false;
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
        connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] } });
      if (path.endsWith('/messages')) {
        asked = true;
        return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify(answer)}\n\nevent: done\ndata: {}\n\n` });
      }
      return route.fulfill({ json: route.request().method() === 'POST' ? conversation : asked ? [conversation] : [] });
    });
    await page.goto('/dashboard');
    const trigger = viewport.width >= 1280 ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
    await trigger.click();
    const panel = viewport.width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
    await panel.locator('textarea').fill('What is the weather tomorrow?');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel.getByRole('heading', { name: answer.shortAnswer })).toBeVisible();
    await expect(panel.getByText('Poza zakresem doradcy', { exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'W czym mogę pomóc' })).toBeVisible();
    await expect(panel.getByText(answer.explanation)).toBeVisible();
    for (const hidden of ['Założenia', 'Potrzebne informacje', 'Wyliczenia', 'Dokumenty źródłowe', 'Źródła przepisów']) await expect(panel.getByText(hidden)).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
      await page.screenshot({ path: testInfo.outputPath(`advisor-declined-${theme}.png`), fullPage: true });
    }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  });
}

const blockedCases = [
  {
    name: 'operator overrides disabled company, denied provider and missing connection',
    provider: 'OPENROUTER', providerName: 'OpenRouter', openConversation: false, canManageConnections: true,
    enabled: false, operatorEnabled: false, allowedProviders: [],
    connections: [],
    reason: 'Doradca jest wyłączony na serwerze.',
    owner: 'Może go włączyć operator usługi.',
    hint: 'Nie możesz wysłać pytania, dopóki operator nie włączy doradcy.',
  },
  {
    name: 'company overrides denied provider and missing connection',
    provider: 'OPENROUTER', providerName: 'OpenRouter', openConversation: false, canManageConnections: true,
    enabled: false, operatorEnabled: true, allowedProviders: [],
    connections: [],
    reason: 'Doradca jest wyłączony dla tej firmy.',
    owner: 'Może go włączyć administrator firmy.',
    hint: 'Nie możesz wysłać pytania, dopóki administrator firmy nie włączy doradcy.',
  },
  {
    name: 'denied Anthropic overrides its missing connection',
    provider: 'ANTHROPIC', providerName: 'Anthropic API', openConversation: false, canManageConnections: true,
    enabled: true, operatorEnabled: true, allowedProviders: ['OPENAI'],
    connections: [{ provider: 'ANTHROPIC', model: 'saved-model', hasCredential: true, testedAt: null }],
    reason: 'Dostawca Anthropic API nie jest dozwolony w tej firmie.',
    owner: 'Może go dopuścić administrator firmy.',
    hint: 'Nie możesz wysłać pytania przez Anthropic API, dopóki administrator firmy nie zezwoli na tego dostawcę.',
  },
  {
    name: 'allowed Anthropic without its own connection despite another saved provider',
    provider: 'ANTHROPIC', providerName: 'Anthropic API', openConversation: true, canManageConnections: true,
    enabled: true, operatorEnabled: true, allowedProviders: ['OPENAI', 'ANTHROPIC'],
    connections: [{ provider: 'OPENAI', model: 'saved-model', hasCredential: true, testedAt: null }],
    reason: 'Nie masz jeszcze zapisanego połączenia z Anthropic API.',
    owner: 'Możesz je zapisać dla swojego konta w tej firmie.',
    hint: 'Nie możesz wysłać pytania przez Anthropic API, dopóki nie zapiszesz połączenia.',
  },
  {
    name: 'viewer without a saved connection cannot save one',
    provider: 'OPENROUTER', providerName: 'OpenRouter', openConversation: false, canManageConnections: false,
    enabled: true, operatorEnabled: true, allowedProviders: ['OPENROUTER'],
    connections: [],
    reason: 'Twoja rola w tej firmie nie pozwala zapisać połączenia z dostawcą.',
    owner: 'Rolę może zmienić administrator firmy. Wskazówki i dokumenty nadal możesz przeglądać.',
    hint: 'Nie możesz wysłać pytania bez własnego połączenia z dostawcą.',
  },
] as const;

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  for (const blocked of blockedCases) {
    test(`advisor blocked: ${blocked.name} at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
      await page.setViewportSize(viewport);
      const modelPosts: string[] = [];
      page.on('request', (request) => {
        if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/advisor/')) modelPosts.push(request.url());
      });
      await page.route('**/companies/test-company-id/advisor/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/settings')) return route.fulfill({ json: {
          enabled: blocked.enabled, operatorEnabled: blocked.operatorEnabled, canManagePolicy: false, canManageConnections: blocked.canManageConnections,
          allowedProviders: blocked.allowedProviders, allowedConnectors: [], retentionDays: 30,
          ollamaAvailable: false, reviewedSourceCount: 0, connections: blocked.connections,
        } });
        const stored = { id: 'anthropic-history', title: 'Anthropic history', provider: 'ANTHROPIC', model: 'claude-model', createdAt: '2026-09-19T12:00:00.000Z' };
        if (path.endsWith('/conversations/anthropic-history')) return route.fulfill({ json: { ...stored, turns: [] } });
        if (path.endsWith('/conversations')) return route.fulfill({ json: blocked.openConversation ? [stored] : [] });
        return route.fulfill({ status: 405, json: { code: 'UNEXPECTED_ADVISOR_REQUEST' } });
      });
      await page.goto('/dashboard');
      const trigger = viewport.width >= 1280 ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
      await trigger.click();
      const panel = viewport.width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
      // The provider comes from the first saved connection or, for a stored conversation, from that conversation.
      if (blocked.openConversation) {
        await panel.getByRole('button', { name: 'Historia rozmów' }).click();
        await panel.getByRole('button', { name: /Anthropic history/ }).first().click();
      }
      const card = panel.locator('section[aria-labelledby="advisor-blocker-reason"]');
      await expect(card).toHaveCount(1);
      await expect(card.locator('#advisor-blocker-reason')).toHaveText(blocked.reason);
      await expect(card.getByText(blocked.owner, { exact: true })).toBeVisible();
      await expect(panel.locator('#advisor-blocker-hint')).toHaveText(blocked.hint);
      await expect(panel.getByText(blocked.providerName, { exact: true })).toBeVisible();
      await expect(panel.getByRole('textbox', { name: 'Pytanie do Doradcy' })).toBeDisabled();
      await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toHaveAttribute('aria-disabled', 'true');
      await expect(panel.getByRole('checkbox')).toHaveCount(0);
      await expect(panel.getByLabel('Rodzaj pytania')).toHaveCount(0);
      const settingsLink = card.getByRole('link', { name: 'Otwórz ustawienia Doradcy' });
      await expect(settingsLink).toHaveAttribute('href', '/dashboard/settings?section=advisor');
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
        await expect(panel).toBeVisible();
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await panel.screenshot({ path: testInfo.outputPath(`blocked-${blocked.provider.toLowerCase()}-${theme}.png`) });
      }
      if (viewport.width >= 1280) {
        await expect(panel).toHaveCSS('width', '400px');
        const bounds = await panel.boundingBox();
        expect(bounds).not.toBeNull();
        const dashboardRight = await panel.evaluate((element) => element.parentElement?.getBoundingClientRect().right);
        expect(bounds!.x + bounds!.width).toBeCloseTo(dashboardRight!, 0);
      } else {
        await expect(panel).toHaveCSS('border-top-left-radius', '26px');
        const bounds = await panel.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.y + bounds!.height).toBeCloseTo(viewport.height, 0);
      }
      const hintBounds = await panel.locator('#advisor-blocker-hint').boundingBox();
      const panelBounds = await panel.boundingBox();
      expect(hintBounds).not.toBeNull();
      expect(panelBounds).not.toBeNull();
      expect(panelBounds!.y + panelBounds!.height - hintBounds!.y - hintBounds!.height).toBeLessThan(80);
      expect(modelPosts).toEqual([]);
      await settingsLink.click();
      await expect(page).toHaveURL(/\/dashboard\/settings\?section=advisor$/);
      await expect(page.getByRole('button', { name: 'Doradca', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#settings-panel').getByRole('button', { name: /Doradca w Księgowym Vibe/ })).toHaveAttribute('aria-pressed', 'true');
      expect(modelPosts).toEqual([]);
    });
  }
}

test('advisor retains the denied conversation provider on history load and settings refresh', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const modelPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.includes('/advisor/')) modelPosts.push(request.url());
  });
  const conversation = { id: 'anthropic-history', title: 'Anthropic history', provider: 'ANTHROPIC', model: 'claude-model', createdAt: '2026-09-19T12:00:00.000Z' };
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings')) return route.fulfill({ json: {
      enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'],
      allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
      connections: [{ provider: 'OPENAI', model: 'saved-model', hasCredential: true, testedAt: null }],
    } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: [conversation] });
    if (path.endsWith(`/conversations/${conversation.id}`)) return route.fulfill({ json: { ...conversation, turns: [] } });
    return route.fulfill({ status: 405, json: { code: 'UNEXPECTED_ADVISOR_REQUEST' } });
  });
  await page.goto('/dashboard');
  const trigger = page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' });
  await trigger.click();
  const panel = page.getByRole('complementary', { name: 'Doradca' });
  await panel.getByRole('button', { name: 'Historia rozmów' }).click();
  await panel.getByRole('button', { name: /Anthropic history/ }).first().click();
  await expect(panel.locator('#advisor-blocker-reason')).toHaveText('Dostawca Anthropic API nie jest dozwolony w tej firmie.');
  await expect(panel.getByText('Anthropic API', { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Pytanie do Doradcy' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Zamknij doradcę' }).click();
  await trigger.click();
  await expect(panel.locator('#advisor-blocker-reason')).toHaveText('Dostawca Anthropic API nie jest dozwolony w tej firmie.');
  await expect(panel.getByText('Anthropic API', { exact: true })).toBeVisible();
  expect(modelPosts).toEqual([]);
});

test('advisor shows the AI-review disclaimer on a tax answer replayed from history', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const disclaimer = 'Odpowiedź przygotowana przez AI na podstawie źródeł sprawdzonych wyłącznie przez AI. To nie jest porada podatkowa.';
  const conversation = { id: 'tax-history', title: 'Tax history', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
  const answer: AdvisorAnswer = { status: 'answered', shortAnswer: 'Stawka VAT wynosi 23%', explanation: 'Podstawowa stawka.', assumptions: [], questions: [], calculations: [], evidence: [], disclaimer,
    sources: [{ id: 'vat-act', title: 'VAT Act', url: 'https://example.org/law', section: 'art. 41', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31', reviewedAt: '2026-09-01', reviewExpiresAt: '2026-12-31', reviewedBy: 'ai:OPENAI/model-a+ai:ANTHROPIC/model-b', reviewMethod: 'ai', excerpt: 'Stawka podstawowa' }],
    provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'reviewed-2026', sourceReviewMethod: 'ai' } };
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 1,
      connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] } });
    if (path.endsWith('/conversations')) return route.fulfill({ json: [conversation] });
    if (path.endsWith(`/conversations/${conversation.id}`)) return route.fulfill({ json: { ...conversation, turns: [{ id: 'turn', question: 'Jaka stawka VAT?', status: 'COMPLETED', answer, createdAt: '2026-09-19T12:00:00.000Z' }] } });
    return route.fulfill({ status: 405, json: { code: 'UNEXPECTED_ADVISOR_REQUEST' } });
  });
  await page.goto('/dashboard');
  await page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' }).click();
  const panel = page.getByRole('dialog', { name: 'Doradca' });
  await panel.getByRole('button', { name: 'Historia rozmów' }).click();
  await panel.getByRole('button', { name: /Tax history/ }).first().click();
  await expect(panel.getByRole('note')).toHaveText(`Wygenerowane przez AI${disclaimer}`);
  await panel.getByText('Źródła przepisów (1)', { exact: true }).click();
  await expect(panel.getByText('Sprawdzone przez AI · OPENAI/model-a + ANTHROPIC/model-b · 2026-09-01')).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
});
