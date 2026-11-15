import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const conversations = [
  { id: 'first', title: 'Czy faktura wymaga NIP nabywcy?', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-11-08T09:12:00.000Z' },
  { id: 'second', title: 'Podsumowanie września', provider: 'OPENAI', model: 'configured-model', createdAt: '2026-11-07T09:12:00.000Z' },
];
const settings = { enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [],
  retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0, connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }] };

async function openHistory(page: Page, behavior: { list: () => unknown[] | 'delay'; deleteStatus?: () => number }) {
  const deleted: string[] = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/companies/test-company-id/advisor/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/settings')) return route.fulfill({ json: settings });
    if (path.endsWith('/conversations') && request.method() === 'GET') {
      const list = behavior.list();
      if (list === 'delay') return new Promise(() => undefined);
      return route.fulfill({ json: list });
    }
    if (request.method() === 'DELETE') {
      const status = behavior.deleteStatus?.() ?? 204;
      if (status === 204) { deleted.push(path.split('/').at(-1) ?? ''); return route.fulfill({ status: 204 }); }
      return route.fulfill({ status, json: { code: 'ADVISOR_ERROR' } });
    }
    return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });
  await page.goto('/dashboard');
  await page.getByRole('banner').getByRole('button', { name: 'Otwórz doradcę' }).click();
  const panel = page.getByRole('complementary', { name: 'Doradca' });
  await panel.getByRole('button', { name: 'Historia rozmów' }).click();
  return { panel, deleted };
}

test('history lists conversations and the delete dialog cancels with Escape and returns focus', async ({ authenticatedPage: page }) => {
  const { panel } = await openHistory(page, { list: () => conversations });
  await expect(panel.getByRole('button', { name: /Czy faktura wymaga NIP/ }).first()).toBeVisible();
  await expect(panel.getByText('08.11 · OpenAI API')).toBeVisible();
  const trigger = panel.getByRole('button', { name: 'Usuń rozmowę: Czy faktura wymaga NIP nabywcy?' });
  await trigger.click();
  const dialog = page.getByRole('alertdialog', { name: 'Usunąć rozmowę?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Anuluj' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('delete failure keeps the row and success removes it', async ({ authenticatedPage: page }) => {
  let status = 500;
  const { panel, deleted } = await openHistory(page, { list: () => conversations, deleteStatus: () => status });
  await panel.getByRole('button', { name: 'Usuń rozmowę: Podsumowanie września' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.getByRole('button', { name: 'Usuń rozmowę' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Nie udało się usunąć rozmowy');
  await expect(panel.getByRole('button', { name: 'Usuń rozmowę: Podsumowanie września' })).toBeVisible();
  status = 204;
  await dialog.getByRole('button', { name: 'Usuń rozmowę' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByRole('button', { name: 'Usuń rozmowę: Podsumowanie września' })).toHaveCount(0);
  expect(deleted).toEqual(['second']);
});

test('history shows the empty state', async ({ authenticatedPage: page }) => {
  const { panel } = await openHistory(page, { list: () => [] });
  await expect(panel.getByRole('heading', { name: 'Brak rozmów' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Nowa rozmowa' })).toBeVisible();
});

test('history shows the loading state', async ({ authenticatedPage: page }) => {
  const { panel } = await openHistory(page, { list: () => 'delay' });
  await expect(panel.locator('[aria-busy="true"]')).toBeVisible();
});
