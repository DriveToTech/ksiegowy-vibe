import { test, expect } from './fixtures/auth';

test('contractors list page loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors');

  await expect(page.getByRole('heading', { name: 'Kontrahenci' })).toBeVisible();
  await expect(page.getByRole('main').locator('header').getByRole('link', { name: 'Dodaj po NIP' })).toBeVisible();
});

test('contractors list shows search and filter controls', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors');

  await expect(page.getByPlaceholder('Szukaj po nazwie lub NIP…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wszyscy' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aktywni', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nieaktywni' })).toBeVisible();
});

test('contractors list shows contractor from mock', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors');

  await expect(page.getByRole('cell', { name: 'Bluebird Example Studio LLC' })).toBeVisible();
});

test('new contractor form loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors/new');

  await expect(page.getByRole('heading', { name: 'Nowy kontrahent' })).toBeVisible();
  await expect(page.getByLabel('Nazwa')).toBeVisible();
  await expect(page.getByLabel('NIP')).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('new contractor form has submit and cancel buttons', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors/new');

  await expect(page.getByRole('button', { name: 'Dodaj kontrahenta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Anuluj' })).toBeVisible();
});

test('new contractor form cancel returns to list', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/contractors/new');

  await page.getByRole('button', { name: 'Anuluj' }).click();

  await expect(page).toHaveURL(/\/dashboard\/contractors$/);
});
