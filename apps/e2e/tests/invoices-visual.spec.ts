import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/auth';

const widths = [1280, 768, 390] as const;
const themes = ['light', 'dark'] as const;
const screens = [
  { name: 'invoices-list', path: '/dashboard/invoices', ready: 'Faktury sprzedażowe' },
  { name: 'invoice-new', path: '/dashboard/invoices/new', ready: 'Nowa faktura' },
] as const;

// Dates are relative to the run date and the white-list check time is "now". Pinning them in the DOM keeps the layout
// stable without hiding whole table cells behind a mask.
async function pinVolatileDates(page: Page) {
  await page.evaluate(() => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      node.textContent = (node.textContent ?? '')
        .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{4}/g, '01.01.2026')
        .replace(/\d{4}-\d{2}-\d{2}/g, '2026-01-01')
        .replace(/\b\d{2}:\d{2}\b/g, '12:00');
    }
    document.querySelectorAll<HTMLInputElement>('input[type="date"]').forEach((input) => {
      input.value = '2026-01-01';
    });
  });
}

for (const screen of screens) {
  for (const theme of themes) {
    for (const width of widths) {
      test(`visual: ${screen.name} ${theme} ${width}`, async ({ authenticatedPage: page }, testInfo) => {
        test.skip(testInfo.project.name !== 'chromium-linux');
        await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
        await page.addInitScript((selectedTheme) => localStorage.setItem('ksiegowy-theme', selectedTheme), theme);
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { name: screen.ready })).toBeVisible();
        if (screen.name === 'invoice-new') await expect(page.getByRole('status').filter({ hasText: 'sprawdzono' })).toBeVisible();

        // The Next dev overlay badge (caused by the mock's missing advisor insights) is not part of the UI.
        await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
        // The dashboard scrolls inside its shell, so fullPage alone captures one viewport: grow the viewport to the content.
        const contentHeight = await page.evaluate(() => {
          let scroller: HTMLElement | null = document.querySelector('#dashboard-content');
          while (scroller && scroller.scrollHeight <= scroller.clientHeight) scroller = scroller.parentElement;
          return scroller ? window.innerHeight + scroller.scrollHeight - scroller.clientHeight : window.innerHeight;
        });
        await page.setViewportSize({ width, height: contentHeight });
        await page.waitForLoadState('networkidle');
        await pinVolatileDates(page);
        const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

        await expect(page).toHaveScreenshot(`${screen.name}-${theme}-${width}.png`, {
          animations: 'disabled',
          fullPage: true,
        });
      });
    }
  }
}
