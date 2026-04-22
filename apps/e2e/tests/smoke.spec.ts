import { test, expect } from '@playwright/test';

test('home page loads and shows login button', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zaloguj się' })).toBeVisible();
});

test('login page loads', async ({ page }) => {
  await page.goto('/login');

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /google/i })).toBeVisible();
});
