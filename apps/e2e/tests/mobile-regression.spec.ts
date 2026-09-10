import { test, expect } from './fixtures/auth';

const mobileViewportWidths = [320, 360, 390, 430] as const;
const mobileThemes = ['light', 'dark'] as const;

for (const mobileTheme of mobileThemes) {
  for (const viewportWidth of mobileViewportWidths) {
    test(`mobile contract at ${viewportWidth}px in ${mobileTheme} theme`, async ({ authenticatedPage: page }) => {
      await page.setViewportSize({ width: viewportWidth, height: 844 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((theme: (typeof mobileThemes)[number]) => {
        if (theme === 'dark') {
          window.localStorage.setItem('ksiegowy-theme', theme);
        } else {
          window.localStorage.removeItem('ksiegowy-theme');
        }
      }, mobileTheme);

      await page.goto('/dashboard');
      await expect(page.getByRole('heading', { name: 'Panel operacyjny' })).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', mobileTheme);

      const dashboardDimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(dashboardDimensions.documentScrollWidth).toBeLessThanOrEqual(dashboardDimensions.viewportWidth + 1);
      expect(dashboardDimensions.bodyScrollWidth).toBeLessThanOrEqual(dashboardDimensions.viewportWidth + 1);

      const mobileNavigation = page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' });
      await expect(mobileNavigation).toBeVisible();
      await expect(mobileNavigation.getByRole('link')).toHaveCount(3);
      await expect(mobileNavigation.getByRole('button', { name: 'Więcej' })).toHaveCount(1);

      const navigationSlots = await mobileNavigation.evaluate((navigation) => {
        const slots = Array.from(navigation.querySelectorAll<HTMLElement>(':scope > a, :scope > button'));
        const navigationBounds = navigation.getBoundingClientRect();
        return {
          count: slots.length,
          labels: slots.map((slot) => slot.getAttribute('aria-label')),
          left: navigationBounds.left,
          right: navigationBounds.right,
          viewportWidth: window.innerWidth,
          rowTops: slots.map((slot) => Math.round(slot.getBoundingClientRect().top)),
          widths: slots.map((slot) => slot.getBoundingClientRect().width),
          dimensions: slots.map((slot) => {
            const bounds = slot.getBoundingClientRect();
            return { width: bounds.width, height: bounds.height };
          }),
          iconCount: slots.filter((slot) => slot.querySelector('svg')).length,
        };
      });

      expect(navigationSlots.count).toBe(5);
      expect(navigationSlots.labels).toEqual(['Start', 'Zakupy', 'Asystent podatkowy AI — wkrótce', 'Sprzedaż', 'Więcej']);
      expect(navigationSlots.left).toBe(0);
      expect(navigationSlots.right).toBe(navigationSlots.viewportWidth);
      expect(new Set(navigationSlots.rowTops).size).toBe(1);
      expect(Math.max(...navigationSlots.widths) - Math.min(...navigationSlots.widths)).toBeLessThanOrEqual(1);
      expect(navigationSlots.dimensions.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
      expect(navigationSlots.iconCount).toBe(5);

      await expect(mobileNavigation.getByRole('link', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
      for (const directDestination of ['Sprzedaż', 'Zakupy']) {
        await expect(mobileNavigation.getByRole('link', { name: directDestination })).not.toHaveAttribute('aria-current', 'page');
      }

      const header = page.getByRole('banner');
      await expect(header.getByText('Northstar Demo Ledger LLC', { exact: true })).toBeVisible();
      await expect(header.getByLabel('Środowisko KSeF: TEST')).toBeVisible();

      const headerControlDimensions = await header.locator('button:visible').evaluateAll((controls) => controls.map((control) => {
        const bounds = control.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      }));
      expect(headerControlDimensions.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);

      await page.goto('/dashboard/invoices/new');
      await expect(page.getByRole('heading', { name: 'Nowa faktura' })).toBeVisible();

      const invoiceDimensions = await page.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      }));
      expect(invoiceDimensions.documentScrollWidth).toBeLessThanOrEqual(invoiceDimensions.viewportWidth + 1);
      expect(invoiceDimensions.bodyScrollWidth).toBeLessThanOrEqual(invoiceDimensions.viewportWidth + 1);

      const textEntryControls = await page.locator('#dashboard-content input:visible, #dashboard-content select:visible, #dashboard-content textarea:visible').evaluateAll((controls) => controls.map((control) => ({
        tagName: control.tagName,
        fontSize: Number.parseFloat(getComputedStyle(control).fontSize),
      })));
      expect(textEntryControls.length).toBeGreaterThan(0);
      expect(textEntryControls.filter(({ fontSize }) => fontSize < 16)).toEqual([]);

      const visibleMainTargets = await page.getByRole('main').locator('a:visible, button:visible, input:visible, select:visible, textarea:visible').evaluateAll((controls) => controls.map((control) => {
        const bounds = control.getBoundingClientRect();
        return {
          tagName: control.tagName,
          width: bounds.width,
          height: bounds.height,
        };
      }));
      expect(visibleMainTargets.filter(({ width, height }) => width < 44 || height < 44)).toEqual([]);

      const motionMeasurements = await page.evaluate(() => {
        const htmlStyles = getComputedStyle(document.documentElement);
        const probe = document.querySelector<HTMLElement>('#dashboard-content button');
        const probeStyles = probe ? getComputedStyle(probe) : null;
        return {
          reducedMotionMatches: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
          scrollBehavior: htmlStyles.scrollBehavior,
          transitionDurationMilliseconds: probeStyles ? Number.parseFloat(probeStyles.transitionDuration) : null,
          animationDurationMilliseconds: probeStyles ? Number.parseFloat(probeStyles.animationDuration) : null,
        };
      });
      expect(motionMeasurements.reducedMotionMatches).toBe(true);
      expect(motionMeasurements.scrollBehavior).toBe('auto');
      expect(motionMeasurements.transitionDurationMilliseconds).toBeLessThanOrEqual(0.01);
      expect(motionMeasurements.animationDurationMilliseconds).toBeLessThanOrEqual(0.01);

      const safeAreaMeasurements = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('#dashboard-content');
        const navigation = document.querySelector<HTMLElement>('nav[aria-label="Mobilna nawigacja dashboardu"]');
        if (!main || !navigation) return null;

        const visibleTargets = Array.from(main.querySelectorAll<HTMLElement>('a, button, input, select, textarea'))
          .filter((target) => {
            const styles = getComputedStyle(target);
            const bounds = target.getBoundingClientRect();
            return styles.display !== 'none' && styles.visibility !== 'hidden' && bounds.width > 0 && bounds.height > 0;
          });
        const lastTarget = visibleTargets.at(-1);
        lastTarget?.scrollIntoView({ block: 'end' });

        const navigationBounds = navigation.getBoundingClientRect();
        const lastTargetBounds = lastTarget?.getBoundingClientRect();
        return {
          mainPaddingBottom: Number.parseFloat(getComputedStyle(main).paddingBottom),
          navigationHeight: navigationBounds.height,
          navigationBottom: navigationBounds.bottom,
          lastTargetCovered: lastTargetBounds ? lastTargetBounds.bottom > navigationBounds.top + 1 : false,
        };
      });

      expect(safeAreaMeasurements).not.toBeNull();
      expect(safeAreaMeasurements?.mainPaddingBottom).toBeGreaterThanOrEqual((safeAreaMeasurements?.navigationHeight ?? 0) - 1);
      expect(safeAreaMeasurements?.navigationBottom).toBeLessThanOrEqual(844);
      expect(safeAreaMeasurements?.lastTargetCovered).toBe(false);
    });
  }
}

test.describe('mobile interaction regressions', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Panel operacyjny' })).toBeVisible();
  });

  test('Więcej traps focus, closes on Escape and backdrop activation, and restores focus', async ({ authenticatedPage: page }) => {
    const moreButton = page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' }).getByRole('button', { name: 'Więcej' });
    await moreButton.focus();
    await moreButton.click();

    const moreSheet = page.getByRole('dialog', { name: 'Więcej' });
    await expect(moreSheet).toBeVisible();
    await expect(moreSheet).toHaveAttribute('aria-modal', 'true');
    const firstSheetLink = moreSheet.getByRole('link', { name: 'Kontrahenci' });
    const lastSheetLink = moreSheet.getByRole('link', { name: 'Ustawienia' });
    await expect(firstSheetLink).toBeFocused();

    await page.keyboard.press('Shift+Tab');
    await expect(lastSheetLink).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(firstSheetLink).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(moreSheet).toBeHidden();
    await expect(moreButton).toBeFocused();

    await moreButton.click();
    await expect(moreSheet).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(moreSheet).toBeHidden();
    await expect(moreButton).toBeFocused();
  });

});

test.describe('mobile responsive route flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('contractors route opens and closes a stacked detail view', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/contractors');
    await expect(page.getByRole('heading', { name: 'Kontrahenci' })).toBeVisible();

    const contractorRow = page.getByRole('button', { name: /Bluebird Example Studio LLC/ }).last();
    await expect(contractorRow).toBeVisible();
    expect((await contractorRow.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await contractorRow.click();
    await expect(page.getByRole('button', { name: /Zamknij/ })).toBeVisible();
    await expect(page.getByText('Rachunek bankowy', { exact: true }).last()).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    await page.getByRole('button', { name: /Zamknij/ }).click();
    await expect(contractorRow).toBeVisible();
  });

  test('service catalogue route switches between list and create views', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/settings/service-catalog');
    await expect(page.getByRole('heading', { name: 'Katalog usług' })).toBeVisible();

    await page.getByRole('button', { name: '+ Dodaj usługę' }).first().click();
    await expect(page.getByLabel('Nazwa usługi / towaru')).toBeVisible();
    await expect(page.getByRole('button', { name: /Zamknij/ })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    await page.getByRole('button', { name: /Zamknij/ }).click();
    await expect(page.getByRole('button', { name: /Demo bookkeeping package/ }).last()).toBeVisible();
  });

  test('outgoing invoice route reaches the mobile detail and new-invoice form', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/invoices');
    await expect(page.getByRole('heading', { name: 'Faktury sprzedażowe' })).toBeVisible();
    await page.getByRole('link', { name: 'DEMO-INV-008' }).last().click();
    await expect(page).toHaveURL(/\/dashboard\/invoices\/accepted-invoice-id$/);
    await expect(page.getByRole('heading', { name: 'DEMO-INV-008' })).toBeVisible();

    await page.goto('/dashboard/invoices/new');
    await expect(page.getByRole('heading', { name: 'Nowa faktura' })).toBeVisible();
    await expect(page.getByLabel('Kontrahent', { exact: false })).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });

  test('incoming invoice route reaches the mobile OCR review', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/incoming');
    await expect(page.getByRole('heading', { name: 'Faktury przychodzące' })).toBeVisible();
    await page.locator('a[href="/dashboard/incoming/incoming-ocr-review-id"]:visible').click();
    await expect(page).toHaveURL(/\/dashboard\/incoming\/incoming-ocr-review-id$/);
    await expect(page.getByRole('heading', { name: 'INCOMING-DEMO-004' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Potwierdź' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  });

  test('onboarding company route keeps its form usable on mobile', async ({ onboardingPage: page }) => {
    await page.goto('/onboarding/company');
    await expect(page.getByRole('heading', { name: 'Skonfiguruj firmę' })).toBeVisible();
    await expect(page.getByLabel('NIP')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Utwórz firmę' })).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentScrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);

    const formControls = await page.locator('input:visible, select:visible, textarea:visible').evaluateAll((controls) => controls.map((control) => ({
      tagName: control.tagName,
      fontSize: Number.parseFloat(getComputedStyle(control).fontSize),
    })));
    expect(formControls.filter(({ fontSize }) => fontSize < 16)).toEqual([]);
  });
});
