import type { Page, Response } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const E2E_API_URL = 'http://localhost:3199';

function waitForHouseholdResponse(page: Page, method: string, pathname: string | RegExp): Promise<Response> {
  return page.waitForResponse((response) => {
    const responsePathname = new URL(response.url()).pathname;
    return response.request().method() === method
      && (typeof pathname === 'string' ? responsePathname === pathname : pathname.test(responsePathname));
  });
}

function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

async function createPosition(
  page: Page,
  instrument: string,
  visibility: 'PRIVATE' | 'SHARED' = 'PRIVATE',
  targetAllocationPercent?: string,
  wrapper: 'TAXABLE' | 'IKE' | 'IKZE' = 'TAXABLE',
): Promise<string> {
  await page.goto('/household/investing/new');
  const form = page.locator('form');
  await form.getByLabel(/Instrument \/ nazwa/).fill(instrument);
  if (visibility === 'SHARED') await form.getByRole('button', { name: 'Wspólna', exact: true }).click();
  if (wrapper !== 'TAXABLE') await form.getByRole('button', { name: new RegExp(`^${wrapper}`) }).click();
  if (targetAllocationPercent !== undefined) await form.getByLabel(/Alokacja docelowa/).fill(targetAllocationPercent);

  const responsePromise = waitForHouseholdResponse(page, 'POST', /\/households\/[^/]+\/investments$/);
  await form.getByRole('button', { name: 'Zapisz pozycję', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const responseBody: unknown = await response.json();
  if (responseBody === null || typeof responseBody !== 'object' || !('id' in responseBody) || typeof responseBody.id !== 'string') {
    throw new Error('Investment position response did not contain an id');
  }
  await expect(page).toHaveURL(`/household/investing/${responseBody.id}`);
  return responseBody.id;
}

async function recordInvestmentTransaction(
  page: Page,
  householdIdentifier: string,
  positionIdentifier: string,
  transaction: { type: string; amount: string; date: string; operationId: string; units?: string },
): Promise<void> {
  const response = await page.request.post(`${E2E_API_URL}/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`, { data: transaction });
  expect(response.status()).toBe(201);
}

test('opens Investing and Reports from desktop navigation and mobile More', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;

  await page.goto('/household/investing');
  const desktopNavigation = page.getByRole('navigation', { name: 'Nawigacja gospodarstwa domowego' });
  await expect(desktopNavigation.getByRole('link', { name: 'Inwestycje', exact: true })).toHaveAttribute('href', '/household/investing');
  await expect(desktopNavigation.getByRole('link', { name: 'Raporty', exact: true })).toHaveAttribute('href', '/household/reports');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/household/more');
  await page.getByRole('main').getByRole('link', { name: 'Inwestycje', exact: true }).click();
  await expect(page).toHaveURL(/\/household\/investing$/);
  await page.goto('/household/more');
  await page.getByRole('main').getByRole('link', { name: 'Raporty', exact: true }).click();
  await expect(page).toHaveURL(/\/household\/reports$/);
});

test('shows an empty portfolio and the manual-entry disclosure', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;

  await page.goto('/household/investing');
  await expect(page.getByRole('heading', { name: 'Inwestycje', level: 1 })).toBeVisible();
  await expect(page.getByText('Dane ręczne', { exact: true })).toBeVisible();
  await expect(page.getByText('Nie pobieramy notowań ani nie wyliczamy przyszłych wyników.', { exact: false })).toBeVisible();
  await expect(page.getByText('Brak pozycji inwestycyjnych', { exact: true })).toBeVisible();
  await expect(page.getByText('Łączna wartość bieżąca', { exact: true }).locator('xpath=..')).toContainText('0,00 zł');
  await expect(page.getByRole('table')).toBeVisible();
});

test.describe('investment visibility and ownership', () => {
  test.describe.configure({ mode: 'serial' });

  test('creates shared and private positions, omits private data, and keeps mutations owner-only', async ({ authenticatedHouseholdOwnerPage: ownerPage, authenticatedHouseholdMemberPage: memberPage }, testInfo) => {
    const uniqueIdentifier = testInfo.testId.replace(/[^a-zA-Z0-9]/g, '');
    const sharedInstrument = `Wspólny ETF ${uniqueIdentifier}`;
    const privateInstrument = `Prywatny ETF ${uniqueIdentifier}`;
    const sharedPositionIdentifier = await createPosition(ownerPage, sharedInstrument, 'SHARED');
    const privatePositionIdentifier = await createPosition(ownerPage, privateInstrument);

    await ownerPage.goto('/household/investing');
    await expect(ownerPage.getByRole('main').getByRole('link', { name: sharedInstrument, exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('main').getByRole('link', { name: privateInstrument, exact: true })).toBeVisible();

    await memberPage.goto('/household/investing');
    await expect(memberPage.getByRole('main').getByRole('link', { name: sharedInstrument, exact: true })).toBeVisible();
    await expect(memberPage.getByRole('main').getByText(privateInstrument, { exact: true })).toHaveCount(0);

    await memberPage.goto(`/household/investing/${sharedPositionIdentifier}`);
    await expect(memberPage.getByText('Pozycja jest dostępna do podglądu.', { exact: false })).toBeVisible();
    await expect(memberPage.getByRole('link', { name: 'Dodaj operację', exact: true })).toHaveCount(0);
    await expect(memberPage.getByRole('link', { name: 'Edytuj pozycję', exact: true })).toHaveCount(0);

    await ownerPage.goto(`/household/investing/${sharedPositionIdentifier}`);
    await expect(ownerPage.getByRole('link', { name: 'Dodaj operację', exact: true })).toBeVisible();
    await expect(ownerPage.getByRole('link', { name: 'Edytuj pozycję', exact: true })).toBeVisible();

    await memberPage.goto(`/household/investing/${privatePositionIdentifier}`);
    await expect(memberPage.getByRole('alert').getByText('Nie znaleziono pozycji inwestycyjnej lub nie masz do niej dostępu.', { exact: true })).toBeVisible();
  });
});

test('validates and displays BUY, SELL, VALUATION_UPDATE, and CONTRIBUTION operations', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const positionIdentifier = await createPosition(page, 'ETF operacje');
  const operationDate = todayIso();

  await page.goto(`/household/investing/${positionIdentifier}/transactions/new`);
  let form = page.locator('form');
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  await expect(form.getByRole('alert').getByText('Podaj prawidłową kwotę operacji.', { exact: true })).toBeVisible();
  await form.getByLabel('Kwota').fill('100,00');
  await form.getByLabel('Identyfikator operacji').fill('buy-operation');
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  await expect(form.getByRole('alert').getByText('Podaj liczbę jednostek.', { exact: true })).toBeVisible();
  await form.getByLabel('Liczba jednostek').fill('2');
  await form.getByLabel('Data operacji').fill(operationDate);
  const buyResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`);
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  expect((await buyResponsePromise).status()).toBe(201);
  await expect(page.getByRole('table').getByText('Zakup', { exact: true })).toBeVisible();

  await page.goto(`/household/investing/${positionIdentifier}/transactions/new`);
  form = page.locator('form');
  await form.getByRole('button', { name: 'Sprzedaż', exact: true }).click();
  await form.getByLabel('Kwota').fill('40');
  await form.getByLabel('Liczba jednostek').fill('1');
  await form.getByLabel('Data operacji').fill(operationDate);
  await form.getByLabel('Identyfikator operacji').fill('sell-operation');
  const sellResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`);
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  expect((await sellResponsePromise).status()).toBe(201);
  await expect(page.getByRole('table').getByText('Sprzedaż', { exact: true })).toBeVisible();

  await page.goto(`/household/investing/${positionIdentifier}/transactions/new`);
  form = page.locator('form');
  await form.getByRole('button', { name: 'Aktualizacja wyceny', exact: true }).click();
  await form.getByLabel('Kwota').fill('0');
  await form.getByLabel('Data operacji').fill(operationDate);
  await form.getByLabel('Identyfikator operacji').fill('valuation-operation');
  const valuationResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`);
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  expect((await valuationResponsePromise).status()).toBe(201);
  await expect(page.getByRole('table').getByText('Aktualizacja wyceny', { exact: true })).toBeVisible();

  await page.goto(`/household/investing/${positionIdentifier}/transactions/new`);
  form = page.locator('form');
  await form.getByRole('button', { name: 'Wpłata', exact: true }).click();
  await form.getByLabel('Kwota').fill('50');
  await form.getByLabel('Data operacji').fill(operationDate);
  await form.getByLabel('Identyfikator operacji').fill('contribution-operation');
  const contributionResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`);
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  expect((await contributionResponsePromise).status()).toBe(201);
  await expect(page.getByRole('table').getByText('Wpłata', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(5);
});

test('replays duplicate operation safely and retains a voided journal row', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const positionIdentifier = await createPosition(page, 'ETF dziennik');
  const operation = { type: 'BUY', amount: '10.00', units: '1', date: todayIso(), operationId: 'replayable-operation' };

  await page.goto(`/household/investing/${positionIdentifier}/transactions/new`);
  const form = page.locator('form');
  await form.getByLabel('Kwota').fill(operation.amount);
  await form.getByLabel('Liczba jednostek').fill(operation.units);
  await form.getByLabel('Data operacji').fill(operation.date);
  await form.getByLabel('Identyfikator operacji').fill(operation.operationId);
  const createResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`);
  await form.getByRole('button', { name: 'Zapisz operację', exact: true }).click();
  expect((await createResponsePromise).status()).toBe(201);

  const replayResponse = await page.request.post(`${E2E_API_URL}/households/${householdIdentifier}/investments/${positionIdentifier}/transactions`, { data: operation });
  expect(replayResponse.status()).toBe(200);
  const replayBody: unknown = await replayResponse.json();
  expect(replayBody).toEqual(expect.objectContaining({ replayed: true }));

  const journalRow = page.getByRole('table').getByRole('row').filter({ hasText: 'Zakup' });
  await expect(journalRow).toHaveCount(1);
  const voidButton = journalRow.getByRole('button', { name: /Unieważnij/ });
  page.once('dialog', (dialog) => dialog.dismiss());
  await voidButton.click();
  await expect(voidButton).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  const voidResponsePromise = waitForHouseholdResponse(page, 'POST', `/households/${householdIdentifier}/investments/${positionIdentifier}/transactions/${await voidButton.getAttribute('aria-label').then((value) => value?.split(' ').at(-1) ?? '')}/void`);
  await voidButton.click();
  expect((await voidResponsePromise).status()).toBe(200);
  await expect(journalRow).toContainText('Unieważniona');
  await expect(journalRow.getByRole('button', { name: /Unieważnij/ })).toHaveCount(0);
});

test('shows complete allocation drift in an accessible table and explicit incomplete or missing states', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const firstPositionIdentifier = await createPosition(page, 'ETF cel 60', 'PRIVATE', '60');
  const secondPositionIdentifier = await createPosition(page, 'ETF cel 40', 'PRIVATE', '40');
  const operationDate = todayIso();
  await recordInvestmentTransaction(page, householdIdentifier, firstPositionIdentifier, { type: 'VALUATION_UPDATE', amount: '600.00', date: operationDate, operationId: 'first-valuation' });
  await recordInvestmentTransaction(page, householdIdentifier, secondPositionIdentifier, { type: 'VALUATION_UPDATE', amount: '400.00', date: operationDate, operationId: 'second-valuation' });

  await page.goto('/household/investing');
  await expect(page.getByText('Alokacja docelowa kompletna', { exact: true })).toBeVisible();
  const allocationTable = page.getByRole('table', { name: 'Alokacja bieżąca, cel i podpisane odchylenie pozycji inwestycyjnych' });
  await expect(allocationTable).toBeVisible();
  await expect(allocationTable.getByRole('row').filter({ hasText: 'Zgodnie z celem: 0,00 p.p.' })).toHaveCount(2);

  const missingPositionIdentifier = await createPosition(page, 'ETF bez wyceny', 'PRIVATE', '50');
  expect(missingPositionIdentifier).toBeTruthy();
  await page.goto('/household/investing');
  await expect(page.getByText('Alokacja docelowa niekompletna', { exact: true })).toBeVisible();
  await expect(page.getByText('Brak wyceny', { exact: true }).first()).toBeVisible();
  await expect(allocationTable.getByText('— · brak pełnych danych', { exact: true })).toHaveCount(3);
});

test('records contribution history and gates IKZE headroom on confirmed evidence', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const positionIdentifier = await createPosition(page, 'IKZE historia', 'PRIVATE', undefined, 'IKZE');
  await recordInvestmentTransaction(page, householdIdentifier, positionIdentifier, { type: 'CONTRIBUTION', amount: '80.00', date: todayIso(), operationId: 'ikze-contribution' });

  await page.goto(`/household/investing/contributions?year=${new Date().getFullYear()}`);
  await expect(page.getByText('Historia, nie harmonogram', { exact: true })).toBeVisible();
  await expect(page.getByText('IKZE historia', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByRole('cell').last()).toContainText('80,00 zł');
  await expect(page.getByText('Pozostały limit IKZE nie jest prezentowany bez limitu, źródła i potwierdzenia USER_CONFIRMED z backendu.', { exact: true })).toBeVisible();
  await expect(page.getByText('Limit roczny', { exact: true })).toHaveCount(0);
});

test('keeps report preset and custom period state in the URL and rejects invalid custom dates', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;
  await page.goto('/household/reports');
  const periodForm = page.locator('form').filter({ has: page.getByLabel('Gotowy zakres') });
  await periodForm.getByLabel('Gotowy zakres').selectOption('last-12-months');
  await periodForm.getByRole('button', { name: 'Zastosuj zakres', exact: true }).click();
  await expect(page).toHaveURL(/\/household\/reports\?preset=last-12-months$/);

  await page.goto('/household/reports?preset=custom&from=2026-08-20&to=2026-08-28');
  await expect(page.getByLabel('Gotowy zakres')).toHaveValue('custom');
  await expect(page.getByLabel('Data od')).toBeEnabled();
  await page.getByLabel('Data od').fill('2026-08-20');
  await page.getByLabel('Data do').fill('2026-08-10');
  await page.getByRole('button', { name: 'Zastosuj zakres', exact: true }).click();
  await expect(page.getByRole('alert').getByText('Podaj prawidłowy, inkluzywny zakres dat krótszy niż rok.', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/household\/reports\?preset=custom&from=2026-08-20&to=2026-08-28$/);

  await page.getByLabel('Data do').fill('2026-08-28');
  await page.getByRole('button', { name: 'Zastosuj zakres', exact: true }).click();
  await expect(page).toHaveURL(/\/household\/reports\?preset=custom&from=2026-08-20&to=2026-08-28$/);
  await expect(page.getByText('Raport serwerowy: 20.08.2026–28.08.2026.', { exact: false })).toBeVisible();
});

test('shows partial net worth, report data quality, and informational IKZE evidence', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const positionIdentifier = await createPosition(page, 'IKZE raport', 'PRIVATE', undefined, 'IKZE');
  await recordInvestmentTransaction(page, householdIdentifier, positionIdentifier, { type: 'CONTRIBUTION', amount: '80.00', date: todayIso(), operationId: 'report-ikze-contribution' });

  await page.goto('/household/reports');
  await expect(page.getByText('Raport jest częściowy.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Majątek netto', exact: true })).toBeVisible();
  await expect(page.getByText('IKZE raport · IKZE', { exact: true })).toBeVisible();
  const missingValuation = page.getByRole('region', { name: 'Majątek netto' }).getByText('Brak wyceny w danych raportu', { exact: true });
  await expect(missingValuation).toHaveCount(2);
  await expect(missingValuation.first()).toBeVisible();
  await expect(page.getByText('One or more visible investment positions have no valuation in the report period.', { exact: true })).toBeVisible();

  const taxEvidence = page.getByText('Dowody do weryfikacji zeznania', { exact: true });
  await taxEvidence.click();
  const taxSection = taxEvidence.locator('xpath=..');
  await expect(taxSection).toContainText('nie jest oficjalnym wyliczeniem PIT, podatku ani poradą podatkową.');
  await expect(taxSection).toContainText('80,00 zł');
  await expect(taxSection).toContainText('Informacyjne dowody wpłat IKZE');
});

test('downloads CSV and PDF with private no-store responses and announces export failures', async ({ isolatedHousehold }) => {
  const { page, householdIdentifier } = isolatedHousehold;
  const reportDate = todayIso();
  const csvResponse = await page.request.get(`${E2E_API_URL}/households/${householdIdentifier}/reports/export?from=2026-01-01&to=${reportDate}&format=csv`);
  expect(csvResponse.status()).toBe(200);
  expect(csvResponse.headers()['cache-control']).toBe('private, no-store');
  expect(csvResponse.headers()['content-disposition']).toContain('.csv');
  expect((await csvResponse.body()).subarray(0, 5).toString('utf8')).toBe('\uFEFFSe');

  const pdfResponse = await page.request.get(`${E2E_API_URL}/households/${householdIdentifier}/reports/export?from=2026-01-01&to=${reportDate}&format=pdf`);
  expect(pdfResponse.status()).toBe(200);
  expect(pdfResponse.headers()['cache-control']).toBe('private, no-store');
  expect(pdfResponse.headers()['content-disposition']).toContain('.pdf');

  await page.goto('/household/reports');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Pobierz CSV', exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await expect(page.getByText('Eksport CSV został pobrany.', { exact: true })).toBeVisible();

  await page.route('**/reports/export**', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'WORKLOAD_LIMIT_EXCEEDED' }),
  }));
  await page.getByRole('button', { name: 'Pobierz PDF', exact: true }).click();
  await expect(page.getByText('Nie udało się pobrać eksportu. Spróbuj ponownie.', { exact: true })).toBeVisible();
});

test('keeps controls keyboard-accessible and avoids horizontal overflow at 390px', async ({ isolatedHousehold }) => {
  const { page } = isolatedHousehold;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/household/investing/new');
  const positionForm = page.locator('form');
  const privateVisibility = positionForm.getByRole('button', { name: 'Prywatna', exact: true });
  await privateVisibility.focus();
  await privateVisibility.press('Enter');
  await expect(privateVisibility).toHaveAttribute('aria-pressed', 'true');
  const sharedVisibility = positionForm.getByRole('button', { name: 'Wspólna', exact: true });
  await sharedVisibility.focus();
  await sharedVisibility.press(' ');
  await expect(sharedVisibility).toHaveAttribute('aria-pressed', 'true');

  await page.goto('/household');
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
});

test('renders investment and report read failures without falling back to empty states', async ({ authenticatedHouseholdDataFailurePage: page }) => {
  await page.goto('/household/investing');
  await expect(page.getByRole('alert').getByText('Nie udało się wczytać inwestycji. Spróbuj ponownie później.', { exact: true })).toBeVisible();
  await expect(page.getByText('Brak pozycji inwestycyjnych', { exact: true })).toHaveCount(0);

  await page.goto('/household/reports');
  await expect(page.getByRole('alert').getByText('Nie udało się wczytać raportu. Spróbuj ponownie później.', { exact: true })).toBeVisible();
});
