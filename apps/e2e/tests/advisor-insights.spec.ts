import { test, expect } from './fixtures/auth';

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`contractor insight dismissal is per contractor and environment and survives navigation at ${viewport.width}px`, async ({ authenticatedPage: page }) => {
    await page.setViewportSize(viewport);
    const dismissals = new Set<string>();
    const reads: string[] = [];
    let otherWrites = 0;
    const insight = (key: string, title: string, invoiceId: string) => ({
      key, version: 1, title, description: 'Sprawdź dokument źródłowy.',
      evidence: [{ kind: 'outgoing', id: invoiceId, title: `FV/${invoiceId}` }],
    });
    await page.route('**/companies/test-company-id/advisor/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;
      if (path.endsWith('/insights')) {
        const view = url.searchParams.get('view');
        const contractorId = url.searchParams.get('contractorId');
        reads.push(`${view}:${contractorId ?? ''}:${request.headers()['x-ksef-environment']}`);
        const available = view === 'contractors'
          ? insight(`contractor-balance:${contractorId}`, `Saldo ${contractorId}`, contractorId ?? '')
          : view === 'invoices' ? insight('rejected-invoice', 'Odrzucona faktura KSeF', 'rejected-id') : null;
        return route.fulfill({ json: available && !dismissals.has(`${request.headers()['x-ksef-environment']}:${available.key}`) ? available : null });
      }
      if (path.endsWith('/dismiss')) {
        expect(request.method()).toBe('POST');
        expect(request.headers()['x-ksef-environment']).toBe('TEST');
        dismissals.add(`${request.headers()['x-ksef-environment']}:${decodeURIComponent(path.split('/').at(-2) ?? '')}`);
        return route.fulfill({ json: { dismissed: true } });
      }
      if (path.endsWith('/settings')) return route.fulfill({ json: {
        enabled: true, operatorEnabled: true, canManagePolicy: false, canManageConnections: true, allowedProviders: ['OPENAI'], allowedConnectors: [],
        retentionDays: 30, ollamaAvailable: false, reviewedSourceCount: 0,
        connections: [{ provider: 'OPENAI', model: 'configured-model', hasCredential: true, testedAt: null }],
      } });
      if (request.method() !== 'GET') otherWrites++;
      return route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
    });
    await page.goto('/dashboard/contractors');
    const first = page.getByRole('complementary', { name: 'Wskazówka doradcy' });
    await expect(first).toContainText('Saldo test-contractor-id');
    await expect(first.getByRole('link', { name: /FV\/test-contractor-id/ })).toHaveAttribute('href', '/dashboard/invoices/test-contractor-id');
    // Hiding starts an undo window; the dismissal is sent only when the window closes or the strip unmounts.
    await first.getByRole('button', { name: 'Ukryj wskazówkę' }).click();
    await expect(first).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'Ukryto wskazówkę „Saldo test-contractor-id”.' })).toBeVisible();
    expect(dismissals.size).toBe(0);
    await page.getByRole('button', { name: 'Cofnij' }).click();
    await expect(first).toContainText('Saldo test-contractor-id');
    expect(dismissals.size).toBe(0);
    await first.getByRole('button', { name: 'Ukryj wskazówkę' }).click();
    await expect.poll(() => dismissals.size, { timeout: 15_000 }).toBe(1);
    await page.goto('/dashboard/contractors');
    await expect(page.getByRole('complementary', { name: 'Wskazówka doradcy' })).toHaveCount(0);
    if (viewport.width < 1280) await page.getByRole('button', { name: /Juniper Fictional Works LLC/ }).click();
    else await page.getByRole('button', { name: 'Juniper Fictional Works LLC' }).click();
    await expect(page.getByRole('complementary', { name: 'Wskazówka doradcy' })).toContainText('Saldo test-contractor-second-id');
    expect(reads).toContain('contractors:test-contractor-id:TEST');
    expect(reads).toContain('contractors:test-contractor-second-id:TEST');
    expect(otherWrites).toBe(0);
    await page.evaluate(() => { document.cookie = 'active_ksef_environment_test-company-id=PRODUCTION; path=/; SameSite=Lax'; });
    await page.goto('/dashboard/contractors');
    await expect(page.getByRole('complementary', { name: 'Wskazówka doradcy' })).toContainText('Saldo test-contractor-id');
    expect(reads).toContain('contractors:test-contractor-id:PRODUCTION');
  });
}

test('dashboard, invoices and incoming show at most one evidenced strip with no accounting mutation', async ({ authenticatedPage: page }) => {
  const requestedViews: string[] = [];
  await page.route('**/companies/test-company-id/advisor/insights*', async (route) => {
    const request = route.request();
    const view = new URL(request.url()).searchParams.get('view') ?? '';
    requestedViews.push(view);
    const incoming = view === 'incoming';
    return route.fulfill({ json: { key: incoming ? 'incoming-review' : 'rejected-invoice', version: 1,
      title: incoming ? 'Dokument do sprawdzenia' : 'Odrzucona faktura KSeF',
      description: 'Sprawdź dokument źródłowy.', evidence: [{ kind: incoming ? 'incoming' : 'outgoing', id: 'evidence-1', title: 'FV/1' }] } });
  });
  for (const [path, view] of [['/dashboard', 'dashboard'], ['/dashboard/invoices', 'invoices'], ['/dashboard/incoming', 'incoming']] as const) {
    await page.goto(path);
    const strips = page.getByRole('complementary', { name: 'Wskazówka doradcy' });
    await expect(strips).toHaveCount(1);
    await expect(strips.getByRole('link', { name: /FV\/1/ })).toHaveAttribute('href', `/dashboard/${view === 'incoming' ? 'incoming' : 'invoices'}/evidence-1`);
    await expect(strips.getByRole('button', { name: 'Ukryj wskazówkę' })).toBeVisible();
  }
  for (const view of ['dashboard', 'invoices', 'incoming']) expect(requestedViews).toContain(view);
});
