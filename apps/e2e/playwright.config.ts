import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const isVisualRegression = process.env.VISUAL_REGRESSION === 'true';
const e2eAppPort = 3200;
const e2eApiPort = 3199;
const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
  ...(isVisualRegression
    ? [
        {
          name: 'chromium-linux',
          testMatch: /(dashboard|invoices-visual|advisor-visual)\.spec\.ts/,
          use: { ...devices['Desktop Chrome'] },
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './tests',
  snapshotPathTemplate: '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}',
  // The mock API keeps mutable fixture maps in one process. A single worker keeps
  // mutation tests isolated without multiplying the browser project matrix.
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : [['html', { open: 'on-failure' }]],
  expect: { toHaveScreenshot: { stylePath: './tests/fixtures/visual-stability.css' } },
  use: {
    baseURL: `http://localhost:${e2eAppPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects,
  webServer: [
    {
      command: 'node mock-api/server.js',
      url: `http://localhost:${e2eApiPort}/health`,
      reuseExistingServer: false,
      env: { MOCK_API_PORT: String(e2eApiPort) },
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Functional runs use `next dev` so browser-side NEXT_PUBLIC_* values are compiled with the mock API URL.
      // Visual runs use a production build with the same env: no on-demand compilation, no dev error overlay
      // in screenshots, and the build is reused by every worker.
      command: isVisualRegression
        ? `pnpm --filter @ksiegowy/web exec next build --webpack && pnpm --filter @ksiegowy/web exec next start -p ${e2eAppPort}`
        : `pnpm --filter @ksiegowy/web exec next dev --webpack -p ${e2eAppPort}`,
      url: `http://localhost:${e2eAppPort}`,
      reuseExistingServer: false,
      timeout: isVisualRegression ? 300_000 : 120_000,
      env: {
        NEXT_DIST_DIR: isVisualRegression ? '.next-visual' : '.next',
        API_URL: `http://localhost:${e2eApiPort}`,
        NEXT_PUBLIC_API_URL: `http://localhost:${e2eApiPort}`,
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
