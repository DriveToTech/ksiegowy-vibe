import { test, expect } from './fixtures/auth';

test('desktop sidebar contains navigation only and one active page', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');
  const sidebar = page.getByRole('complementary');
  const dashboardNavigation = sidebar.getByRole('navigation', { name: 'Nawigacja dashboardu', exact: true });

  await expect(dashboardNavigation.getByRole('link')).toHaveCount(5);
  await expect(dashboardNavigation.getByRole('link', { name: 'Przegląd' })).toHaveAttribute('aria-current', 'page');
  await expect(dashboardNavigation).toHaveClass(/flex-col/);
  const activeNavigationContrasts = await dashboardNavigation.getByRole('link', { name: 'Przegląd' }).evaluate((element) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');

    const parseColor = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return context.getImageData(0, 0, 1, 1).data.slice(0, 3);
    };
    const luminance = (color: string) => {
      const channels = Array.from(parseColor(color)).map((channel) => channel / 255);
      const linearChannels = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * (linearChannels[0] ?? 0) + 0.7152 * (linearChannels[1] ?? 0) + 0.0722 * (linearChannels[2] ?? 0);
    };
    // The active nav item's own fill is a gradient (background-image), so its
    // getComputedStyle().backgroundColor is transparent. Walk up to the nearest
    // ancestor with an actual painted background (the rail/chrome panel) to use as
    // the backdrop, since that's what a viewer's eye contrasts the gradient-tinted
    // text against in practice.
    const resolvedBackgroundColor = (start: Element) => {
      let current: Element | null = start;
      while (current) {
        const backgroundColor = getComputedStyle(current).backgroundColor;
        if (backgroundColor && !backgroundColor.startsWith('rgba(0, 0, 0, 0)') && backgroundColor !== 'transparent') {
          return backgroundColor;
        }
        current = current.parentElement;
      }
      return 'rgb(255, 255, 255)';
    };

    return ['light', 'dark'].map((theme) => {
      document.documentElement.dataset.theme = theme;
      // Reading getComputedStyle directly off the in-place, already-painted anchor
      // returns a stale (pre-toggle) color in this specific nested position, even
      // though the exact same classes recompute correctly on a fresh element and the
      // ancestor chain (background) updates live. Measuring a detached clone of the
      // real, currently-rendered atom sidesteps that Chromium quirk while still
      // reading the atom's real current classes rather than a hand-typed guess.
      const probe = element.cloneNode(true) as HTMLElement;
      document.body.append(probe);
      const styles = getComputedStyle(probe);
      const resolvedBg = resolvedBackgroundColor(element);
      const backgroundLuminance = luminance(resolvedBg);
      const foregroundLuminance = luminance(styles.color);
      const contrast = (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) /
        (Math.min(backgroundLuminance, foregroundLuminance) + 0.05);
      probe.remove();
      return contrast;
    });
  });
  expect(activeNavigationContrasts.every((contrast) => contrast >= 4.5)).toBe(true);
  await expect(sidebar.getByText('Szybkie działania')).toHaveCount(0);
  await expect(sidebar.getByText('Aktywna firma')).toHaveCount(0);
  await expect(sidebar.getByLabel('Wybierz aktywne środowisko KSeF')).toHaveCount(0);
});

test('mobile keeps bottom navigation and hides desktop sidebar', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  await expect(page.getByRole('complementary')).toBeHidden();
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByRole('link')).toHaveCount(5);

  for (const [accessibleName, visibleLabel] of [
    ['Przegląd', 'Start'],
    ['Faktury wychodzące', 'Sprzedaż'],
    ['Faktury przychodzące', 'Zakupy'],
    ['Kontrahenci', 'Firmy'],
    ['Ustawienia', 'Ustawienia'],
  ]) {
    const link = mobileNavigation.getByRole('link', { name: accessibleName });
    await expect(link).toBeVisible();
    await expect(link.getByText(visibleLabel, { exact: true })).toBeVisible();
    const linkBox = await link.boundingBox();
    expect(linkBox?.width).toBeGreaterThanOrEqual(44);
    expect(linkBox?.height).toBeGreaterThanOrEqual(44);
  }
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

test('dashboard exposes one visible navigation surface and semantic state', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/dashboard');

  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('complementary')).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Nawigacja dashboardu', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Przegląd' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: 'Włącz ciemny motyw' })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('TEST', { exact: true }).first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary')).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Nawigacja dashboardu', exact: true })).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' })).toBeVisible();
});
