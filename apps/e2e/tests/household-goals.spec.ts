import type { Page, Response } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const E2E_API_URL = 'http://localhost:3199';

interface HouseholdAccountFixture {
  id: string;
  name: string;
}

function waitForHouseholdResponse(page: Page, method: string, pathname: string | RegExp): Promise<Response> {
  return page.waitForResponse(
    (response) => {
      const responsePathname = new URL(response.url()).pathname;
      return response.request().method() === method
        && (typeof pathname === 'string' ? responsePathname === pathname : pathname.test(responsePathname));
    },
  );
}

async function createGoal(page: Page, name: string, monthlyAmount = '100'): Promise<string> {
  await page.goto('/household/goals/new');
  const form = page.locator('form');
  await form.getByLabel('Nazwa celu').fill(name);
  await form.getByLabel('Kwota docelowa').fill('1000');
  await form.getByLabel('Planowana kwota miesięczna').fill(monthlyAmount);

  const createResponsePromise = waitForHouseholdResponse(page, 'POST', /\/households\/[^/]+\/goals$/);
  await form.getByRole('button', { name: 'Zapisz cel', exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);

  const responseBody = await createResponse.json() as { id?: unknown };
  if (typeof responseBody.id !== 'string') throw new Error('Goal creation response did not contain an id');
  await expect(page).toHaveURL(new RegExp(`/household/goals/${responseBody.id}$`), { timeout: 15_000 });
  return responseBody.id;
}

async function getHouseholdAccounts(page: Page, householdIdentifier: string): Promise<HouseholdAccountFixture[]> {
  const response = await page.request.get(`${E2E_API_URL}/households/${householdIdentifier}/accounts`);
  expect(response.ok()).toBe(true);
  return await response.json() as HouseholdAccountFixture[];
}

async function addFundsToAccount(page: Page, householdIdentifier: string, accountIdentifier: string, amount: string): Promise<void> {
  const response = await page.request.post(`${E2E_API_URL}/households/${householdIdentifier}/transactions`, {
    data: {
      accountId: accountIdentifier,
      payee: 'Wpływ testowy',
      amount,
      date: todayIso(),
    },
  });
  expect(response.status()).toBe(201);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function selectAccount(page: Page, accountLabel: string, accountName: string): Promise<void> {
  await page.getByRole('button', { name: accountLabel, exact: true }).click();
  const listbox = page.getByRole('listbox', { name: accountLabel, exact: true });
  await listbox.getByRole('option').filter({ hasText: accountName }).click();
}

test('shows an empty goals overview, validates the conditional plan, and creates a goal', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;

  await page.goto('/household/goals');
  await expect(page.getByRole('heading', { name: 'Oszczędności i cele', level: 1 })).toBeVisible();
  await expect(page.getByText('Nie masz jeszcze celów', { exact: true })).toBeVisible();
  await expect(page.getByText('Konkurujące cele', { exact: true })).toHaveCount(0);

  await page.getByRole('link', { name: 'Nowy cel', exact: true }).first().click();
  const form = page.locator('form');
  await expect(form.getByLabel('Planowana kwota miesięczna')).toBeVisible();
  await expect(form.getByLabel('Termin osiągnięcia')).toHaveCount(0);

  await form.getByLabel('Nazwa celu').fill('Poduszka bezpieczeństwa');
  await form.getByLabel('Kwota docelowa').fill('1000');
  await form.getByRole('button', { name: 'Do konkretnej daty', exact: true }).click();
  await expect(form.getByLabel('Termin osiągnięcia')).toBeVisible();
  await expect(form.getByLabel('Planowana kwota miesięczna')).toHaveCount(0);

  await form.getByRole('button', { name: 'Zapisz cel', exact: true }).click();
  await expect(form.getByText('Wybierz termin albo dodatnią kwotę miesięczną — nie oba pola naraz.', { exact: true })).toBeVisible();

  await form.getByLabel('Termin osiągnięcia').fill('2099-12-31');
  const createResponsePromise = waitForHouseholdResponse(page, 'POST', /\/households\/[^/]+\/goals$/);
  await form.getByRole('button', { name: 'Zapisz cel', exact: true }).click();
  const createResponse = await createResponsePromise;
  expect(createResponse.status()).toBe(201);
  expect(createResponse.request().postDataJSON()).toEqual(expect.objectContaining({
    name: 'Poduszka bezpieczeństwa',
    kind: 'ONE_OFF',
    targetAmount: '1000.00',
    targetDate: '2099-12-31',
  }));
  const createdGoalBody = await createResponse.json() as { id?: unknown };
  if (typeof createdGoalBody.id !== 'string') throw new Error('Goal creation response did not contain an id');
  await expect(page).toHaveURL(`/household/goals/${createdGoalBody.id}`);
  await expect(page.getByRole('heading', { name: 'Poduszka bezpieczeństwa', level: 1 })).toBeVisible();
});

test('renders accessible goal progress and projection disclosure after adding a variable rule', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const goalIdentifier = await createGoal(page, 'Samochód', '100');

  await expect(page.getByRole('progressbar', { name: /Postęp celu/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Stała prognoza', exact: true })).toBeVisible();

  await page.goto(`/household/goals/${goalIdentifier}/rules`);
  const ruleForm = page.locator('form').filter({ hasText: 'Dodaj regułę' }).first();
  await ruleForm.getByRole('button', { name: 'Procent wpływów powyżej progu', exact: true }).click();
  await selectAccount(page, 'Konto wyzwalające', 'Konto wspólne');
  await ruleForm.getByLabel('Procent wpływów').fill('10');
  await ruleForm.getByLabel('Próg wpływów').fill('500');
  const ruleResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/automation-rules`);
  await ruleForm.getByRole('button', { name: 'Dodaj regułę', exact: true }).click();
  expect((await ruleResponsePromise).status()).toBe(201);

  await page.goto(`/household/goals/${goalIdentifier}`);
  await expect(page.getByText('Reguły procentowe i zaokrąglenia nie są uwzględniane w prognozie.', { exact: false })).toBeVisible();
});

test('adds and withdraws goal transfers with validation, refreshed balances, and movement history', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const goalIdentifier = await createGoal(page, 'Remont kuchni');
  const accounts = await getHouseholdAccounts(page, householdIdentifier);
  const fundingAccount = accounts[1];
  if (!fundingAccount) throw new Error('The isolated household did not contain a funding account');
  await addFundsToAccount(page, householdIdentifier, fundingAccount.id, '500.00');

  await page.goto(`/household/goals/${goalIdentifier}/add`);
  let transferForm = page.locator('form');
  await transferForm.getByLabel('Potwierdzam dane tego transferu.').check();
  await transferForm.getByRole('button', { name: 'Wykonaj transfer', exact: true }).click();
  await expect(transferForm.getByText('Podaj dodatnią kwotę transferu.', { exact: true })).toBeVisible();

  await transferForm.getByLabel('Kwota').fill('150');
  await transferForm.getByLabel('Notatka').fill('Pierwsza wpłata');
  await expect(transferForm.getByRole('button', { name: 'Wykonaj transfer', exact: true })).toBeDisabled();
  await transferForm.getByLabel('Potwierdzam dane tego transferu.').check();
  const addResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/transfers`);
  await transferForm.getByRole('button', { name: 'Wykonaj transfer', exact: true }).click();
  const addResponse = await addResponsePromise;
  expect(addResponse.status()).toBe(201);
  expect(addResponse.request().postDataJSON()).toEqual(expect.objectContaining({
    accountId: fundingAccount.id,
    direction: 'ADD',
    amount: '150.00',
    note: 'Pierwsza wpłata',
  }));

  await expect(page).toHaveURL(`/household/goals/${goalIdentifier}`);
  await expect(page.getByText('150,00', { exact: false }).first()).toBeVisible();
  const movementTable = page.getByRole('table', { name: 'Historia ruchów' });
  await expect(movementTable).toBeVisible();
  await expect(movementTable).toContainText('+150,00');

  await page.getByRole('link', { name: 'Wypłać z celu', exact: true }).click();
  await expect(page).toHaveURL(`/household/goals/${goalIdentifier}/withdraw`);
  transferForm = page.locator('form');
  await transferForm.getByLabel('Kwota').fill('50');
  await transferForm.getByLabel('Potwierdzam dane tego transferu.').check();
  const withdrawResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/transfers`);
  await transferForm.getByRole('button', { name: 'Wykonaj transfer', exact: true }).click();
  const withdrawResponse = await withdrawResponsePromise;
  expect(withdrawResponse.status()).toBe(201);
  expect(withdrawResponse.request().postDataJSON()).toEqual(expect.objectContaining({
    accountId: fundingAccount.id,
    direction: 'WITHDRAW',
    amount: '50.00',
  }));

  await expect(page).toHaveURL(`/household/goals/${goalIdentifier}`);
  await expect(page.getByRole('progressbar', { name: /Postęp celu/ })).toHaveAttribute('value', '100');
  await expect(movementTable).toContainText('+150,00');
  await expect(movementTable).toContainText('-50,00');
  await expect(movementTable.getByRole('row')).toHaveCount(3);
});

test('pauses, resumes, archives a zero-balance goal, and keeps archived views read-only', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const goalIdentifier = await createGoal(page, 'Cel do archiwizacji');

  let statusResponsePromise = waitForHouseholdResponse(page, 'PATCH', `/households/${householdIdentifier}/goals/${goalIdentifier}`);
  await page.getByRole('button', { name: 'Wstrzymaj', exact: true }).click();
  expect((await statusResponsePromise).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Wznów', exact: true })).toBeVisible();

  statusResponsePromise = waitForHouseholdResponse(page, 'PATCH', `/households/${householdIdentifier}/goals/${goalIdentifier}`);
  await page.getByRole('button', { name: 'Wznów', exact: true }).click();
  expect((await statusResponsePromise).status()).toBe(200);
  await expect(page.getByRole('button', { name: 'Wstrzymaj', exact: true })).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  statusResponsePromise = waitForHouseholdResponse(page, 'PATCH', `/households/${householdIdentifier}/goals/${goalIdentifier}`);
  await page.getByRole('button', { name: 'Archiwizuj', exact: true }).click();
  expect((await statusResponsePromise).status()).toBe(200);
  await expect(page.getByText('Archiwalny', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archiwizuj', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Wpłać na cel', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Wypłać z celu', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reguły automatyzacji', exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Edytuj', exact: true })).toHaveCount(0);

  await page.goto(`/household/goals/${goalIdentifier}/rules`);
  await expect(page.getByText('Archiwalny cel jest tylko do odczytu. Reguły automatyzacji nie mogą być zmieniane.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dodaj regułę', exact: true })).toHaveCount(0);

  await page.goto(`/household/goals/${goalIdentifier}/edit`);
  await expect(page.getByText('Archiwalny cel jest tylko do odczytu.', { exact: true })).toBeVisible();
});

test('supports fixed-day, percent-income, and round-up automation rule forms', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const goalIdentifier = await createGoal(page, 'Automatyczne oszczędzanie');
  await page.goto(`/household/goals/${goalIdentifier}/rules`);
  const ruleForm = page.locator('form').filter({ hasText: 'Dodaj regułę' }).first();

  await ruleForm.getByLabel('Stała kwota').fill('40');
  await ruleForm.getByLabel('Dzień miesiąca').fill('15');
  let ruleResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/automation-rules`);
  await ruleForm.getByRole('button', { name: 'Dodaj regułę', exact: true }).click();
  expect((await ruleResponsePromise).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Stała wpłata w dniu miesiąca', exact: true })).toBeVisible();

  await ruleForm.getByRole('button', { name: 'Procent wpływów powyżej progu', exact: true }).click();
  await selectAccount(page, 'Konto wyzwalające', 'Konto wspólne');
  await ruleForm.getByLabel('Procent wpływów').fill('10');
  await ruleForm.getByLabel('Próg wpływów').fill('500');
  ruleResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/automation-rules`);
  await ruleForm.getByRole('button', { name: 'Dodaj regułę', exact: true }).click();
  expect((await ruleResponsePromise).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Procent wpływów powyżej progu', exact: true })).toBeVisible();

  await ruleForm.getByRole('button', { name: 'Zaokrąglanie wydatków', exact: true }).click();
  await ruleForm.getByLabel('Zaokrąglaj do').fill('10');
  ruleResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/goals/${goalIdentifier}/automation-rules`);
  await ruleForm.getByRole('button', { name: 'Dodaj regułę', exact: true }).click();
  expect((await ruleResponsePromise).status()).toBe(201);
  await expect(page.getByRole('heading', { name: 'Zaokrąglanie wydatków', exact: true })).toBeVisible();
  await expect(page.getByText('Aktywna', { exact: true })).toHaveCount(3);
});

test('shows the competing-goals allocation summary', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;
  await createGoal(page, 'Pierwszy cel', '100');
  await createGoal(page, 'Drugi cel', '200');

  await page.goto('/household/goals');
  await expect(page.getByRole('heading', { name: 'Konkurujące cele', exact: true })).toBeVisible();
  await expect(page.getByText('Pierwszy cel', { exact: true })).toBeVisible();
  await expect(page.getByText('Drugi cel', { exact: true })).toBeVisible();
  await expect(page.getByText('Przydział:', { exact: false })).toHaveCount(2);
  await expect(page.getByText('300,00', { exact: false })).toBeVisible();
});

test.describe('private goal authorization', () => {
  test.describe.configure({ mode: 'serial' });

  test('omits a private goal from another member and renders the generic goals error state', async ({ authenticatedHouseholdOwnerPage: ownerPage, authenticatedHouseholdMemberPage: memberPage }, testInfo) => {
    const privateGoalName = `Prywatny cel ${testInfo.testId}`;
    const response = await ownerPage.request.post(`${E2E_API_URL}/households/test-household-id/goals`, {
      data: {
        accountId: 'test-household-account-private-id',
        name: privateGoalName,
        kind: 'ONE_OFF',
        targetAmount: '100.00',
        monthlyAmount: '10.00',
      },
    });
    expect(response.status()).toBe(201);
    const responseBody = await response.json() as { id?: unknown };
    if (typeof responseBody.id !== 'string') throw new Error('Private goal response did not contain an id');

    await memberPage.goto('/household/goals');
    await expect(memberPage.getByRole('main').getByText(privateGoalName, { exact: true })).toHaveCount(0);

    await memberPage.goto(`/household/goals/${responseBody.id}`);
    await expect(memberPage.getByRole('alert').getByText('Nie udało się wczytać tego widoku. Dane finansowe nie zostały zmienione.', { exact: true })).toBeVisible();
  });
});

test('exposes Goals in desktop navigation and keeps the mobile five-position navigation touchable at 320px', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;

  await page.goto('/household/goals');
  const desktopNavigation = page.getByRole('navigation', { name: 'Nawigacja gospodarstwa domowego' });
  await expect(desktopNavigation.getByRole('link', { name: 'Cele', exact: true })).toHaveAttribute('href', '/household/goals');
  await expect(desktopNavigation.getByRole('link', { name: 'Cele', exact: true })).toHaveAttribute('aria-current', 'page');

  await page.setViewportSize({ width: 320, height: 844 });
  await page.reload();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobilna nawigacja gospodarstwa domowego' });
  const navigationLinks = mobileNavigation.getByRole('link');
  await expect(navigationLinks).toHaveCount(5);
  await expect(navigationLinks.nth(2)).toHaveAccessibleName('Dodaj płatność');
  await expect(navigationLinks.nth(3)).toHaveAccessibleName('Cele');
  await expect(navigationLinks.nth(4)).toHaveAccessibleName('Więcej');

  const targetSizes = await navigationLinks.evaluateAll((links) => links.map((link) => {
    const rectangle = link.getBoundingClientRect();
    return { width: rectangle.width, height: rectangle.height };
  }));
  expect(targetSizes).toHaveLength(5);
  for (const targetSize of targetSizes) {
    expect(targetSize.width).toBeGreaterThanOrEqual(44);
    expect(targetSize.height).toBeGreaterThanOrEqual(44);
  }

  await navigationLinks.nth(4).click();
  await expect(page).toHaveURL(/\/household\/more$/);
  await expect(page.getByRole('heading', { name: 'Więcej', level: 1 })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Konta', exact: true })).toBeVisible();
});

test('failed goals read shows an error instead of the legitimate empty state', async ({ authenticatedHouseholdDataFailurePage: page }) => {
  await page.goto('/household/goals');

  await expect(page.getByRole('heading', { name: 'Oszczędności i cele', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert').getByText('Nie udało się wczytać oszczędności i celów.', { exact: true })).toBeVisible();
  await expect(page.getByText('Nie masz jeszcze celów', { exact: true })).toHaveCount(0);
});
