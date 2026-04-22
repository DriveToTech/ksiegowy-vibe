import { test, expect } from './fixtures/auth';

test('sidebar shows all navigation items', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');
  const dashboardNavigation = page.getByRole('navigation', { name: 'Nawigacja dashboardu' });

  await expect(dashboardNavigation.getByRole('link', { name: 'Przegląd' })).toBeVisible();
  await expect(dashboardNavigation.getByRole('link', { name: 'Faktury wychodzące' })).toBeVisible();
  await expect(dashboardNavigation.getByRole('link', { name: 'Faktury przychodzące' })).toBeVisible();
  await expect(dashboardNavigation.getByRole('link', { name: 'Kontrahenci' })).toBeVisible();
  await expect(dashboardNavigation.getByRole('link', { name: 'Ustawienia', exact: true })).toBeVisible();
});

test('clicking Kontrahenci navigates to contractors page', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');
  const dashboardNavigation = page.getByRole('navigation', { name: 'Nawigacja dashboardu' });

  await dashboardNavigation.getByRole('link', { name: 'Kontrahenci' }).click();

  await expect(page).toHaveURL(/\/dashboard\/contractors$/);
  await expect(page.getByRole('heading', { name: 'Kontrahenci' })).toBeVisible();
});

test('clicking Faktury wychodzące navigates to invoices page', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');
  const dashboardNavigation = page.getByRole('navigation', { name: 'Nawigacja dashboardu' });

  await dashboardNavigation.getByRole('link', { name: 'Faktury wychodzące' }).click();

  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
  await expect(page.getByRole('heading', { name: 'Faktury sprzedażowe' })).toBeVisible();
});

test('clicking Ustawienia navigates to settings page', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');
  const dashboardNavigation = page.getByRole('navigation', { name: 'Nawigacja dashboardu' });

  await dashboardNavigation.getByRole('link', { name: 'Ustawienia', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard\/settings$/);
  await expect(page.getByRole('heading', { name: 'Ustawienia' })).toBeVisible();
});

test('settings page loads with members section', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/settings');

  await expect(page.getByRole('heading', { name: 'Ustawienia' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Członkowie/ })).toBeVisible();
});
