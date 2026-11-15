import type { Locator, Page, TestInfo } from '@playwright/test';
import type { AdvisorConnectionSummary, AdvisorProvider } from '../../../packages/types/src/advisor';
import { test, expect } from './fixtures/auth';

const viewports = [{ width: 1440, height: 1000 }, { width: 390, height: 844 }];

interface AdvisorMock {
  ollamaAvailable: boolean;
  operatorEnabled: boolean;
  allowedProviders: AdvisorProvider[];
  connections: AdvisorConnectionSummary[];
  // Responses are consumed in order; the last one repeats.
  previewResponses: Array<{ status: number; json: unknown }>;
  previewBodies: unknown[];
  savedBodies: unknown[];
  testRequests: number;
  deletedProviders: AdvisorProvider[];
}

// Captures the whole settings section in light, then in dark. The section scrolls inside the app shell, so the viewport is
// grown to the section height first; otherwise the shell clips it. The theme comes from `data-theme` (localStorage
// bootstrap), not from prefers-color-scheme, so the attribute is set directly.
async function screenshotAdvisorSection(page: Page, testInfo: TestInfo, name: string, target: Locator = page.locator('#settings-panel')) {
  const originalViewport = page.viewportSize();
  const sectionHeight = await target.evaluate((element) => element.scrollHeight);
  if (originalViewport) await page.setViewportSize({ width: originalViewport.width, height: sectionHeight + 400 });
  await target.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  await target.screenshot({ path: testInfo.outputPath(`${name}-dark.png`) });
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  if (originalViewport) await page.setViewportSize(originalViewport);
}

function createAdvisorMock(overrides: Partial<AdvisorMock>): AdvisorMock {
  return { ollamaAvailable: false, operatorEnabled: true, allowedProviders: ['OPENROUTER'], connections: [], previewResponses: [], previewBodies: [], savedBodies: [], testRequests: 0, deletedProviders: [], ...overrides };
}

async function routeAdvisorApi(page: Page, mock: AdvisorMock) {
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const provider = path.split('/connections/')[1]?.split('/')[0] as AdvisorProvider | undefined;
    if (path.endsWith('/settings')) return route.fulfill({ json: { enabled: true, operatorEnabled: mock.operatorEnabled, canManagePolicy: false, canManageConnections: true, allowedProviders: mock.allowedProviders, allowedConnectors: [],
      retentionDays: 30, ollamaAvailable: mock.ollamaAvailable, reviewedSourceCount: 0, connections: mock.connections } });
    if (path.endsWith('/connectors')) return route.fulfill({ json: { endpoint: null, clients: [], grants: [] } });
    if (path.endsWith('/model-preview')) {
      mock.previewBodies.push(request.postDataJSON());
      const response = mock.previewResponses.length > 1 ? mock.previewResponses.shift() : mock.previewResponses[0];
      return route.fulfill({ status: response?.status ?? 500, json: response?.json });
    }
    if (provider && path.endsWith('/test')) {
      mock.testRequests += 1;
      mock.connections = mock.connections.map((connection) => connection.provider === provider ? { ...connection, testedAt: '2026-10-01T10:00:00.000Z' } : connection);
      return route.fulfill({ json: { testedAt: '2026-10-01T10:00:00.000Z' } });
    }
    if (provider && request.method() === 'DELETE') {
      mock.deletedProviders.push(provider);
      mock.connections = [];
      return route.fulfill({ json: { deleted: true } });
    }
    if (path.endsWith('/conversations')) return route.fulfill({ json: [] });
    if (provider && request.method() === 'PUT') {
      const body = request.postDataJSON() as { model: string; credential?: string };
      mock.savedBodies.push(body);
      mock.connections = [{ provider, model: body.model, hasCredential: provider !== 'OLLAMA', testedAt: null }];
      return route.fulfill({ json: { saved: true } });
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
}

test.describe('provider connection', () => {
  for (const viewport of viewports) {
    test.describe(`at ${viewport.width}px`, () => {
      test.beforeEach(async ({ authenticatedPage: page }) => {
        await page.setViewportSize(viewport);
      });

      test('OpenRouter first setup discovers models before save and never tests automatically', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ previewResponses: [{ status: 200, json: { models: ['anthropic/claude-sonnet', 'openai/gpt-4o'] } }] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');
        await expect(settings.getByText(/Dotyczy Twojego konta w firmie/)).toContainText('TEST i PRODUKCJA');

        await settings.getByLabel('Klucz API OpenRouter').fill('sk-or-test');
        await settings.getByRole('button', { name: 'Pobierz listę modeli' }).click();
        await expect(settings.getByText('Dostępne modele: 2', { exact: true })).toBeVisible();
        expect(mock.previewBodies).toEqual([{ credential: 'sk-or-test' }]);

        await settings.getByLabel('Identyfikator modelu').fill('openai/gpt-4o');
        await settings.getByRole('button', { name: 'Zapisz połączenie' }).click();
        const verification = settings.getByRole('region', { name: 'Sprawdzenie' });
        await expect(verification.getByText('Zapisane — nie przetestowane')).toBeVisible();
        expect(mock.savedBodies).toEqual([{ model: 'openai/gpt-4o', credential: 'sk-or-test' }]);
        await expect(settings.getByLabel('Klucz API OpenRouter')).toHaveValue('');
        await expect(settings.getByText('Klucz zapisany. Wpisz nowy tylko, aby go zastąpić.')).toBeVisible();
        await expect(settings.getByText('Zapisano połączenie. Nie zostało jeszcze sprawdzone.')).toBeVisible();
        expect(mock.testRequests).toBe(0);

        await expect(verification.getByText('Test wysyła przykładowe pytanie bez danych firmy i może naliczyć koszt API.')).toBeVisible();
        await verification.getByRole('button', { name: 'Sprawdź połączenie (płatne żądanie)' }).click();
        await expect(verification.getByText('Przetestowane', { exact: true })).toBeVisible();
        expect(mock.testRequests).toBe(1);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-openrouter-${viewport.width}`);
      });

      test('the daily discovery limit disables discovery while manual model entry still saves', async ({ authenticatedPage: page }) => {
        const mock = createAdvisorMock({ previewResponses: [{ status: 429, json: { code: 'DAILY_LIMIT_REACHED' } }] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        await settings.getByLabel('Klucz API OpenRouter').fill('sk-or-test');
        await settings.getByRole('button', { name: 'Pobierz listę modeli' }).click();
        await expect(settings.getByRole('alert')).toHaveText(/Dzienny limit pobierania modeli został wykorzystany\. Spróbuj ponownie jutro/);
        await expect(settings.getByRole('button', { name: 'Ponów' })).toBeDisabled();
        expect(mock.previewBodies).toEqual([{ credential: 'sk-or-test' }]);

        await settings.getByLabel('Identyfikator modelu').fill('manual/model-identifier');
        await settings.getByRole('button', { name: 'Zapisz połączenie' }).click();
        await expect(settings.getByText('Zapisano połączenie. Nie zostało jeszcze sprawdzone.')).toBeVisible();
        expect(mock.savedBodies).toEqual([{ model: 'manual/model-identifier', credential: 'sk-or-test' }]);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      });

      test('a rejected key keeps the draft, manual model entry still saves and the rate limit asks to wait', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ previewResponses: [{ status: 502, json: { code: 'PROVIDER_ERROR' } }, { status: 429, json: { code: 'RATE_LIMITED' } }] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        await settings.getByLabel('Klucz API OpenRouter').fill('sk-or-wrong');
        await settings.getByRole('button', { name: 'Pobierz listę modeli' }).click();
        await expect(settings.getByText('Dostawca odrzucił żądanie. Sprawdź klucz API i spróbuj ponownie.')).toBeVisible();
        await expect(settings.getByLabel('Klucz API OpenRouter')).toHaveValue('sk-or-wrong');

        await settings.getByRole('button', { name: 'Ponów' }).click();
        await expect(settings.getByText('Poczekaj chwilę przed kolejnym żądaniem.')).toBeVisible();
        await expect(settings.getByRole('button', { name: 'Odczekaj chwilę' })).toBeDisabled();

        await settings.getByLabel('Identyfikator modelu').fill('manual/model-identifier');
        await settings.getByRole('button', { name: 'Zapisz połączenie' }).click();
        await expect(settings.getByText('Zapisano połączenie. Nie zostało jeszcze sprawdzone.')).toBeVisible();
        expect(mock.savedBodies).toEqual([{ model: 'manual/model-identifier', credential: 'sk-or-wrong' }]);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-rejected-key-${viewport.width}`);
        await expect(settings.getByRole('button', { name: 'Odśwież listę modeli' })).toBeEnabled({ timeout: 15_000 });
      });

      test('Ollama without an operator endpoint shows operator instructions and no save or URL input', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ allowedProviders: ['OLLAMA'], ollamaAvailable: false });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        await settings.getByRole('radio', { name: /Ollama/ }).check();
        await expect(settings.getByText('Operator nie skonfigurował jeszcze serwera Ollama ani dostępu do niego z serwera API.')).toBeVisible();
        await expect(settings.getByRole('button', { name: 'Zapisz model' })).toHaveCount(0);
        await expect(settings.getByRole('button', { name: 'Zapisz połączenie' })).toHaveCount(0);
        await expect(settings.locator('input[type="url"], input[type="password"]')).toHaveCount(0);
        await expect(settings.getByRole('textbox', { name: /adres|url/i })).toHaveCount(0);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-ollama-not-configured-${viewport.width}`);
      });

      test('Ollama reports unreachable and empty servers before saving a model without a key', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ allowedProviders: ['OLLAMA'], ollamaAvailable: true, previewResponses: [
          { status: 502, json: { code: 'OLLAMA_UNREACHABLE' } }, { status: 409, json: { code: 'OLLAMA_NO_MODELS' } }, { status: 200, json: { models: ['llama3.1:8b'] } },
        ] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        await settings.getByRole('radio', { name: /Ollama/ }).check();
        await settings.getByRole('button', { name: 'Pobierz modele z serwera' }).click();
        await expect(settings.getByText('Serwer Księgowy Vibe nie może połączyć się z Ollama. Spróbuj ponownie lub poproś operatora o sprawdzenie usługi.')).toBeVisible();
        await settings.getByRole('button', { name: 'Ponów' }).click();
        await expect(settings.getByText('Ollama nie ma zainstalowanych modeli. Poproś operatora o pobranie modelu.')).toBeVisible();
        await expect(settings.getByRole('button', { name: 'Zapisz model' })).toBeDisabled();
        await settings.getByRole('button', { name: 'Ponów' }).click();
        await expect(settings.getByText('Dostępne modele: 1', { exact: true })).toBeVisible();
        expect(mock.previewBodies).toEqual([{}, {}, {}]);

        await settings.getByLabel('Identyfikator modelu').fill('llama3.1:8b');
        await settings.getByRole('button', { name: 'Zapisz model' }).click();
        expect(mock.savedBodies).toEqual([{ model: 'llama3.1:8b' }]);
        expect(mock.testRequests).toBe(0);
        const verification = settings.getByRole('region', { name: 'Sprawdzenie' });
        await verification.getByRole('button', { name: 'Sprawdź połączenie (zasoby serwera)' }).click();
        await expect(verification.getByText('Przetestowane', { exact: true })).toBeVisible();
        expect(mock.testRequests).toBe(1);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-ollama-${viewport.width}`);
      });

      test('policy gates explain each blocker separately and lock the form, save and test', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ allowedProviders: ['OPENAI'], operatorEnabled: false, connections: [{ provider: 'OPENROUTER', model: 'saved/model', hasCredential: true, testedAt: null }] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        const readiness = settings.getByRole('region', { name: 'Gotowość' });
        await expect(readiness.getByText('Dostawca niedozwolony')).toBeVisible();
        await expect(readiness.getByText(/Administrator musi zezwolić na OpenRouter/)).toBeVisible();
        await expect(readiness.getByText('Wyłączony', { exact: true })).toBeVisible();
        await expect(readiness.getByText(/Operator nie włączył jeszcze doradcy na serwerze/)).toBeVisible();

        const verification = settings.getByRole('region', { name: 'Sprawdzenie' });
        await expect(verification.getByRole('button', { name: 'Sprawdź połączenie (płatne żądanie)' })).toBeDisabled();
        await expect(verification.getByText('Test jest niedostępny, dopóki operator nie włączy doradcy na serwerze.')).toBeVisible();

        // The operator switch locks the whole form: nothing can be saved or tested until it is turned on.
        await expect(settings.getByLabel('Identyfikator modelu')).toBeDisabled();
        await expect(settings.getByRole('button', { name: 'Zapisz połączenie' })).toBeDisabled();
        expect(mock.savedBodies).toEqual([]);
        expect(mock.testRequests).toBe(0);
        await expect(settings.getByText('Gotowe do pytań.')).toHaveCount(0);
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-policy-gates-${viewport.width}`);
      });

      test('disconnect asks for confirmation, deletes the saved connection and returns focus to readiness', async ({ authenticatedPage: page }, testInfo) => {
        const mock = createAdvisorMock({ connections: [{ provider: 'OPENROUTER', model: 'saved/model', hasCredential: true, testedAt: '2026-10-01T10:00:00.000Z' }] });
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');

        await settings.getByRole('region', { name: 'Sprawdzenie' }).getByRole('button', { name: 'Odłącz' }).click();
        const dialog = page.getByRole('dialog', { name: 'Odłączyć OpenRouter?' });
        await expect(dialog.getByRole('button', { name: 'Anuluj' })).toBeFocused();
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
        await screenshotAdvisorSection(page, testInfo, `advisor-disconnect-${viewport.width}`, dialog);

        await dialog.getByRole('button', { name: 'Anuluj' }).click();
        await expect(dialog).toBeHidden();
        expect(mock.deletedProviders).toEqual([]);

        await settings.getByRole('region', { name: 'Sprawdzenie' }).getByRole('button', { name: 'Odłącz' }).click();
        await dialog.getByRole('button', { name: 'Odłącz' }).click();
        await expect(dialog).toBeHidden();
        expect(mock.deletedProviders).toEqual(['OPENROUTER']);
        await expect(settings.getByRole('region', { name: 'Gotowość' }).getByText('Nieskonfigurowane')).toBeVisible();
        await expect(settings.getByRole('heading', { name: 'Gotowość' })).toBeFocused();
        await expect(settings.getByText('Odłączono OpenRouter. Historia rozmów pozostaje.')).toBeVisible();
      });

      test('the advisor dock links to the advisor settings section', async ({ authenticatedPage: page }) => {
        const mock = createAdvisorMock({});
        await routeAdvisorApi(page, mock);
        await page.goto('/dashboard/settings?section=advisor');
        const settings = page.locator('#settings-panel');
        await settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ }).click();
        await expect(settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ })).toHaveAttribute('aria-pressed', 'true');
        await page.goto('/dashboard');
        const isDesktop = viewport.width >= 1280;
        const trigger = isDesktop ? page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }) : page.locator('nav').getByRole('button', { name: 'Otwórz doradcę' });
        await trigger.click();
        const panel = isDesktop ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
        const link = panel.getByRole('link', { name: 'Otwórz ustawienia Doradcy' });
        await expect(link).toHaveAttribute('href', '/dashboard/settings?section=advisor');
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);

        await link.click();
        await expect(page).toHaveURL(/\/dashboard\/settings\?section=advisor$/);
        await expect(settings.getByRole('button', { name: /Doradca w Księgowym Vibe/ })).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#settings-panel').getByRole('heading', { name: 'Gotowość' })).toBeVisible();
        await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      });
    });
  }
});

test.describe('connectors', () => {
  const day = 24 * 60 * 60 * 1000;
  const daysFromNow = (days: number) => new Date(Date.now() + days * day).toISOString();

  async function openExternalMode(page: Page, viewport: { width: number; height: number }, connectors: unknown, allowedConnectors = ['CHATGPT', 'CLAUDE']) {
    await page.setViewportSize(viewport);
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/settings')) return route.fulfill({ json: {
        enabled: true, canManagePolicy: false, canManageConnections: true, operatorEnabled: true, allowedProviders: ['OPENAI'], allowedConnectors,
        retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0, connections: [],
      } });
      if (path.endsWith('/connectors') && route.request().method() === 'GET') return route.fulfill({ json: connectors });
      return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
    });
    await page.goto('/dashboard/settings?section=advisor');
    const settings = page.locator('#settings-panel');
    await settings.getByRole('button', { name: /Rozmowa w ChatGPT lub Claude/ }).click();
    return settings;
  }

  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`grant keeps consent bound to host, environment and days at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      let grantRequest: { environment: string | undefined; body: unknown } | undefined;
      const connectors = { endpoint: 'https://api.example.com/advisor/mcp', clients: ['CHATGPT', 'CLAUDE'], grants: [] as unknown[] };
      const settings = await openExternalMode(page, viewport, connectors);
      await page.route('**/companies/test-company-id/advisor/connectors/CHATGPT', async (route) => {
        grantRequest = { environment: route.request().headers()['x-ksef-environment'], body: route.request().postDataJSON() };
        return route.fulfill({ json: { expiresAt: daysFromNow(7) } });
      });

      await expect(settings.getByText(/To ChatGPT przechowuje historię i formułuje odpowiedzi/)).toBeVisible();
      await expect(settings.getByText(/nie otrzymuje hasła ani tokenu/)).toBeVisible();
      await expect(settings.getByText(/Abonament ChatGPT nie opłaca/)).toBeVisible();
      await expect(settings.getByText('Identyfikator firmy do rozmowy')).toHaveCount(0);
      await expect(settings.getByText(/client|callback/i)).toHaveCount(0);
      const grant = settings.getByRole('button', { name: 'Zezwól na odczyt' });
      const consent = settings.getByRole('checkbox', { name: /Zezwalam ChatGPT na odczyt kwot i numerów dokumentów firmy .* w środowisku TEST przez 7 dni/ });
      await expect(grant).toHaveAttribute('aria-disabled', 'true');
      await expect(settings.getByText('Zaznacz zgodę, aby udzielić dostępu.')).toBeVisible();

      await consent.check();
      await expect(grant).toBeEnabled();
      await settings.getByRole('radio', { name: 'PRODUKCJA' }).check();
      await expect(settings.getByRole('checkbox', { name: /w środowisku PRODUKCJA przez 7 dni/ })).not.toBeChecked();
      await expect(grant).toBeDisabled();
      await settings.getByRole('radio', { name: '30 dni' }).check();
      await settings.getByRole('radio', { name: '7 dni' }).check();
      await settings.getByRole('checkbox', { name: /w środowisku PRODUKCJA przez 7 dni/ }).check();
      await grant.click();
      await expect(settings.getByText(/Udzielono zgody do/)).toBeVisible();
      expect(grantRequest).toEqual({ environment: 'PRODUCTION', body: { days: 7 } });
      await expect(settings.getByRole('heading', { name: 'Dodaj konektor w ChatGPT' })).toBeFocused();

      await expect(settings.getByLabel('Adres konektora (MCP)')).toHaveValue('https://api.example.com/advisor/mcp');
      await expect(settings.getByText('Dodaj połączenie w przeglądarce. Dodawanie z aplikacji mobilnej nie zostało potwierdzone.')).toBeVisible();
      await expect(settings.getByText(/tym samym kontem Księgowy Vibe/)).toBeVisible();
      await expect(settings.getByText('Zweryfikowane', { exact: true }).first()).toBeVisible();
      await settings.getByText('Ograniczenia konta i administratora').click();
      await expect(settings.getByText(/Plan Business: tryb dewelopera włącza administrator/)).toBeVisible();
      await settings.getByText('Instalacja własna: wymagany publiczny HTTPS').click();
      await expect(settings.getByText(/Adresy localhost, sieci firmowej i VPN nie zadziałają/)).toBeVisible();
      await settings.getByRole('button', { name: 'Kopiuj adres' }).click();
      await expect(settings.getByRole('button', { name: 'Skopiowano' })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('https://api.example.com/advisor/mcp');
      const openHost = settings.getByRole('link', { name: /Otwórz ChatGPT/ });
      await expect(openHost).toHaveAttribute('target', '_blank');
      await expect(openHost).toHaveAttribute('rel', /noopener/);

      await settings.getByRole('radio', { name: 'Claude' }).check();
      await expect(settings.getByRole('heading', { name: 'Dodaj konektor w Claude' })).toBeVisible();
      await expect(settings.getByText(/Dostosuj → Łączniki → Dodaj własny łącznik/)).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      await screenshotAdvisorSection(page, testInfo, `connectors-grant-${viewport.width}`);
    });

    test(`grant rows show server status, revoke with confirmation and re-grant without a request at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
      const requests: string[] = [];
      let revokeEnvironment: string | undefined;
      const connectors = { endpoint: 'https://api.example.com/advisor/mcp', clients: ['CHATGPT', 'CLAUDE'], grants: [
        { client: 'CHATGPT', environment: 'TEST', status: 'ACTIVE', expiresAt: daysFromNow(2), lastUsedAt: '2026-10-01T08:30:00.000Z', revokedAt: null },
        { client: 'CLAUDE', environment: 'TEST', status: 'WAITING', expiresAt: daysFromNow(20), lastUsedAt: null, revokedAt: null },
        { client: 'CHATGPT', environment: 'PRODUCTION', status: 'EXPIRED', expiresAt: '2026-09-01T12:00:00.000Z', lastUsedAt: null, revokedAt: null },
        { client: 'CLAUDE', environment: 'PRODUCTION', status: 'REVOKED', expiresAt: daysFromNow(10), lastUsedAt: null, revokedAt: '2026-09-28T12:00:00.000Z' },
      ] };
      const settings = await openExternalMode(page, viewport, connectors);
      page.on('request', (request) => { if (request.method() !== 'GET' && request.url().includes('/advisor/')) requests.push(`${request.method()} ${new URL(request.url()).pathname}`); });
      await page.route('**/companies/test-company-id/advisor/connectors/CHATGPT', async (route) => {
        revokeEnvironment = route.request().headers()['x-ksef-environment'];
        connectors.grants[0] = { ...connectors.grants[0], status: 'REVOKED', revokedAt: '2026-10-01T12:00:00.000Z' } as typeof connectors.grants[number];
        return route.fulfill({ json: { revoked: true } });
      });

      const list = settings.getByRole('region', { name: 'Moje zgody' });
      const row = (host: string, environment: string) => list.getByRole('listitem').filter({ hasText: host }).filter({ hasText: environment });
      await expect(row('ChatGPT', 'TEST').getByText('Aktywna', { exact: true })).toBeVisible();
      await expect(row('ChatGPT', 'TEST').getByText('Wygasa wkrótce')).toBeVisible();
      await expect(row('ChatGPT', 'TEST').getByText(/Ostatnie użycie:/)).toBeVisible();
      await expect(row('Claude', 'TEST').getByText('Bez autoryzowanego odczytu')).toBeVisible();
      await expect(row('Claude', 'TEST').getByText('Wygasa wkrótce')).toHaveCount(0);
      await expect(row('Claude', 'TEST').getByText(/Ostatnie użycie:/)).toHaveCount(0);
      await expect(row('ChatGPT', 'PRODUKCJA').getByText('Wygasła', { exact: true })).toBeVisible();
      await expect(row('Claude', 'PRODUKCJA').getByText('Cofnięta', { exact: true })).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      await screenshotAdvisorSection(page, testInfo, `connectors-grants-${viewport.width}`);

      await row('ChatGPT', 'TEST').getByRole('button', { name: 'Cofnij zgodę' }).click();
      const dialog = page.getByRole('dialog', { name: 'Cofnąć zgodę dla ChatGPT?' });
      await expect(dialog.getByRole('button', { name: 'Anuluj' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Cofnij zgodę' }).click();
      await expect(dialog).toBeHidden();
      expect(requests).toEqual(['DELETE /companies/test-company-id/advisor/connectors/CHATGPT']);
      expect(revokeEnvironment).toBe('TEST');
      await expect(row('ChatGPT', 'TEST').getByText('Cofnięta', { exact: true })).toBeVisible();
      await expect(settings.getByRole('heading', { name: 'Gotowość' })).toBeFocused();

      requests.length = 0;
      await row('ChatGPT', 'PRODUKCJA').getByRole('button', { name: 'Zezwól ponownie' }).click();
      await expect(settings.getByRole('radio', { name: 'PRODUKCJA' })).toBeChecked();
      await expect(settings.getByRole('radio', { name: 'ChatGPT' })).toBeChecked();
      const consent = settings.getByRole('checkbox', { name: /Zezwalam ChatGPT/ });
      await expect(consent).not.toBeChecked();
      await expect(consent).toBeFocused();
      // With an earlier grant for this host and environment the submit button reads "Zezwól ponownie".
      await expect(settings.getByRole('button', { name: 'Zezwól ponownie', disabled: true })).toBeVisible();
      expect(requests).toEqual([]);
    });

    test(`connector blockers explain why a grant is unavailable at ${viewport.width}px`, async ({ authenticatedPage: page }, testInfo) => {
      const settings = await openExternalMode(page, viewport, { endpoint: null, clients: [], grants: [] });
      await expect(settings.getByText('Połączenie z ChatGPT lub Claude jest niedostępne: operator musi skonfigurować serwer autoryzacji i publiczny adres HTTPS.').first()).toBeVisible();
      await expect(settings.getByRole('button', { name: 'Zezwól na odczyt' })).toHaveCount(0);
      await page.unroute('**/companies/test-company-id/advisor/**');

      const restricted = await openExternalMode(page, viewport, { endpoint: 'https://api.example.com/advisor/mcp', clients: ['CHATGPT'], grants: [] }, ['CLAUDE']);
      await expect(restricted.getByRole('radio', { name: /Claude/ })).toBeDisabled();
      await expect(restricted.getByText('Niedostępny')).toBeVisible();
      await expect(restricted.getByText('Niedozwolony', { exact: true })).toBeVisible();
      await restricted.getByRole('checkbox', { name: /Zezwalam ChatGPT/ }).check();
      await expect(restricted.getByRole('button', { name: 'Zezwól na odczyt' })).toBeDisabled();
      await expect(restricted.getByText('Administrator firmy musi zezwolić na ChatGPT.')).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', viewport.width);
      await screenshotAdvisorSection(page, testInfo, `connectors-blockers-${viewport.width}`);
    });
  }
});
