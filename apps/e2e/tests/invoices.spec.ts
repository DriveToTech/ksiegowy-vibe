import { test, expect } from './fixtures/auth';

test('invoices list page loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByRole('heading', { name: 'Faktury sprzedażowe' })).toBeVisible();
});

test('invoices list shows metric cards', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByText('Wszystkie faktury')).toBeVisible();
  await expect(page.getByText('Szkice')).toBeVisible();
  await expect(page.getByText('Przyjęte w KSeF')).toBeVisible();
});

test('invoices list shows new invoice button', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByRole('link', { name: '+ Nowa faktura' })).toBeVisible();
});

test('new invoice form loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await expect(page.getByRole('heading', { name: 'Nowa faktura' })).toBeVisible();
});

test('new invoice form has line items and payment sections', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await expect(page.getByRole('heading', { name: 'Pozycje faktury' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Szczegóły płatności' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Podsumowanie' })).toBeVisible();
});

test('new invoice form has date and contractor fields', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await expect(page.locator('#issueDate')).toBeVisible();
  await expect(page.locator('#contractorId')).toBeVisible();
});

test('new invoice form can add a line item', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  const addButton = page.getByRole('button', { name: '+ Dodaj pozycję' });
  await expect(addButton).toBeVisible();

  // Initially one line (one "Nazwa pozycji" input)
  await expect(page.getByRole('textbox', { name: 'Nazwa pozycji' })).toHaveCount(1);

  await addButton.click();

  // After adding a line, there should be 2 "Nazwa pozycji" inputs
  await expect(page.getByRole('textbox', { name: 'Nazwa pozycji' })).toHaveCount(2);
});

test('new invoice form cancel returns to list', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await page.getByRole('link', { name: 'Anuluj' }).click();

  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
});

test('accepted invoice can create correction draft and shows explicit KOR actions', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/accepted-invoice-id');

  await expect(page.getByRole('button', { name: 'Wystaw korektę (KOR)' })).toBeVisible();

  await page.getByRole('button', { name: 'Wystaw korektę (KOR)' }).click();
  await expect(page.getByRole('heading', { name: 'Wystaw fakturę korygującą (KOR)' })).toBeVisible();

  await page.getByLabel('Przyczyna korekty (opcjonalnie)').fill('Zmiana ceny usługi');
  await page.getByLabel('Typ korekty (TypKorekty)').selectOption('2');
  await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard\/invoices\/kor-draft-1$/);
  await expect(page.getByText('Korekta faktury:')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wystaw korektę' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zobacz oryginał' })).toBeVisible();

  await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'KOR 1/4/2024' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wyślij korektę do KSeF' })).toBeVisible();
});
