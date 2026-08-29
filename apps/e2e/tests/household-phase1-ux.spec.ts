import type { Locator, Page, Response } from '@playwright/test';
import { test, expect } from './fixtures/auth';

function waitForHouseholdResponse(page: Page, method: string, pathname: string): Promise<Response> {
  return page.waitForResponse(
    (response) => response.request().method() === method && new URL(response.url()).pathname === pathname,
  );
}

function fieldByLabel(scope: Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}") + input, label:has-text("${labelText}") + select`);
}

test.describe('household Phase 1 UX blockers', () => {
  test('editing a payment sends only fields supported by the PATCH contract', async ({ isolatedHousehold }) => {
    const { page, householdIdentifier } = isolatedHousehold;
    await page.goto('/household/ledger/new');
    await page.getByPlaceholder('Odbiorca / płatnik').fill('Płatność przed edycją');
    await page.getByPlaceholder('0,00').fill('45,67');

    const createResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/transactions`);
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    const createdTransaction = await (await createResponsePromise).json() as { id: string };

    await page.goto(`/household/ledger/${createdTransaction.id}`);
    await page.getByRole('button', { name: 'Edytuj', exact: true }).click();

    const transactionForm = page.locator('form');
    await transactionForm.getByPlaceholder('Odbiorca / płatnik').fill('Płatność po edycji');
    const categoryField = fieldByLabel(transactionForm, 'Kategoria');
    await categoryField.selectOption({ label: 'Groceries' });
    const categoryId = await categoryField.inputValue();
    await fieldByLabel(transactionForm, 'Data').fill('2026-08-27');
    await fieldByLabel(transactionForm, 'Tag').fill('dom');
    await transactionForm.getByPlaceholder('Tylko domownicy to widzą…').fill('Notatka po edycji');

    const patchResponsePromise = waitForHouseholdResponse(page, 'PATCH', `/households/${householdIdentifier}/transactions/${createdTransaction.id}`);
    await transactionForm.getByRole('button', { name: 'Zapisz', exact: true }).click();
    const patchResponse = await patchResponsePromise;

    expect(patchResponse.status()).toBe(200);
    expect(patchResponse.request().postDataJSON()).toEqual({
      payee: 'Płatność po edycji',
      categoryId,
      tag: 'dom',
      note: 'Notatka po edycji',
      date: '2026-08-27',
    });
    await expect(page).toHaveURL(/\/household\/ledger$/);
    await expect(page.getByRole('table').getByRole('link', { name: 'Płatność po edycji' })).toBeVisible();
  });

  test('transfer details do not expose the payment edit action', async ({ isolatedHousehold }) => {
    const { page, householdIdentifier } = isolatedHousehold;
    await page.goto('/household/ledger/new');
    await page.getByPlaceholder('0,00').fill('10,00');
    await page.getByRole('button', { name: 'Transfer', exact: true }).click();

    const transferResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/transfers`);
    await page.getByRole('button', { name: 'Zapisz transfer', exact: true }).click();
    const transferTransactions = await (await transferResponsePromise).json() as Array<{ id: string }>;

    await page.goto(`/household/ledger/${transferTransactions[0].id}`);
    await expect(page.getByRole('heading', { name: 'Przelew między kontami', exact: true })).toBeVisible();
    await expect(page.getByText('Transfer', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edytuj', exact: true })).toHaveCount(0);
  });

  test('AccountPicker supports keyboard selection and restores focus after Escape, selection, and outside close', async ({ isolatedHousehold }) => {
    const { page } = isolatedHousehold;
    await page.goto('/household/ledger/new');

    const accountPicker = page.getByRole('button', { name: 'Konto', exact: true });
    await accountPicker.focus();
    await accountPicker.press('Enter');

    const listbox = page.getByRole('listbox', { name: 'Konto', exact: true });
    await expect(listbox).toBeVisible();
    await expect(listbox).toBeFocused();
    const options = listbox.getByRole('option');
    await expect(options).toHaveCount(2);
    const firstOptionId = await options.nth(0).getAttribute('id');
    const secondOptionId = await options.nth(1).getAttribute('id');
    if (!firstOptionId || !secondOptionId) throw new Error('AccountPicker options have no stable ids');

    await expect(listbox).toHaveAttribute('aria-activedescendant', firstOptionId);
    await listbox.press('Home');
    await expect(listbox).toHaveAttribute('aria-activedescendant', firstOptionId);
    await listbox.press('End');
    await expect(listbox).toHaveAttribute('aria-activedescendant', secondOptionId);
    await listbox.press(' ');
    await expect(listbox).toBeHidden();
    await expect(accountPicker).toBeFocused();
    await expect(accountPicker).toContainText('Oszczędności własne');

    await accountPicker.press('Enter');
    await expect(listbox).toBeVisible();
    await listbox.press('Escape');
    await expect(listbox).toBeHidden();
    await expect(accountPicker).toBeFocused();

    await accountPicker.press('Enter');
    await expect(listbox).toBeVisible();
    await page.getByRole('heading', { name: 'Dodaj płatność', exact: true }).click();
    await expect(listbox).toBeHidden();
    await expect(accountPicker).toBeFocused();
  });

  test('canonicalizes Polish comma decimals before creating a payment', async ({ isolatedHousehold }) => {
    const { page, householdIdentifier } = isolatedHousehold;
    await page.goto('/household/ledger/new');
    await page.getByPlaceholder('Odbiorca / płatnik').fill('Płatność z polskim separatorem');
    await page.getByPlaceholder('0,00').fill('1 234,56');

    const createResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/transactions`);
    await page.getByRole('button', { name: 'Zapisz', exact: true }).click();
    const createResponse = await createResponsePromise;

    expect(createResponse.status()).toBe(201);
    expect(createResponse.request().postDataJSON()).toEqual(expect.objectContaining({ amount: '-1234.56' }));
    await expect(page).toHaveURL(/\/household\/ledger$/);
  });

  test('ledger filters expose accessible field names and a named pressed-state direction group', async ({ isolatedHousehold }) => {
    const { page } = isolatedHousehold;
    await page.goto('/household/ledger');

    await expect(page.getByRole('textbox', { name: 'Szukaj odbiorcy, notatki lub kwoty…' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Konto', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Kategoria', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Od', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Do', exact: true })).toBeVisible();

    const directionGroup = page.getByRole('group', { name: 'Kierunek płatności', exact: true });
    await expect(directionGroup).toBeVisible();
    await expect(directionGroup.getByRole('button', { name: 'Wszystkie', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(directionGroup.getByRole('button', { name: 'Wpływy', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await directionGroup.getByRole('button', { name: 'Wydatki', exact: true }).click();
    await expect(directionGroup.getByRole('button', { name: 'Wydatki', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('mobile household navigation keeps every item touchable and places a labelled payment action in the center', async ({ isolatedHousehold }) => {
    const { page } = isolatedHousehold;
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto('/household');

    const mobileNavigation = page.getByRole('navigation', { name: 'Mobilna nawigacja gospodarstwa domowego' });
    const navigationLinks = mobileNavigation.getByRole('link');
    await expect(navigationLinks).toHaveCount(6);
    await expect(navigationLinks.nth(2)).toHaveAccessibleName('Dodaj płatność');
    await expect(navigationLinks.nth(2)).toHaveAttribute('href', '/household/ledger/new');
    await expect(navigationLinks.nth(2)).toBeVisible();

    const targetSizes = await navigationLinks.evaluateAll((links) => links.map((link) => {
      const rectangle = link.getBoundingClientRect();
      return { width: rectangle.width, height: rectangle.height };
    }));
    expect(targetSizes).toHaveLength(6);
    for (const targetSize of targetSizes) {
      expect(targetSize.width).toBeGreaterThanOrEqual(44);
      expect(targetSize.height).toBeGreaterThanOrEqual(44);
    }
  });

  test('failed dashboard data load shows an error instead of a legitimate empty state', async ({ authenticatedHouseholdDataFailurePage: page }) => {
    await page.goto('/household');

    await expect(page.getByRole('heading', { name: 'Start', level: 1 })).toBeVisible();
    await expect(page.getByRole('alert').getByText('Nie udało się wczytać pulpitu gospodarstwa domowego.')).toBeVisible();
    await expect(page.getByText('Brak kopert budżetowych', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Brak historii wpływów i wydatków', { exact: true })).toHaveCount(0);
  });
});
