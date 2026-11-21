import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';
import {
  advisorAnswer, advisorInsight, advisorSettings, askQuestion, expectVisual, historyConversations, openAdvisor, openExplainOnInvoice,
  prepareVisualPage, routeAdvisorApi, visualNow, type VisualTheme, type VisualWidth,
} from './fixtures/advisor-visual';

// Baselines exist only for the `chromium-linux` project (VISUAL_REGRESSION=true); see PLAYWRIGHT_TESTS_SPEC.md.
test.use({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
// The Next dev server compiles routes on first hit, which exceeds the 30s default on a busy host.
test.setTimeout(90_000);

interface Capture { target: Page | Locator; fullPage?: boolean }
type State = (page: Page, width: VisualWidth) => Promise<Capture>;

const invoiceEvidence = (id: string, title: string, gross: string) => ({ id, kind: 'outgoing' as const, title, status: 'ISSUED', currency: 'PLN', gross, vat: '0.00', updatedAt: '2026-10-12T08:00:00.000Z' });
const taxSource = (reviewExpiresAt: string) => ({ id: 'vat-act', title: 'Ustawa o VAT', url: 'https://example.org/vat', section: 'art. 41 ust. 1', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31',
  reviewedAt: '2026-09-01', reviewExpiresAt, reviewedBy: 'ai:OPENAI/model-a+ai:ANTHROPIC/model-b', reviewMethod: 'ai' as const, excerpt: 'Stawka podstawowa podatku wynosi 23%.' });
const aiDisclaimer = 'Odpowiedź przygotowana przez AI na podstawie źródeł sprawdzonych wyłącznie przez AI. To nie jest porada podatkowa.';

const fullAnswer = advisorAnswer({
  shortAnswer: 'Wystawione dokumenty z października dają 12 300,00 zł brutto', explanation: 'Sumy obejmują faktury wystawione w wybranym miesiącu. To zapis dokumentów, nie zobowiązanie podatkowe.',
  disclaimer: aiDisclaimer, sources: [taxSource('2026-12-31')],
  calculations: [{ currency: 'PLN', issuedGross: '12300.00', issuedVat: '2300.00', acceptedGross: '9840.00', rejectedGross: '615.00', invoiceCount: 6 }],
  evidence: [invoiceEvidence('invoice-1', 'FV/2026/10/001', '4920.00'), invoiceEvidence('invoice-2', 'FV/2026/10/002', '3690.00'), invoiceEvidence('invoice-3', 'FV/2026/10/003', '3690.00')],
});

async function ask(page: Page, width: VisualWidth, message: Parameters<typeof routeAdvisorApi>[1]) {
  await routeAdvisorApi(page, message);
  const panel = await openAdvisor(page, width);
  await askQuestion(panel, 'Co wynika z dokumentów?', { includeRecords: true });
  return panel;
}

const answered = (answer: ReturnType<typeof advisorAnswer>, detailTurns?: unknown[]): State => async (page, width) => {
  const panel = await ask(page, width, { message: { answer }, ...(detailTurns ? { detailTurns } : {}) });
  await expect(panel.getByRole('heading', { name: answer.shortAnswer })).toBeVisible();
  return { target: panel };
};

const failed = (message: { status: number; json: Record<string, unknown> }, visibleText: string | RegExp): State => async (page, width) => {
  const panel = await ask(page, width, { message });
  await expect(panel.getByText(visibleText)).toBeVisible();
  return { target: panel };
};

const emptyPanel: State = async (page, width) => {
  await routeAdvisorApi(page);
  const panel = await openAdvisor(page, width);
  await expect(panel.getByText('Propozycja tylko wypełnia pole', { exact: false })).toBeVisible();
  return { target: panel };
};

const blocked = (settings: Parameters<typeof advisorSettings>[0], reason?: string): State => async (page, width) => {
  await routeAdvisorApi(page, { settings });
  const panel = await openAdvisor(page, width);
  await expect(panel.locator('#advisor-blocker-reason')).toBeVisible();
  if (reason) await expect(panel.locator('#advisor-blocker-reason')).toContainText(reason);
  return { target: panel };
};

const openHistory = async (page: Page, width: VisualWidth, mock: Parameters<typeof routeAdvisorApi>[1]) => {
  await routeAdvisorApi(page, mock);
  const panel = await openAdvisor(page, width);
  await panel.getByRole('button', { name: 'Historia rozmów' }).click();
  return panel;
};

const confirmDeletion = async (page: Page, width: VisualWidth, deleteStatus?: number) => {
  const panel = await openHistory(page, width, { conversations: historyConversations, ...(deleteStatus ? { deleteStatus } : {}) });
  await panel.getByRole('button', { name: 'Usuń rozmowę: Czy faktura wymaga NIP nabywcy?' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Usunąć rozmowę?' })).toBeVisible();
  return page.locator('dialog[open]:not(#advisor-panel)');
};

const openPage = async (page: Page, mock: Parameters<typeof routeAdvisorApi>[1] = {}) => {
  await routeAdvisorApi(page, mock);
  await page.goto('/dashboard/advisor');
  // The loading line disappears only after hydration and the settings request.
  await expect(page.getByText('Przygotowuję odpowiedź…', { exact: true })).toHaveCount(0);
};

const states: Record<string, State> = {
  'shell-dock-empty': emptyPanel,
  'shell-drawer-empty': emptyPanel,
  'shell-sheet-empty': emptyPanel,

  'conv-loading': async (page, width) => {
    const panel = await ask(page, width, { message: 'hold' });
    await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
    return { target: panel };
  },
  // The stream announces progress and then stays silent, which a route fulfillment cannot express.
  'conv-waiting': async (page, width) => {
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        if (!url.endsWith('/messages') || init?.method !== 'POST') return nativeFetch(input, init);
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: status\ndata: {"stage":"working"}\n\n'));
            init.signal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
          },
        });
        return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
      };
    });
    const panel = await ask(page, width, {});
    await expect(panel.getByText('Dostawca przygotowuje odpowiedź…')).toBeVisible();
    await page.clock.setFixedTime(new Date(new Date(visualNow).getTime() + 24_000));
    await expect(panel.getByText('0:24 / 1:00')).toBeVisible();
    return { target: panel };
  },
  'conv-cancelled': async (page, width) => {
    const panel = await ask(page, width, { message: 'hold' });
    await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
    await panel.getByRole('button', { name: 'Anuluj' }).click();
    await expect(panel.getByText('Przerwano odpowiedź.')).toBeVisible();
    return { target: panel };
  },

  'error-provider-retry': failed({ status: 502, json: { code: 'PROVIDER_UNAVAILABLE' } }, 'Dostawca nie odpowiedział.'),
  'error-credentials': failed({ status: 502, json: { code: 'PROVIDER_INVALID_CREDENTIALS' } }, 'Dostawca odrzucił klucz API OpenAI API.'),
  'error-quota-countdown': failed({ status: 429, json: { code: 'RATE_LIMITED', retryAfterSeconds: 45 } }, 'Spróbuj ponownie za 45 s.'),

  'answer-full': async (page, width) => {
    // Tall dock so the whole answer fits; the mobile sheet is capped by the product at 760px and scrolls.
    if (width === 1440) await page.setViewportSize({ width, height: 1300 });
    const panel = await answered(fullAnswer)(page, width).then((capture) => capture.target as Locator);
    await panel.getByText('Dokumenty źródłowe (3)', { exact: true }).click();
    await panel.getByText('Źródła przepisów (1)', { exact: true }).click();
    return { target: panel };
  },
  'answer-insufficient': answered(advisorAnswer({ status: 'insufficient_evidence', shortAnswer: 'Nie mogę potwierdzić sum dla tego okresu', explanation: 'W wybranym miesiącu brakuje zapisanych dokumentów, na których mogłaby oprzeć się odpowiedź.',
    assumptions: ['Brałem pod uwagę tylko faktury wystawione w tej firmie.'], provenance: { ...advisorAnswer().provenance, recordsIncluded: false } })),
  'answer-declined': answered(advisorAnswer({ status: 'declined', shortAnswer: 'To pytanie wykracza poza podatki i księgowość.', explanation: 'Mogę wyjaśnić zasady VAT, PIT i CIT oraz podsumować zapisane faktury.',
    provenance: { ...advisorAnswer().provenance, recordsIncluded: false, sourceVersion: 'not-applicable' } })),
  'answer-clarification-reply': async (page, width) => {
    const answer = advisorAnswer({ status: 'needs_clarification', shortAnswer: 'Potrzebuję jednej informacji', explanation: 'Bez niej nie wskażę właściwej stawki.',
      questions: ['Czy nabywca jest podatnikiem VAT z siedzibą w UE?'], provenance: { ...advisorAnswer().provenance, recordsIncluded: false } });
    const turn = { id: 'server-turn', question: 'Co wynika z dokumentów?', status: 'COMPLETED', answer, replyToTurnId: null, createdAt: visualNow };
    const panel = await answered(answer, [turn])(page, width).then((capture) => capture.target as Locator);
    await expect(panel.getByText('Odpowiedź na pytanie doradcy')).toBeVisible();
    return { target: panel };
  },
  // An expired review only appears on stored answers, so the state replays a turn from the history list.
  'answer-source-stale': async (page, width) => {
    const answer = advisorAnswer({ shortAnswer: 'Stawka podstawowa VAT wynosi 23%', explanation: 'Podstawowa stawka obowiązuje w większości przypadków.', disclaimer: aiDisclaimer,
      sources: [taxSource('2026-09-30')], provenance: { ...advisorAnswer().provenance, recordsIncluded: false, sourceVersion: 'reviewed-2026', sourceReviewMethod: 'ai' } });
    const turn = { id: 'stored-turn', question: 'Jaka jest stawka VAT?', status: 'COMPLETED', answer, replyToTurnId: null, createdAt: visualNow };
    const panel = await openHistory(page, width, { conversations: historyConversations, detailTurns: [turn] });
    await panel.getByText('Czy faktura wymaga NIP nabywcy?').click();
    await expect(panel.getByText('Z historii', { exact: true })).toBeVisible();
    return { target: panel };
  },

  'composer-seed-unchosen': async (page, width) => {
    await routeAdvisorApi(page);
    const panel = await openExplainOnInvoice(page, width);
    await expect(panel.getByRole('group', { name: /Wybrany dokument/ })).toBeVisible();
    return { target: panel };
  },
  'composer-tax-unavailable': async (page, width) => {
    await routeAdvisorApi(page, { taxCovered: false });
    const panel = await openAdvisor(page, width);
    await expect(panel.getByText('Brak sprawdzonych przez AI źródeł podatkowych dla tego okresu.', { exact: false })).toBeVisible();
    return { target: panel };
  },
  'composer-untested': async (page, width) => {
    await routeAdvisorApi(page, { settings: { connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] } });
    const panel = await openAdvisor(page, width);
    await expect(panel.locator('#advisor-untested')).toBeVisible();
    return { target: panel };
  },
  'composer-records-unavailable-month': failed({ status: 422, json: { code: 'RECORDS_UNAVAILABLE' } }, 'Brak dokumentów dla 2026-10. Nie wysłano pytania do dostawcy.'),

  'blocker-company': blocked({ enabled: false }),
  'blocker-viewer': blocked({ canManageConnections: false, connections: [] }, 'Twoja rola w tej firmie nie pozwala zapisać połączenia z dostawcą.'),
  revoked: async (page, width) => {
    await routeAdvisorApi(page, { settingsFailure: { status: 403, json: { code: 'ACCESS_DENIED' } } });
    const panel = await openAdvisor(page, width);
    await expect(panel.getByText('Nie masz już dostępu do tej firmy.')).toBeVisible();
    return { target: panel };
  },

  'history-list': async (page, width) => {
    const panel = await openHistory(page, width, { conversations: historyConversations });
    await expect(panel.getByRole('button', { name: /Czy faktura wymaga NIP/ }).first()).toBeVisible();
    await expect(panel.getByText('Rozmowy są usuwane po 30 dniach', { exact: false })).toBeVisible();
    return { target: panel };
  },
  'history-empty': async (page, width) => {
    const panel = await openHistory(page, width, { conversations: [] });
    await expect(panel.getByRole('heading', { name: 'Brak rozmów' })).toBeVisible();
    return { target: panel };
  },
  'delete-confirm': async (page, width) => ({ target: await confirmDeletion(page, width) }),
  'delete-error': async (page, width) => {
    const dialog = await confirmDeletion(page, width, 500);
    await dialog.getByRole('button', { name: 'Usuń rozmowę', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Nie udało się usunąć rozmowy');
    return { target: dialog };
  },

  'page-empty-briefing': async (page) => {
    await openPage(page, { conversations: historyConversations });
    await expect(page.getByRole('heading', { name: 'Podsumowanie okresu' })).toBeVisible();
    // The server renders the rail countdown with the real date; wait for hydration to apply the pinned clock.
    await expect(page.getByText('Termin za 10 dni')).toBeVisible();
    return { target: page, fullPage: true };
  },
  'page-answered': async (page) => {
    await openPage(page, { message: { answer: fullAnswer } });
    await askQuestion(page, 'Co wynika z dokumentów?', { includeRecords: true });
    await expect(page.getByRole('heading', { name: fullAnswer.shortAnswer })).toBeVisible();
    return { target: page.locator('#dashboard-content') };
  },
  'page-empty': async (page) => {
    await openPage(page);
    await expect(page.getByRole('heading', { name: 'Podsumowanie okresu' })).toBeVisible();
    return { target: page.locator('#dashboard-content') };
  },
  'page-history-toggled': async (page) => {
    await openPage(page, { conversations: historyConversations });
    await page.getByRole('button', { name: 'Historia', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Historia rozmów' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Czy faktura wymaga NIP/ }).first()).toBeVisible();
    return { target: page.locator('#dashboard-content') };
  },

  'explain-header-outgoing': async (page, width) => {
    await routeAdvisorApi(page);
    const panel = await openExplainOnInvoice(page, width);
    await expect(panel).toContainText('DEMO-INV-008');
    return { target: panel };
  },
  'explain-busy-reason': async (page, width) => {
    await routeAdvisorApi(page, { message: 'hold' });
    const panel = await openExplainOnInvoice(page, width);
    await panel.getByRole('radio', { name: /Dołącz ten dokument/ }).click();
    await panel.getByRole('button', { name: 'Zapytaj', exact: true }).click();
    const reason = page.locator('#advisor-explain-busy');
    await expect(reason).toBeVisible();
    // The sheet is modal and covers the button; the request keeps running while only the sheet is hidden.
    await page.addStyleTag({ content: '#advisor-panel{visibility:hidden!important} #advisor-panel::backdrop{background:transparent!important}' });
    return { target: reason.locator('xpath=..') };
  },

  'insight-strip': async (page) => {
    await routeAdvisorApi(page, { insight: advisorInsight });
    await page.goto('/dashboard');
    const strip = page.getByRole('complementary', { name: 'Wskazówka doradcy' });
    await expect(strip).toBeVisible();
    return { target: strip };
  },
  'insight-undo': async (page) => {
    await routeAdvisorApi(page, { insight: advisorInsight });
    await page.goto('/dashboard');
    await page.getByRole('complementary', { name: 'Wskazówka doradcy' }).getByRole('button', { name: 'Ukryj wskazówkę' }).click();
    const undo = page.getByRole('status').filter({ hasText: 'Ukryto wskazówkę' });
    await expect(undo).toBeVisible();
    return { target: undo };
  },

  'settings-modeA-admin': async (page, width) => {
    await routeAdvisorApi(page, { settings: advisorSettings({ canManagePolicy: true, allowedProviders: ['OPENROUTER', 'OPENAI', 'ANTHROPIC'], allowedConnectors: ['CHATGPT', 'CLAUDE'] }) });
    await page.goto('/dashboard/settings?section=advisor');
    const settings = page.locator('#settings-panel');
    await expect(settings.getByRole('heading', { name: 'Gotowość' })).toBeVisible();
    // The section scrolls inside the app shell, so the viewport grows to its height before the capture.
    const sectionHeight = await settings.evaluate((element) => element.scrollHeight);
    await page.setViewportSize({ width, height: sectionHeight + 400 });
    return { target: settings };
  },
};

const shots: Array<[state: string, theme: VisualTheme, width: VisualWidth]> = [
  ['shell-dock-empty', 'light', 1440], ['shell-dock-empty', 'dark', 1440], ['shell-drawer-empty', 'light', 1024], ['shell-sheet-empty', 'light', 390],
  ['conv-loading', 'light', 1440], ['conv-waiting', 'light', 390], ['conv-cancelled', 'light', 1440],
  ['error-provider-retry', 'light', 1440], ['error-provider-retry', 'dark', 390], ['error-credentials', 'light', 1440], ['error-quota-countdown', 'light', 390],
  ['answer-full', 'light', 1440], ['answer-full', 'dark', 1440], ['answer-full', 'light', 390], ['answer-insufficient', 'light', 1440], ['answer-declined', 'dark', 1440],
  ['answer-clarification-reply', 'light', 390], ['answer-source-stale', 'light', 1440],
  ['composer-seed-unchosen', 'light', 1024], ['composer-tax-unavailable', 'light', 1440], ['composer-untested', 'light', 1440], ['composer-records-unavailable-month', 'light', 390],
  ['blocker-company', 'light', 1440], ['blocker-viewer', 'dark', 390], ['revoked', 'light', 1440],
  ['history-list', 'light', 1440], ['history-list', 'dark', 390], ['history-empty', 'light', 390],
  ['delete-confirm', 'light', 1440], ['delete-confirm', 'light', 390], ['delete-error', 'dark', 1440],
  ['page-empty-briefing', 'light', 1440], ['page-empty-briefing', 'dark', 1440], ['page-answered', 'light', 1024], ['page-empty', 'light', 390], ['page-history-toggled', 'light', 390],
  ['explain-header-outgoing', 'light', 1440], ['explain-busy-reason', 'light', 390],
  ['insight-strip', 'light', 1440], ['insight-strip', 'light', 390], ['insight-undo', 'light', 1440], ['insight-undo', 'light', 390],
  ['settings-modeA-admin', 'light', 1440],
];

for (const [stateName, theme, width] of shots) {
  test(`visual: advisor-${stateName} ${theme} ${width}`, async ({ authenticatedPage: page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-linux');
    await prepareVisualPage(page, theme, width);
    const capture = await states[stateName](page, width);
    await expectVisual(capture.target, stateName, theme, width, capture.fullPage ? { fullPage: true } : {});
  });
}
