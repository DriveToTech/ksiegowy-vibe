import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

test('invoices list page loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByRole('heading', { name: 'Faktury sprzedażowe' })).toBeVisible();
});

test('invoices list shows status filter tabs', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByRole('link', { name: 'Wszystkie' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Szkice' })).toBeVisible();

  await page.getByRole('link', { name: 'Szkice' }).click();
  await expect(page).toHaveURL(/segment=drafts/);
});

test('invoices list shows new invoice button', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices');

  await expect(page.getByRole('link', { name: 'Nowa faktura' })).toBeVisible();
});

test('new invoice form loads', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await expect(page.getByRole('heading', { name: 'Nowa faktura' })).toBeVisible();
});

test('new invoice form has line items and payment sections', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await expect(page.getByRole('heading', { name: 'Pozycje faktury' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Daty i płatność' })).toBeVisible();
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

  // Initially one line (one "Nazwa, pozycja N" input)
  await expect(page.getByRole('combobox', { name: /^Nazwa, pozycja \d+$/ })).toHaveCount(1);

  await addButton.click();

  // After adding a line, there should be 2 "Nazwa, pozycja N" inputs
  await expect(page.getByRole('combobox', { name: /^Nazwa, pozycja \d+$/ })).toHaveCount(2);
});

test('new invoice form can select a service from the catalogue', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await page.getByRole('button', { name: '+ Dodaj pozycję' }).click();
  const lineItemInputs = page.getByRole('combobox', { name: /^Nazwa, pozycja \d+$/ });
  await lineItemInputs.nth(1).click();
  await page.getByRole('option', { name: 'Demo bookkeeping package' }).click();

  await expect(lineItemInputs.nth(1)).toHaveValue('Demo bookkeeping package');
  await expect(page.getByRole('textbox', { name: 'Jednostka miary, pozycja 2' })).toHaveValue('hour');
});

test('new invoice form cancel returns to list', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/new');

  await page.getByRole('link', { name: 'Anuluj' }).click();

  await expect(page).toHaveURL(/\/dashboard\/invoices$/);
});

test('accepted invoice can create formal correction draft and shows corrected invoice number', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/invoices/accepted-invoice-id');

  await expect(page.getByRole('button', { name: 'Wystaw korektę (KOR)' })).toBeVisible();

  await page.getByRole('button', { name: 'Wystaw korektę (KOR)' }).click();
  await expect(page.getByRole('heading', { name: 'Wystaw fakturę korygującą (KOR)' })).toBeVisible();

  await page.getByLabel('Tryb korekty').selectOption('formal');
  await page.getByLabel('Prawidłowy numer faktury').fill('FV 15/04/2026');
  await page.getByLabel('Przyczyna korekty (opcjonalnie)').fill('Zmiana numeracji');
  await page.getByLabel('Typ korekty (TypKorekty)').selectOption('2');
  await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click();

  await expect(page).toHaveURL(/\/dashboard\/invoices\/kor-draft-1$/);
  await expect(page.getByText('Korekta faktury:')).toBeVisible();
  await expect(page.getByText('Prawidłowy numer faktury', { exact: true })).toBeVisible();
  await expect(page.getByText('FV 15/04/2026', { exact: true })).toBeVisible();
  await expect(page.getByText('Tryb korekty', { exact: true })).toBeVisible();
  await expect(page.getByText('Korekta formalna bez zmiany kwot')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wystaw korektę' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Zobacz oryginał' })).toBeVisible();

  await page.getByRole('button', { name: 'Wystaw korektę', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'KOR-DEMO-001' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Wyślij korektę do KSeF' })).toBeVisible();
});

const currentMonth = new Date().toISOString().slice(0, 7);
const previousMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);

function searchParametersOf(page: Page) {
  return Object.fromEntries(new URL(page.url()).searchParams);
}

// The line items table, not the VAT summary table.
const lineItemsTable = (page: Page) => page.locator('table[aria-labelledby]');

// Gives the draft one priced line, so the buyer is the only thing that can block saving.
async function fillMinimalLine(page: Page) {
  await page.getByRole('combobox', { name: 'Nazwa, pozycja 1' }).fill('Konsultacje');
  await page.getByRole('textbox', { name: 'Cena netto, pozycja 1' }).fill('100');
}

test.describe('invoice list filters', () => {
  test('search by Enter puts q in the URL, filters rows and updates the footer', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices');
    await expect(page.getByRole('search').getByLabel('Szukaj faktur')).toBeVisible();

    await page.getByTestId('invoice-search').fill('DEMO-INV-005');
    await page.getByTestId('invoice-search').press('Enter');

    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'DEMO-INV-005' });
    await expect(page.getByRole('link', { name: /DEMO-INV-005/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /DEMO-INV-008/ })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'suma brutto' })).toContainText('1 z 1');
  });

  test('month select puts month in the URL, filters rows and keeps the search', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices?q=DEMO');
    await expect(page.getByLabel('Okres')).toHaveValue('');
    await expect(page.getByLabel('Okres').locator('option').first()).toHaveText('Cały okres');

    await page.getByTestId('invoice-month').selectOption(previousMonth);

    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'DEMO', month: previousMonth });
    await expect(page.getByRole('link', { name: /DEMO-INV-006/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /DEMO-INV-008/ })).toHaveCount(0);
    await expect(page.getByTestId('invoice-search')).toHaveValue('DEMO');
  });

  test('each status segment sets its URL and aria-current, keeps q and month and resets the page', async ({ manyInvoicesPage: page }) => {
    const segmentNavigation = page.getByRole('navigation', { name: 'Filtr statusu' });
    const segments = [
      { label: 'Przyjęte', segment: 'accepted' },
      { label: 'W rozliczeniu', segment: 'pending' },
      { label: 'Odrzucone', segment: 'rejected' },
      { label: 'Szkice', segment: 'drafts' },
    ];
    await page.goto(`/dashboard/invoices?q=PAGE-FV&month=${currentMonth}&page=2`);
    await expect(segmentNavigation.getByRole('link', { name: 'Wszystkie' })).toHaveAttribute('aria-current', 'page');

    for (const { label, segment } of segments) {
      await segmentNavigation.getByRole('link', { name: label }).click();
      await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'PAGE-FV', month: currentMonth, segment });
      await expect(segmentNavigation.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page');
      await expect(segmentNavigation.locator('[aria-current="page"]')).toHaveCount(1);
    }

    await segmentNavigation.getByRole('link', { name: 'Wszystkie' }).click();
    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'PAGE-FV', month: currentMonth });
    await expect(segmentNavigation.getByRole('link', { name: 'Wszystkie' })).toHaveAttribute('aria-current', 'page');
  });

  test('pagination keeps q, month and segment', async ({ manyInvoicesPage: page }) => {
    const pagination = page.getByRole('navigation', { name: 'Paginacja' });
    const footer = page.getByRole('status').filter({ hasText: 'suma brutto' });
    await page.goto(`/dashboard/invoices?q=PAGE-FV&month=${currentMonth}&segment=accepted`);
    await expect(footer).toContainText('20 z 25');

    await pagination.getByRole('link', { name: 'Strona 2' }).click();
    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'PAGE-FV', month: currentMonth, segment: 'accepted', page: '2' });
    await expect(footer).toContainText('5 z 25');
    await expect(pagination.getByRole('link', { name: 'Strona 2' })).toHaveAttribute('aria-current', 'page');

    await pagination.getByRole('link', { name: 'Poprzednia' }).click();
    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'PAGE-FV', month: currentMonth, segment: 'accepted' });
    await expect(footer).toContainText('20 z 25');
  });

  test('mobile pagination pair keeps the filters', async ({ manyInvoicesPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/dashboard/invoices?q=PAGE-FV&month=${currentMonth}`);

    await page.getByRole('navigation', { name: 'Paginacja' }).getByRole('link', { name: 'Następna' }).click();

    await expect.poll(() => searchParametersOf(page)).toEqual({ q: 'PAGE-FV', month: currentMonth, page: '2' });
    await expect(page.getByRole('status').filter({ hasText: 'suma brutto' })).toContainText('5 z 25');
  });

  test('filtered empty state offers to clear the filters', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices?q=no-such-invoice');

    await expect(page.getByText('Brak faktur dla wybranych filtrów')).toBeVisible();
    await page.getByRole('link', { name: 'Wyczyść filtry' }).click();

    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(page.getByRole('link', { name: /DEMO-INV-008/ })).toBeVisible();
  });

  test('not-submitted dashboard link shows a removable filter indicator', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices?ksefStatus=not_submitted');

    const indicator = page.getByTestId('invoice-filter-not-submitted');
    await expect(indicator).toHaveAccessibleName('Usuń filtr: nie wysłane do KSeF');
    await expect(page.getByRole('link', { name: /DEMO-INV-005/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /DEMO-INV-008/ })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Filtr statusu' }).locator('[aria-current="page"]')).toHaveCount(0);

    await indicator.click();

    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(indicator).toHaveCount(0);
    await expect(page.getByRole('link', { name: /DEMO-INV-008/ })).toBeVisible();
  });

  test('loading skeleton has no KPI cards or headings', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices?q=slow-response', { waitUntil: 'commit' });

    const loadingStatus = page.getByRole('status').filter({ hasText: 'Ładowanie faktur…' });
    await expect(loadingStatus).toBeAttached();
    await expect(page.getByRole('main').getByRole('heading')).toHaveCount(0);
    await expect(page.getByRole('main').locator('dl')).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Faktury sprzedażowe' })).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('new invoice form', () => {
  const buyerStatus = (page: Page) => page.getByRole('status').filter({ has: page.locator('span[aria-hidden="true"]') });

  test('selected contractor shows a read-only NIP and a verified white-list status', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');

    await expect(page.getByLabel('NIP nabywcy')).toHaveValue('1110001113');
    await expect(page.getByLabel('NIP nabywcy')).toHaveJSProperty('readOnly', true);
    await expect(buyerStatus(page)).toContainText('Biała lista OK');
    await expect(buyerStatus(page)).toContainText('podmiot czynny, sprawdzono');
    await expect(page.locator('#contractorId option', { hasText: '1110001113' })).toHaveCount(0);
  });

  test('white-list states never show OK unless verified, and only an invalid NIP blocks saving', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');
    await fillMinimalLine(page);
    const saveButton = page.getByRole('button', { name: 'Zapisz szkic' });
    const states = [
      { contractor: 'Whitelist Missing Example LLC', text: 'Brak na białej liście', announcement: 'nie znaleziono podmiotu' },
      { contractor: 'Whitelist Exempt Example LLC', text: 'Zwolniony', announcement: 'podmiot zwolniony z VAT' },
      { contractor: 'Whitelist Outage Example LLC', text: 'Błąd · ponów', announcement: 'Nie udało się sprawdzić białej listy VAT' },
      { contractor: 'Whitelist Throttled Example LLC', text: 'Błąd · ponów', announcement: 'Limit sprawdzeń białej listy VAT został osiągnięty' },
      { contractor: 'Private Buyer Without Tax Id', text: 'Brak NIP', announcement: 'nie ma numeru NIP' },
    ];

    for (const state of states) {
      await page.getByLabel('Nabywca', { exact: true }).selectOption({ label: state.contractor });
      await expect(buyerStatus(page)).toContainText(state.announcement);
      await expect(page.getByText(state.text, { exact: true }).first()).toBeAttached();
      await expect(buyerStatus(page)).not.toContainText('Biała lista OK');
      await expect(saveButton).toBeEnabled();
    }

    await page.getByLabel('Nabywca', { exact: true }).selectOption({ label: 'Whitelist Invalid Checksum Example LLC' });
    await expect(buyerStatus(page)).toContainText('Błędny NIP');
    await expect(buyerStatus(page)).not.toContainText('Biała lista OK');
    await expect(page.getByRole('alert').filter({ hasText: 'Suma kontrolna NIP jest błędna' })).toBeVisible();
    await expect(saveButton).toBeDisabled();

    await page.getByLabel('Nabywca', { exact: true }).selectOption({ label: 'Bluebird Example Studio LLC' });
    await expect(buyerStatus(page)).toContainText('Biała lista OK');
    await expect(saveButton).toBeEnabled();
  });

  test('missing NIP shows the chip with a hint', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');

    await page.getByLabel('Nabywca', { exact: true }).selectOption({ label: 'Private Buyer Without Tax Id' });

    await expect(page.getByText('Brak NIP', { exact: true })).toBeVisible();
    await expect(page.getByText('Uzupełnij NIP w kartotece kontrahenta.')).toBeVisible();
    await expect(page.getByLabel('NIP nabywcy')).toHaveValue('—');
  });

  test('unavailable registry offers a retry that asks the registry again', async ({ authenticatedPage: page }) => {
    const lookupRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/companies/lookup')) lookupRequests.push(request.url());
    });
    await page.goto('/dashboard/invoices/new');
    await expect(page.getByRole('status').filter({ hasText: 'sprawdzono' })).toBeVisible();

    await page.getByLabel('Nabywca', { exact: true }).selectOption({ label: 'Whitelist Outage Example LLC' });
    const retryButton = page.getByRole('button', { name: 'Ponów sprawdzenie białej listy VAT' });
    await expect(retryButton).toBeVisible();
    // Dev-mode effects may run twice, so compare against the count before the click.
    const requestsBeforeRetry = lookupRequests.length;

    await retryButton.click();

    await expect.poll(() => lookupRequests.length).toBeGreaterThan(requestsBeforeRetry);
    await expect(retryButton).toBeVisible();
    await expect(page.getByText('Biała lista OK')).toHaveCount(0);
  });

  test('line items have the documented column order and unique per-line labels', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');

    await expect(lineItemsTable(page).getByRole('columnheader')).toHaveText(['#', 'Nazwa', 'J.m.', 'Ilość', 'Cena netto', 'VAT', 'Brutto', 'Usuń']);
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 1' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Jednostka miary, pozycja 1' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ilość, pozycja 1' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Cena netto, pozycja 1' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Stawka VAT, pozycja 1' })).toBeVisible();
  });

  test('adding, catalogue insert and removing a line move focus, and totals match the summary', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');
    await page.getByRole('textbox', { name: 'Ilość, pozycja 1' }).fill('2');
    await page.getByRole('textbox', { name: 'Cena netto, pozycja 1' }).fill('100');

    await page.getByRole('button', { name: '+ Dodaj pozycję' }).click();
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 2' })).toBeFocused();

    await page.getByRole('button', { name: '+ Z katalogu' }).click();
    const catalogueLine = page.getByRole('combobox', { name: 'Nazwa, pozycja 3' });
    await expect(catalogueLine).toBeFocused();
    await page.getByRole('option', { name: 'Demo bookkeeping package' }).click();
    await expect(catalogueLine).toHaveValue('Demo bookkeeping package');

    await page.getByRole('button', { name: 'Usuń pozycję 3' }).click();
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 2' })).toBeFocused();
    await page.getByRole('button', { name: 'Usuń pozycję 2' }).click();
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 1' })).toBeFocused();

    const lineItemsCard = lineItemsTable(page).locator('xpath=ancestor::div[contains(@class,"@container")][1]');
    const summaryCard = page.getByRole('heading', { name: 'Podsumowanie' }).locator('xpath=..');
    await expect(lineItemsCard.locator('dl').last()).toContainText('246,00');
    await expect(summaryCard).toContainText('246,00');
    await expect(lineItemsCard.locator('dl').last()).toContainText('200,00');
    await expect(summaryCard).toContainText('200,00');
  });

  test('attachments are disabled with a linked hint and no file input', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');

    const attachmentsButton = page.getByRole('button', { name: 'Dodaj załącznik' });
    await expect(attachmentsButton).toBeDisabled();
    await expect(attachmentsButton).toHaveAttribute('aria-describedby', 'attachments-hint');
    await expect(page.locator('#attachments-hint')).toContainText('Wkrótce');
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test('focus layout hides the dashboard rail on new and edit, and the back link restores it', async ({ authenticatedPage: page }) => {
    const rail = page.locator('[data-dashboard-rail] nav[aria-label="Nawigacja dashboardu"]');
    await page.goto('/dashboard/invoices/new');
    await expect(page.locator('[data-invoice-focus-layout]')).toBeVisible();
    await expect(rail).toBeHidden();

    await page.goto('/dashboard/invoices/draft-invoice-id/edit');
    await expect(page.locator('[data-invoice-focus-layout]')).toBeVisible();
    await expect(rail).toBeHidden();

    await page.goto('/dashboard/invoices/new');
    await page.getByRole('link', { name: '← Faktury' }).click();
    await expect(page).toHaveURL(/\/dashboard\/invoices$/);
    await expect(rail).toBeVisible();
  });

  test('line items table card has no padding and its header band reaches the card edges at 1280', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/dashboard/invoices/new');

    const card = lineItemsTable(page).locator('xpath=ancestor::div[contains(@class,"@container")][1]');
    const cardBox = await card.boundingBox();
    const tableBox = await lineItemsTable(page).boundingBox();
    const headBox = await lineItemsTable(page).locator('thead').boundingBox();
    const cardPadding = await card.evaluate((element) => getComputedStyle(element).padding);

    expect(cardPadding).toBe('0px');
    // 2px tolerance covers the card border.
    for (const box of [tableBox, headBox]) {
      expect(Math.abs(box!.x - cardBox!.x)).toBeLessThanOrEqual(2);
      expect(Math.abs(box!.x + box!.width - (cardBox!.x + cardBox!.width))).toBeLessThanOrEqual(2);
    }
  });

  test('line items switch to cards at 390 without horizontal overflow', async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard/invoices/new');

    await expect(lineItemsTable(page)).toBeHidden();
    await expect(page.getByText('Pozycja 1', { exact: true })).toBeVisible();
    await expect(page.locator('#invoice-add-line-footer')).toBeVisible();
    await expect(page.locator('#invoice-add-line-header')).toBeHidden();
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 1' })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });

  test('buyer status is a polite live region that is mounted before any result', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices/new');

    const liveRegion = page.locator('#buyerNip').locator('xpath=ancestor::div[2]').locator('[role="status"]');
    await expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByLabel('NIP nabywcy')).toHaveAttribute('aria-describedby', /.+/);
  });
});

test.describe('edit invoice form', () => {
  test('loads the draft, keeps the due date when the issue date changes and saves with PUT', async ({ authenticatedPage: page }) => {
    const draftIssueDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 20)).toISOString().slice(0, 10);
    const draftDueDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 34)).toISOString().slice(0, 10);
    const changedIssueDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 18)).toISOString().slice(0, 10);
    await page.goto('/dashboard/invoices/draft-invoice-id/edit');
    // Controlled inputs: edits made before hydration are overwritten by the initial state.
    await page.waitForLoadState('networkidle');

    await expect(page.locator('#issueDate')).toHaveValue(draftIssueDate);
    await expect(page.locator('#paymentDueDate')).toHaveValue(draftDueDate);
    await expect(page.getByRole('combobox', { name: 'Nazwa, pozycja 1' })).toHaveValue('Demo bookkeeping package');

    await page.locator('#issueDate').fill(changedIssueDate);
    await expect(page.locator('#paymentDueDate')).toHaveValue(draftDueDate);

    const updateRequest = page.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/invoices/draft-invoice-id'));
    await page.getByRole('button', { name: 'Zapisz zmiany' }).click();

    expect((await updateRequest).postDataJSON()).toMatchObject({ issueDate: changedIssueDate, paymentDueDate: draftDueDate });
    await expect(page).toHaveURL(/\/dashboard\/invoices\/draft-invoice-id$/);
  });
});
