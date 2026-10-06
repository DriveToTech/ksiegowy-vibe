import type { AdvisorAnswer } from '../../../packages/types/src/advisor';
import { test, expect } from './fixtures/auth';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`advisor requires an explicit send and renders grounded results at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
    await page.setViewportSize(viewport);
    let requests = 0;
    let submittedScope: unknown;
    const conversation = { id: 'conversation', title: 'Monthly records', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-09-19T12:00:00.000Z' };
    const answer: AdvisorAnswer = { status: 'answered', shortAnswer: 'Recorded sales total', explanation: 'This is a record total, not tax due.', assumptions: [], questions: [], sources: [],
      calculations: [{ currency: 'PLN', issuedGross: '123.00', issuedVat: '23.00', acceptedGross: '123.00', invoiceCount: 1 }],
      evidence: [{ id: 'accepted-invoice-id', kind: 'outgoing', title: 'Invoice evidence', status: 'ISSUED', currency: 'PLN', gross: '123.00', vat: '23.00', updatedAt: '2026-09-19T12:00:00.000Z' }],
      provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'unreviewed' } };
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
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
    await panel.getByRole('button', { name: 'Zmień' }).click();
    await panel.locator('input[type="month"]').fill('2026-09');
    await panel.getByRole('checkbox', { name: /Dołącz zestawienie/ }).check();
    await panel.locator('textarea').fill('Summarize these records');
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    await expect(panel.getByRole('heading', { name: answer.shortAnswer })).toBeVisible();
    expect(requests).toBe(1);
    expect(submittedScope).toEqual({ questionKind: 'records', period: '2026-09', includeRecords: true });
    await expect(panel.getByText('Wyliczenia', { exact: true })).toBeVisible();
    await expect(panel.getByText('23.00 PLN', { exact: true })).toBeVisible();
    await panel.getByText('Dokumenty źródłowe (1)', { exact: true }).click();
    await expect(panel.getByRole('link', { name: /Invoice evidence/ })).toHaveAttribute('href', '/dashboard/invoices/accepted-invoice-id');
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
      enabled: true, canManagePolicy: false, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: ['CHATGPT', 'CLAUDE'],
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
      provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-09-19T12:00:00.000Z', recordsIncluded: false, evidenceTruncated: false, sourceVersion: 'not-applicable' } };
    let asked = false;
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, canManagePolicy: false, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
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
    provider: 'OPENROUTER',
    enabled: false, operatorEnabled: false, allowedProviders: [],
    connections: [],
    reason: 'Doradca jest wyłączony na serwerze.',
    owner: 'Może go włączyć operator usługi.',
    hint: 'Nie możesz wysłać pytania, dopóki operator nie włączy doradcy.',
  },
  {
    name: 'company overrides denied provider and missing connection',
    provider: 'ANTHROPIC',
    enabled: false, operatorEnabled: true, allowedProviders: [],
    connections: [],
    reason: 'Doradca jest wyłączony dla tej firmy.',
    owner: 'Może go włączyć administrator firmy.',
    hint: 'Nie możesz wysłać pytania, dopóki administrator firmy nie włączy doradcy.',
  },
  {
    name: 'denied Anthropic overrides its missing connection',
    provider: 'ANTHROPIC',
    enabled: true, operatorEnabled: true, allowedProviders: ['OPENAI'],
    connections: [{ provider: 'OPENAI', model: 'saved-model', hasCredential: true, testedAt: null }],
    reason: 'Dostawca Anthropic API nie jest dozwolony w tej firmie.',
    owner: 'Może go dopuścić administrator firmy.',
    hint: 'Nie możesz wysłać pytania przez Anthropic API, dopóki administrator firmy nie zezwoli na tego dostawcę.',
  },
  {
    name: 'allowed Anthropic without its own connection despite another saved provider',
    provider: 'ANTHROPIC',
    enabled: true, operatorEnabled: true, allowedProviders: ['OPENAI', 'ANTHROPIC'],
    connections: [{ provider: 'OPENAI', model: 'saved-model', hasCredential: true, testedAt: null }],
    reason: 'Nie masz jeszcze zapisanego połączenia z Anthropic API.',
    owner: 'Możesz je zapisać dla swojego konta w tej firmie.',
    hint: 'Nie możesz wysłać pytania przez Anthropic API, dopóki nie zapiszesz połączenia.',
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
          enabled: blocked.enabled, operatorEnabled: blocked.operatorEnabled, canManagePolicy: false,
          allowedProviders: blocked.allowedProviders, allowedConnectors: [], retentionDays: 30,
          ollamaAvailable: false, reviewedSourceCount: 0, connections: blocked.connections,
        } });
        if (path.endsWith('/conversations')) return route.fulfill({ json: [] });
        return route.fulfill({ status: 405, json: { code: 'UNEXPECTED_ADVISOR_REQUEST' } });
      });
      await page.goto('/dashboard');
      const trigger = viewport.width >= 1280 ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
      await trigger.click();
      const panel = viewport.width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
      if (blocked.provider === 'ANTHROPIC') {
        await panel.getByRole('button', { name: 'Zmień' }).click();
        await panel.getByRole('combobox', { name: 'Dostawca' }).selectOption('ANTHROPIC');
      }
      const card = panel.locator('section[aria-labelledby="advisor-blocker-reason"]');
      await expect(card).toHaveCount(1);
      await expect(card.locator('#advisor-blocker-reason')).toHaveText(blocked.reason);
      await expect(card.getByText(blocked.owner, { exact: true })).toBeVisible();
      await expect(panel.locator('#advisor-blocker-hint')).toHaveText(blocked.hint);
      await expect(panel.getByText(`Czytam: ${blocked.provider === 'ANTHROPIC' ? 'Anthropic API' : 'OpenRouter'} · TEST`, { exact: false })).toBeVisible();
      await expect(panel.getByRole('textbox', { name: 'Pytanie do Doradcy' })).toBeDisabled();
      await expect(panel.getByRole('button', { name: 'Zapytaj', exact: true })).toBeDisabled();
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
      enabled: true, operatorEnabled: true, canManagePolicy: false, allowedProviders: ['OPENAI'],
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
  await panel.getByLabel('Historia rozmów').selectOption(conversation.id);
  await expect(panel.locator('#advisor-blocker-reason')).toHaveText('Dostawca Anthropic API nie jest dozwolony w tej firmie.');
  await expect(panel.getByText('Czytam: Anthropic API · TEST', { exact: false })).toBeVisible();
  await panel.getByRole('button', { name: 'Zmień' }).click();
  await expect(panel.getByRole('combobox', { name: 'Dostawca' })).toHaveValue('ANTHROPIC');
  await expect(panel.getByRole('textbox', { name: 'Pytanie do Doradcy' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Zamknij doradcę' }).click();
  await trigger.click();
  await expect(panel.locator('#advisor-blocker-reason')).toHaveText('Dostawca Anthropic API nie jest dozwolony w tej firmie.');
  await expect(panel.getByRole('combobox', { name: 'Dostawca' })).toHaveValue('ANTHROPIC');
  expect(modelPosts).toEqual([]);
});
