import { test, expect } from './fixtures/auth';

test('incoming actions are reachable from the page header', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/incoming');

  const header = page.getByRole('main').locator('header').first();
  await expect(header.getByRole('heading', { name: 'Faktury przychodzące' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Prześlij fakturę' })).toBeVisible();
  await expect(header.getByRole('button', { name: 'Importuj z KSeF' })).toBeVisible();
});

test('incoming invoices page opens KSeF import modal', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/incoming');

  await page.getByRole('button', { name: 'Importuj z KSeF' }).click();

  await expect(page.getByRole('heading', { name: 'Import z KSeF' })).toBeVisible();
  await expect(page.getByLabel('Data od')).toBeVisible();
  await expect(page.getByLabel('Data do')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importuj', exact: true })).toBeVisible();
});
