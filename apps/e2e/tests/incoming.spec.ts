import { test, expect } from './fixtures/auth';

test('incoming invoices page shows metrics above the action row', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/incoming');

  await expect(page.getByRole('heading', { name: 'Faktury przychodzące' })).toBeVisible();
  await expect(page.getByText('Łącznie', { exact: true })).toBeVisible();
  await expect(page.getByText('OCR w toku', { exact: true })).toBeVisible();
  await expect(page.getByText('Potwierdzone', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Prześlij fakturę do OCR' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pobierz faktury zakupowe' })).toBeVisible();
});

test('incoming invoices page shows the redesigned action row', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/incoming');

  await expect(page.getByText('Dodaj dokument', { exact: true })).toBeVisible();
  await expect(page.getByText('Import z KSeF', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Prześlij fakturę' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importuj z KSeF' })).toBeVisible();
  await expect(page.getByText('Obsługiwane formaty: PDF, JPG, PNG, WEBP, TIFF.')).toBeVisible();
});

test('incoming invoices page opens KSeF import modal', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/incoming');

  await page.getByRole('button', { name: 'Importuj z KSeF' }).click();

  await expect(page.getByRole('heading', { name: 'Import z KSeF' })).toBeVisible();
  await expect(page.getByLabel('Data od')).toBeVisible();
  await expect(page.getByLabel('Data do')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importuj', exact: true })).toBeVisible();
});
