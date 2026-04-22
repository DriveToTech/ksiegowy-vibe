import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const e2eAppPort = 3200;
const e2eApiPort = 3199;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['html', { open: 'never' }], ['github']] : [['html', { open: 'on-failure' }]],
  use: {
    baseURL: `http://localhost:${e2eAppPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
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
      // Use `next dev` in e2e so browser-side NEXT_PUBLIC_* env values are compiled with
      // the mock API URL for this test run. `next start` would serve a previously built bundle
      // where NEXT_PUBLIC_API_URL may still point at the default backend, breaking client mutations.
      command: `pnpm --filter @ksiegowy/web exec next dev -p ${e2eAppPort}`,
      url: `http://localhost:${e2eAppPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_URL: `http://localhost:${e2eApiPort}`,
        NEXT_PUBLIC_API_URL: `http://localhost:${e2eApiPort}`,
      },
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
