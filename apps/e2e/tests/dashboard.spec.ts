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

test('authenticated header exposes company, KSeF, theme, and session controls in order', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Księgowy Vibe logo' })).toBeVisible();
  await expect(header.getByText('Test Company Sp. z o.o.', { exact: true })).toBeVisible();
  await expect(header.getByLabel('Wybierz aktywne środowisko KSeF')).toHaveValue('TEST');
  await expect(header.getByText('TEST', { exact: true }).first()).toBeVisible();
  await expect(header.getByRole('button', { name: 'Włącz ciemny motyw' })).toBeVisible();
  await expect(header.getByRole('button', { name: /Wyloguj/ })).toBeVisible();

  const interactiveLabels = await header.locator('a, select, button').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('aria-label') ?? element.textContent?.trim()),
  );
  expect(interactiveLabels.indexOf('Wybierz aktywne środowisko KSeF')).toBeLessThan(
    interactiveLabels.findIndex((label) => label === 'Włącz ciemny motyw'),
  );
});

test('authenticated mobile header fits its controls into two rows without horizontal overflow', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  const headerMeasurements = await page.getByRole('banner').evaluate((header) => {
    const elements = [
      header.querySelector('[data-app-header-brand]'),
      header.querySelector('[data-app-header-company]'),
      header.querySelector('[data-app-header-ksef]'),
      header.querySelector('[data-app-header-theme-session]'),
    ];

    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      measuredElementCount: elements.filter(Boolean).length,
      rowTops: elements
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .map((element) => Math.round(element.getBoundingClientRect().top)),
    };
  });

  expect(headerMeasurements.documentScrollWidth).toBeLessThanOrEqual(headerMeasurements.viewportWidth);
  expect(headerMeasurements.measuredElementCount).toBe(4);
  expect(new Set(headerMeasurements.rowTops).size).toBeLessThanOrEqual(2);
});

test('dashboard defaults to light theme and persists an explicit dark choice', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  const themeSwitcher = page.getByRole('button', { name: 'Włącz ciemny motyw' });
  await expect(themeSwitcher).toHaveAttribute('aria-pressed', 'false');
  await themeSwitcher.click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Włącz jasny motyw' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('ksiegowy-theme'))).toBe('dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('stored theme is applied before hydration', async ({ authenticatedPage: page }) => {
  await page.addInitScript(() => localStorage.setItem('ksiegowy-theme', 'dark'));
  await page.route('**/_next/static/**/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('invalid stored theme falls back to light', async ({ authenticatedPage: page }) => {
  await page.addInitScript(() => localStorage.setItem('ksiegowy-theme', '<script>alert(1)</script>'));
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('danger button text meets WCAG AA in both themes', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  const contrastRatios = await page.evaluate(() => {
    const luminance = (color: string) => {
      const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number) ?? [];
      const normalizedChannels = channels.map((channel) => channel / 255);
      const linearChannels = normalizedChannels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * (linearChannels[0] ?? 0) + 0.7152 * (linearChannels[1] ?? 0) + 0.0722 * (linearChannels[2] ?? 0);
    };

    const contrastRatio = (background: string, foreground: string) => {
      const backgroundLuminance = luminance(background);
      const foregroundLuminance = luminance(foreground);
      const lighter = Math.max(backgroundLuminance, foregroundLuminance);
      const darker = Math.min(backgroundLuminance, foregroundLuminance);
      return (lighter + 0.05) / (darker + 0.05);
    };

    const button = document.createElement('button');
    button.className = 'bg-error text-error-ink';
    document.body.append(button);
    const ratios: number[] = [];

    for (const theme of ['light', 'dark']) {
      document.documentElement.dataset.theme = theme;
      const styles = getComputedStyle(button);
      ratios.push(contrastRatio(styles.backgroundColor, styles.color));
    }

    button.remove();
    return ratios;
  });

  expect(contrastRatios).toEqual([expect.any(Number), expect.any(Number)]);
  expect(contrastRatios.every((ratio) => ratio >= 4.5)).toBe(true);
});

test('shared controls and button variants meet contrast requirements in both themes', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  const results = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    const parseColor = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { red, green, blue, alpha: (alpha ?? 255) / 255 };
    };
    const luminance = (color: { red: number; green: number; blue: number }) => {
      const channels = [color.red, color.green, color.blue].map((channel) => channel / 255);
      const linearChannels = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * (linearChannels[0] ?? 0) + 0.7152 * (linearChannels[1] ?? 0) + 0.0722 * (linearChannels[2] ?? 0);
    };
    const contrastRatio = (
      background: { red: number; green: number; blue: number },
      foreground: { red: number; green: number; blue: number },
    ) => {
      const backgroundLuminance = luminance(background);
      const foregroundLuminance = luminance(foreground);
      return (Math.max(backgroundLuminance, foregroundLuminance) + 0.05) /
        (Math.min(backgroundLuminance, foregroundLuminance) + 0.05);
    };
    const probes = [
      // Primary is tested here as its flat --primary/--primary-ink pair, the same ink
      // token the real gradient fill (--primary-gradient) uses at both stops — canvas
      // contrast sampling can't average a two-stop gradient, so this is a proxy; the
      // gradient's own AA contrast at both stops is verified in
      // docs/specs/aurora-solid-tokens.md §7, and the gradient actually being wired on
      // the real button is asserted separately below.
      ['primary button', 'rounded-control bg-primary text-primary-ink'],
      ['secondary button', 'rounded-control bg-secondary-surface text-secondary-ink'],
      ['ghost button', 'rounded-control bg-transparent text-primary'],
      ['danger button', 'rounded-control bg-error text-error-ink'],
      ['success status', 'bg-success text-success-ink'],
      ['warning status', 'bg-warning text-warning-ink'],
      ['error status', 'bg-error text-error-ink'],
      ['surface', 'bg-surface-panel text-foreground'],
    ];
    const container = document.createElement('div');
    container.className = 'bg-surface-panel';
    document.body.append(container);
    const values = ['light', 'dark'].flatMap((theme) => {
      document.documentElement.dataset.theme = theme;
      const probeResults = probes.map(([name, className]) => {
        const element = document.createElement('button');
        element.className = className;
        container.append(element);
        const styles = getComputedStyle(element);
        const surfaceColor = parseColor(getComputedStyle(container).backgroundColor);
        const backgroundColor = parseColor(styles.backgroundColor);
        const foregroundColor = parseColor(styles.color);
        const contrast = contrastRatio(
          {
            red: backgroundColor.red * backgroundColor.alpha + surfaceColor.red * (1 - backgroundColor.alpha),
            green: backgroundColor.green * backgroundColor.alpha + surfaceColor.green * (1 - backgroundColor.alpha),
            blue: backgroundColor.blue * backgroundColor.alpha + surfaceColor.blue * (1 - backgroundColor.alpha),
          },
          foregroundColor,
        );
        const backgroundImage = styles.backgroundImage;
        element.remove();
        return { theme, name, contrast, backgroundImage };
      });
      const focusProbe = document.createElement('button');
      focusProbe.className = 'outline-2 outline-primary';
      container.append(focusProbe);
      const focusStyles = getComputedStyle(focusProbe);
      const surfaceColor = parseColor(getComputedStyle(container).backgroundColor);
      const focusColor = parseColor(focusStyles.outlineColor);
      probeResults.push({
        theme,
        name: 'focus outline',
        contrast: contrastRatio(surfaceColor, focusColor),
        backgroundImage: 'none',
      });
      focusProbe.remove();
      return probeResults;
    });
    container.remove();
    return values;
  });

  expect(results.filter(({ contrast }) => contrast < 4.5)).toEqual([]);

  // Aurora's primary button fill is the --primary-gradient two-stop gradient, not a flat
  // color. Read the real rendered atom (not a hand-typed className) to confirm it's
  // actually wired rather than silently falling back to no background.
  const primaryButtonBackgroundImage = await page
    .getByRole('link', { name: '+ Nowa faktura' })
    .locator('button')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(primaryButtonBackgroundImage).toContain('linear-gradient');
});

test('dashboard exposes contextual destinations without a persistent quick-action panel', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard');

  const main = page.getByRole('main');
  await expect(main.getByRole('link', { name: '+ Nowa faktura' })).toHaveAttribute('href', '/dashboard/invoices/new');
  await expect(main.getByRole('link', { name: 'Przejdź do OCR' })).toHaveAttribute('href', '/dashboard/incoming');
  await expect(page.getByText('Szybkie działania')).toHaveCount(0);
  await expect(page.getByText('Najczęstsze skróty robocze')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Nawigacja dashboardu' }).getByRole('link', { name: 'Ustawienia' })).toHaveAttribute('href', '/dashboard/settings');
});

test('visual: dashboard light desktop', async ({ authenticatedPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-linux');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.removeItem('ksiegowy-theme'));
  await page.goto('/dashboard');

  await expect(page).toHaveScreenshot('dashboard-light-desktop.png', { animations: 'disabled', fullPage: true });
});

test('visual: dashboard dark desktop', async ({ authenticatedPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-linux');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => localStorage.setItem('ksiegowy-theme', 'dark'));
  await page.goto('/dashboard');

  await expect(page).toHaveScreenshot('dashboard-dark-desktop.png', { animations: 'disabled', fullPage: true });
});

test('visual: dashboard light mobile', async ({ authenticatedPage: page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-linux');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.removeItem('ksiegowy-theme'));
  await page.goto('/dashboard');

  await expect(page).toHaveScreenshot('dashboard-light-mobile.png', { animations: 'disabled', fullPage: true });
});

test('mobile dashboard content and actions clear navigation at initial and mid-scroll positions', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  const layoutMeasurements = await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    const navigation = document.querySelector('nav[aria-label="Mobilna nawigacja dashboardu"]');
    const main = document.querySelector('main');
    const contentContainer = main?.firstElementChild;

    if (!navigation || !main || !contentContainer) {
      return null;
    }

    const positions = [0, Math.floor((main.scrollHeight - main.clientHeight) / 2)];
    const measurements = positions.map((scrollTop) => {
      main.scrollTop = scrollTop;
      const navigationBounds = navigation.getBoundingClientRect();
      const mainBounds = main.getBoundingClientRect();
      const meaningfulElements = [
        ...contentContainer.children,
        ...main.querySelectorAll('a, button'),
      ];

      const violations = meaningfulElements
        .map((element) => ({
          label: element.textContent?.trim() ?? element.tagName,
          bounds: element.getBoundingClientRect(),
          scrollTop,
        }))
        .map(({ label, bounds, scrollTop: currentScrollTop }) => ({
          label,
          scrollTop: currentScrollTop,
          top: Math.max(bounds.top, mainBounds.top),
          bottom: Math.min(bounds.bottom, mainBounds.bottom),
        }))
        .filter(({ top, bottom }) => top < window.innerHeight && bottom > 0)
        .filter(({ bottom, top }) => bottom > navigationBounds.top && top < navigationBounds.bottom)
        .map(({ label, scrollTop }) => ({ label, scrollTop }));

      return {
        requestedScrollTop: scrollTop,
        actualScrollTop: main.scrollTop,
        mainScrollHeight: main.scrollHeight,
        mainClientHeight: main.clientHeight,
        navigationTop: navigationBounds.top,
        navigationBottom: navigationBounds.bottom,
        violations,
      };
    });

    return { measurements, viewportHeight: window.innerHeight };
  });

  expect(layoutMeasurements).not.toBeNull();
  expect(layoutMeasurements?.measurements.every(({ violations }) => violations.length === 0)).toBe(true);
  expect(layoutMeasurements?.measurements.every(({ actualScrollTop, requestedScrollTop }) => actualScrollTop === requestedScrollTop)).toBe(true);
  expect(layoutMeasurements?.measurements.every(({ mainScrollHeight, mainClientHeight }) => mainScrollHeight > mainClientHeight)).toBe(true);
  expect(layoutMeasurements?.measurements.every(({ navigationTop, navigationBottom, actualScrollTop }) =>
    navigationTop >= 0 && navigationBottom <= (layoutMeasurements?.viewportHeight ?? 0) && actualScrollTop >= 0,
  )).toBe(true);
  await expect(page.getByText('OCZEKUJE NA KSEF')).toBeVisible();
  await expect(page.getByRole('link', { name: '+ Nowa faktura' })).toBeVisible();
});

test('dashboard shows empty state when no company is configured', async ({ authenticatedPageNoCompany: page }) => {
  await page.goto('/dashboard');

  await expect(page.getByText('Brak skonfigurowanej firmy')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Przejdź do ustawień' })).toBeVisible();
});

for (const viewport of [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'sm', width: 640, height: 844 },
  { name: 'lg', width: 1024, height: 768 },
  { name: 'xl', width: 1280, height: 800 },
  { name: '2xl', width: 1536, height: 900 },
]) {
  test(`dashboard shell fits ${viewport.name} without horizontal overflow`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/dashboard');

    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);

    const themeBox = await page.getByRole('button', { name: 'Włącz ciemny motyw' }).boundingBox();
    expect(themeBox?.width).toBeGreaterThanOrEqual(44);
    expect(themeBox?.height).toBeGreaterThanOrEqual(44);

    if (viewport.width < 1024) {
      const logoutBox = await page.getByRole('button', { name: /Wyloguj/ }).boundingBox();
      expect(logoutBox?.width).toBeGreaterThanOrEqual(44);
      expect(logoutBox?.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('shared controls and dashboard surfaces meet contrast requirements in both themes', async ({ authenticatedPage: page }) => {
  await page.goto('/dashboard/settings');

  const contrastResults = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');

    const parseColor = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return { red, green, blue, alpha: (alpha ?? 255) / 255 };
    };
    const luminance = ({ red, green, blue }: ReturnType<typeof parseColor>) => {
      const channels = [red, green, blue].map((channel) => channel / 255);
      const linearChannels = channels.map((channel) =>
        channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * (linearChannels[0] ?? 0) + 0.7152 * (linearChannels[1] ?? 0) + 0.0722 * (linearChannels[2] ?? 0);
    };
    const contrastRatio = (background: ReturnType<typeof parseColor>, foreground: ReturnType<typeof parseColor>) =>
      (Math.max(luminance(background), luminance(foreground)) + 0.05) /
      (Math.min(luminance(background), luminance(foreground)) + 0.05);
    const composite = (foreground: ReturnType<typeof parseColor>, background: ReturnType<typeof parseColor>) => ({
      red: foreground.red * foreground.alpha + background.red * (1 - foreground.alpha),
      green: foreground.green * foreground.alpha + background.green * (1 - foreground.alpha),
      blue: foreground.blue * foreground.alpha + background.blue * (1 - foreground.alpha),
      alpha: 1,
    });
    const probeClassNames = [
      ['input', 'h-11 w-full rounded-control border border-outline-control bg-surface-raised text-sm text-foreground'],
      ['select', 'h-11 w-full rounded-control border border-outline-control bg-surface-raised text-sm font-medium text-foreground'],
      ['textarea', 'min-h-28 w-full rounded-control border border-outline-control bg-surface-raised text-sm text-foreground'],
      ['floating label input', 'h-14 w-full rounded-control border border-outline-control bg-surface-raised text-sm text-foreground'],
      ['floating label select', 'h-14 w-full rounded-control border border-outline-control bg-surface-raised text-sm font-medium text-foreground'],
      ['draft badge', 'bg-draft text-draft-ink'],
      ['offline24 badge', 'bg-neutral-status text-neutral-status-ink'],
      ['primary badge', 'bg-primary-soft text-primary'],
      ['success badge', 'bg-success text-success-ink'],
      ['warning badge', 'bg-warning text-warning-ink'],
      ['danger badge', 'bg-error text-error-ink'],
      ['KSeF TEST badge', 'border-success-ink/30 bg-success text-success-ink'],
      ['KSeF PRODUCTION badge', 'border-warning-ink/30 bg-warning text-warning-ink'],
      ['primary button', 'bg-primary text-primary-ink'],
      ['secondary button', 'bg-secondary-surface text-secondary-ink'],
      ['ghost button', 'bg-transparent text-primary'],
      ['danger button', 'bg-error text-error-ink'],
      ['surface', 'bg-surface-panel text-foreground'],
    ];
    const probeContainer = document.createElement('div');
    probeContainer.className = 'bg-surface-panel';
    document.body.append(probeContainer);

    const results = ['light', 'dark'].flatMap((theme) => {
      document.documentElement.dataset.theme = theme;
      const surfaceColor = parseColor(getComputedStyle(probeContainer).backgroundColor);
      const elements = [
        ...Array.from(document.querySelectorAll('input, select, textarea, [role="table"], section, main > div'))
          .filter((element) => element.getBoundingClientRect().width > 0),
      ];
      const actualResults = elements.map((element) => {
        const styles = getComputedStyle(element);
        const backgroundColor = composite(parseColor(styles.backgroundColor), surfaceColor);
        return {
          theme,
          name: element.tagName.toLowerCase(),
          textContrast: contrastRatio(backgroundColor, parseColor(styles.color)),
          borderContrast: contrastRatio(backgroundColor, parseColor(styles.borderTopColor)),
          outlineStyle: undefined,
        };
      });
      const classResults = probeClassNames.map(([name, className]) => {
        const element = document.createElement('button');
        element.className = className;
        probeContainer.append(element);
        const styles = getComputedStyle(element);
        const backgroundColor = composite(parseColor(styles.backgroundColor), surfaceColor);
        const result = {
          theme,
          name,
          textContrast: contrastRatio(backgroundColor, parseColor(styles.color)),
          borderContrast: contrastRatio(backgroundColor, parseColor(styles.borderTopColor)),
          outlineStyle: undefined,
        };
        element.remove();
        return result;
      });
      const focusProbe = document.createElement('button');
      focusProbe.className = 'bg-surface-panel text-foreground';
      probeContainer.append(focusProbe);
      focusProbe.focus();
      const focusStyles = getComputedStyle(focusProbe);
      const focusResult = {
        theme,
        name: 'focus-visible indicator',
        textContrast: contrastRatio(surfaceColor, parseColor(focusStyles.outlineColor)),
        borderContrast: 0,
        outlineStyle: focusStyles.outlineStyle,
      };
      focusProbe.remove();
      return [...actualResults, ...classResults, focusResult];
    });

    probeContainer.remove();
    return results;
  });

  expect(contrastResults.filter(({ textContrast }) => textContrast < 4.5)).toEqual([]);
  expect(contrastResults.filter(({ name, textContrast }) => name === 'focus-visible indicator' && textContrast < 3)).toEqual([]);
  expect(contrastResults.find(({ name }) => name === 'focus-visible indicator')?.outlineStyle).not.toBe('none');
});

test('keyboard focus remains visible while reaching the theme control', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  await page.keyboard.press('Tab');
  let focusedElement = page.locator(':focus');
  await expect(focusedElement).toBeVisible();

  for (let index = 0; index < 12; index += 1) {
    const outlineStyle = await focusedElement.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(outlineStyle).not.toBe('none');
    await page.keyboard.press('Tab');
    focusedElement = page.locator(':focus');
    if ((await focusedElement.getAttribute('aria-label')) === 'Włącz ciemny motyw') break;
  }

  await expect(page.getByRole('button', { name: 'Włącz ciemny motyw' })).toBeFocused();
});

test('mobile navigation does not cover a focused page action', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  const action = page.getByRole('main').getByRole('link', { name: '+ Nowa faktura' });
  await action.focus();
  const actionBox = await action.boundingBox();
  const mobileNavigationBox = await page.getByRole('navigation', { name: 'Mobilna nawigacja dashboardu' }).boundingBox();

  expect(actionBox).not.toBeNull();
  expect(mobileNavigationBox).not.toBeNull();
  expect((actionBox?.y ?? 0) + (actionBox?.height ?? 0)).toBeLessThanOrEqual(mobileNavigationBox?.y ?? 0);
});

test('scrolling and focusing content accounts for the wrapped mobile sticky header', async ({ authenticatedPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  const target = page.getByRole('heading', { name: 'Ostatnie faktury' });
  await target.evaluate((element) => {
    element.setAttribute('tabindex', '-1');
    element.scrollIntoView({ block: 'start' });
    (element as HTMLElement).focus();
  });

  const positions = await page.evaluate(() => {
    const header = document.querySelector('[data-sticky-header]');
    const focusedElement = document.activeElement;
    return {
      headerHeight: getComputedStyle(document.documentElement).getPropertyValue('--app-header-height'),
      headerBottom: header?.getBoundingClientRect().bottom ?? 0,
      focusedTop: focusedElement?.getBoundingClientRect().top ?? 0,
    };
  });

  expect(positions.headerHeight).toMatch(/\d/);
  expect(positions.focusedTop).toBeGreaterThanOrEqual(positions.headerBottom);
});
