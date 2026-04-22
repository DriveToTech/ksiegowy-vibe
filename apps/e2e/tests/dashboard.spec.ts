import { test, expect } from './fixtures/auth';

test('dashboard redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login/);
});

test('dashboard loads with all metric cards', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  await expect(page.getByRole('heading', { name: 'Panel operacyjny' })).toBeVisible();
  await expect(page.getByText('Faktury w tym miesiącu')).toBeVisible();
  await expect(page.getByText('Oczekuje na KSeF')).toBeVisible();
  await expect(page.getByText('Łączna sprzedaż')).toBeVisible();
});

test('dashboard shows action buttons', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('Szybkie działania')).toBeVisible();
  await expect(page.getByRole('link', { name: /Nowa faktura/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Prześlij do OCR/ })).toBeVisible();
});

test('dashboard shows quick action cards', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('Najczęstsze skróty robocze')).toBeVisible();
  await expect(page.getByRole('link', { name: /Nowa faktura/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Prześlij do OCR/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Zarządzaj ustawieniami firmy/ })).toBeVisible();
});

test('dashboard shows empty state when no company is configured', async ({ authenticatedPageNoCompany: page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('Brak skonfigurowanej firmy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Przejdź do ustawień' })).toBeVisible();
});
