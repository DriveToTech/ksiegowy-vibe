import path from 'node:path';
import type { Locator, Page } from '@playwright/test';
import type { AdvisorAnswer, AdvisorSettings } from '../../../../packages/types/src/advisor';
import { expect } from './auth';

// Every advisor visual runs at this instant: the month is 2026-10 and relative dates cannot drift between runs.
export const visualNow = '2026-10-15T10:00:00.000Z';

export type VisualTheme = 'light' | 'dark';
export type VisualWidth = 1440 | 1024 | 390;

const viewportHeights: Record<VisualWidth, number> = { 1440: 1000, 1024: 900, 390: 844 };

const stabilizingStylePath = path.join(__dirname, 'advisor-visual.css');

export const conversation = { id: 'conversation', title: 'Podsumowanie października', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-10-14T09:12:00.000Z' };

export const historyConversations = [
  { id: 'first', title: 'Czy faktura wymaga NIP nabywcy?', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-10-14T09:12:00.000Z' },
  { id: 'second', title: 'Podsumowanie września: sumy według waluty, braki i dokumenty wymagające sprawdzenia przed zamknięciem miesiąca', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-10-07T09:12:00.000Z' },
  { id: 'third', title: 'Dlaczego faktura została odrzucona?', provider: 'ANTHROPIC', model: 'claude-model', createdAt: '2026-09-28T09:12:00.000Z' },
];

export const advisorInsight = {
  key: 'rejected-invoice', version: 1, title: 'Odrzucona faktura KSeF', description: 'Sprawdź dokument źródłowy i wyślij go ponownie po poprawie danych.',
  evidence: [{ kind: 'outgoing', id: 'accepted-invoice-id', title: 'FV/2026/10/003' }],
};

export function advisorSettings(overrides: Partial<AdvisorSettings> = {}): AdvisorSettings {
  return { enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [], retentionDays: 30,
    ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: '2026-10-01T10:00:00.000Z' }], ...overrides };
}

export function advisorAnswer(overrides: Partial<AdvisorAnswer> = {}): AdvisorAnswer {
  return { status: 'answered', shortAnswer: 'Odpowiedź', explanation: 'Wyjaśnienie.', assumptions: [], questions: [], evidence: [], calculations: [], sources: [],
    provenance: { companyId: 'test-company-id', environment: 'TEST', period: '2026-10', provider: 'OPENAI', model: 'configured-model', generatedAt: '2026-10-15T09:30:00.000Z',
      recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'none', sourceReviewMethod: 'not-applicable' }, ...overrides };
}

type MessageMock = { answer: AdvisorAnswer } | { status: number; json: Record<string, unknown> } | 'hold';

export interface AdvisorApiMock {
  settings?: Partial<AdvisorSettings>;
  /** Answers the settings request with an error instead (access revoked). */
  settingsFailure?: { status: number; json: Record<string, unknown> };
  /** When set, `taxSourceCoverage` is returned for the requested period with this value. */
  taxCovered?: boolean;
  conversations?: typeof historyConversations;
  message?: MessageMock;
  /** Turns returned by the conversation detail request, which the UI reads after a clarification. */
  detailTurns?: unknown[];
  deleteStatus?: number;
  insight?: typeof advisorInsight | null;
}

export async function routeAdvisorApi(page: Page, mock: AdvisorApiMock = {}) {
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/settings')) {
      if (mock.settingsFailure) return route.fulfill(mock.settingsFailure);
      const period = url.searchParams.get('period');
      return route.fulfill({ json: advisorSettings({ ...mock.settings, ...(period && mock.taxCovered !== undefined ? { taxSourceCoverage: { period, covered: mock.taxCovered, sourceVersion: 'reviewed-2026' } } : {}) }) });
    }
    if (path.endsWith('/connectors')) return route.fulfill({ json: { endpoint: null, clients: [], grants: [] } });
    if (path.endsWith('/insights')) return route.fulfill({ json: mock.insight ?? null });
    if (path.endsWith('/messages')) {
      const message = mock.message;
      // A request that never answers keeps the conversation in its "sending" state.
      if (message === 'hold' || !message) return new Promise<void>(() => undefined);
      if ('answer' in message) return route.fulfill({ contentType: 'text/event-stream', body: `event: answer\ndata: ${JSON.stringify(message.answer)}\n\nevent: done\ndata: {}\n\n` });
      return route.fulfill(message);
    }
    if (request.method() === 'DELETE') return mock.deleteStatus && mock.deleteStatus !== 204 ? route.fulfill({ status: mock.deleteStatus, json: { code: 'ADVISOR_ERROR' } }) : route.fulfill({ status: 204 });
    if (path.endsWith('/conversations')) return route.fulfill({ json: request.method() === 'POST' ? conversation : mock.conversations ?? [] });
    if (path.includes('/conversations/')) return route.fulfill({ json: { ...conversation, turns: mock.detailTurns ?? [] } });
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
}

export async function prepareVisualPage(page: Page, theme: VisualTheme, width: VisualWidth) {
  await page.setViewportSize({ width, height: viewportHeights[width] });
  await page.clock.setFixedTime(visualNow);
  await page.addInitScript((selectedTheme) => localStorage.setItem('ksiegowy-theme', selectedTheme), theme);
}

export function advisorPanel(page: Page, width: VisualWidth) {
  return width >= 1280 ? page.getByRole('complementary', { name: 'Doradca' }) : page.getByRole('dialog', { name: 'Doradca' });
}

/** Retries the click until hydration has attached the handler, then waits for the settings to finish loading. */
export async function openAdvisorFrom(page: Page, width: VisualWidth, path: string, trigger: (page: Page) => Locator) {
  await page.goto(path);
  const panel = advisorPanel(page, width);
  await expect(async () => {
    await trigger(page).click();
    await expect(panel).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(panel.getByText('Przygotowuję odpowiedź…', { exact: true })).toHaveCount(0);
  return panel;
}

export const openAdvisor = (page: Page, width: VisualWidth) =>
  openAdvisorFrom(page, width, '/dashboard', (current) => current.getByRole('button', { name: 'Doradca', exact: true }).filter({ visible: true }).first());

export const openExplainOnInvoice = (page: Page, width: VisualWidth) =>
  openAdvisorFrom(page, width, '/dashboard/invoices/accepted-invoice-id', (current) => current.getByRole('button', { name: 'Wyjaśnij z doradcą' }));

export async function askQuestion(scope: Page | Locator, question: string, options: { includeRecords?: boolean } = {}) {
  if (options.includeRecords) await scope.getByRole('checkbox', { name: /Dołącz dane firmy z/ }).check();
  await scope.locator('textarea').fill(question);
  await scope.getByRole('button', { name: 'Zapytaj', exact: true }).click();
}

export async function expectVisual(target: Page | Locator, name: string, theme: VisualTheme, width: VisualWidth, options: { fullPage?: boolean } = {}) {
  const fileName = `advisor-${name}-${theme}-${width}.png`;
  const screenshotOptions = { animations: 'disabled', stylePath: stabilizingStylePath } as const;
  if ('goto' in target) await expect(target).toHaveScreenshot(fileName, { ...screenshotOptions, ...options });
  else await expect(target).toHaveScreenshot(fileName, screenshotOptions);
}
