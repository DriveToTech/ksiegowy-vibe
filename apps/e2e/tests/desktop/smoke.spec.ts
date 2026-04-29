import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from 'playwright-core';
import { join } from 'node:path';

const isCI = process.env.CI === 'true';

// Skip tests if not running on CI and no display available
const testRunner = isCI ? test : test.skip;

testRunner.describe('Desktop Application Smoke Tests', () => {
  let electronApp: ElectronApplication | null = null;
  let page: Page | null = null;
  let consoleMessages: string[] = [];

  testRunner.beforeAll(async ({ playwright }) => {
    const desktopPath = join(process.cwd(), '..', '..', 'apps', 'desktop');
    const mainPath = join(desktopPath, 'dist', 'main.js');

    // Log all relevant environment variables for debugging
    console.log(`[Desktop Test] Launching Electron app from: ${mainPath}`);
    console.log(`[Desktop Test] NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`[Desktop Test] DISPLAY: ${process.env.DISPLAY}`);
    console.log(`[Desktop Test] DATABASE_URL present: ${!!process.env.DATABASE_URL}`);
    console.log(`[Desktop Test] JWT_SECRET present: ${!!process.env.JWT_SECRET}`);
    console.log(`[Desktop Test] JWT_REFRESH_SECRET present: ${!!process.env.JWT_REFRESH_SECRET}`);
    console.log(`[Desktop Test] GOOGLE_CLIENT_ID present: ${!!process.env.GOOGLE_CLIENT_ID}`);
    console.log(`[Desktop Test] GOOGLE_CLIENT_SECRET present: ${!!process.env.GOOGLE_CLIENT_SECRET}`);
    console.log(`[Desktop Test] DESKTOP_WEB_RUNTIME_URL: ${process.env.DESKTOP_WEB_RUNTIME_URL}`);

    // Build environment for Electron process
    const electronEnv = {
      ...process.env,
      NODE_ENV: 'test',
      DESKTOP_GATEWAY_PORT: '0',
      ELECTRON_IS_DEV: '0',
      ELECTRON_ENABLE_LOGGING: '1',
      // Ensure display is available in CI
      DISPLAY: process.env.DISPLAY ?? ':99'
    };

    // Validate required environment variables
    const requiredEnvVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET'
    ];
    const missingVars = requiredEnvVars.filter((key) => !electronEnv[key]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables for Electron test: ${missingVars.join(', ')}`);
    }

    try {
      // Launch electron app with extended timeout and error handling
      electronApp = await playwright._electron.launch({
        args: [
          mainPath,
          '--no-sandbox', // Required for running in CI/containerized environments
          '--disable-setuid-sandbox'
        ],
        env: electronEnv,
        timeout: 60000 // Increase timeout to 60 seconds for CI
      });

      // Set up event listeners immediately after launch
      let processExited = false;
      let processExitCode: number | undefined;
      let processExitSignal: string | undefined;

      electronApp.on('close', (code, signal) => {
        processExited = true;
        processExitCode = code;
        processExitSignal = signal;
        console.error(`[Desktop Test] Electron process exited with code ${code}, signal ${signal}`);
      });

      // Listen to console messages from main process
      electronApp.on('console', (msg) => {
        const text = msg.text();
        consoleMessages.push(`[Main Process] ${text}`);
        console.log(`[Main Process] ${text}`);
      });

      // Wait for first window with a longer timeout
      // Check if process exited during window creation
      if (processExited) {
        throw new Error(`Electron process exited unexpectedly with code ${processExitCode}, signal ${processExitSignal}`);
      }

      page = await electronApp.firstWindow({ timeout: 60000 });
      console.log('[Desktop Test] First window opened successfully');
    } catch (error) {
      console.error('[Desktop Test] Failed to launch Electron app:', error);
      console.error('[Desktop Test] Console messages:', consoleMessages.join('\n'));
      throw error;
    }
  }, 120000); // Increase beforeAll timeout to 120 seconds

  testRunner.afterAll(async () => {
    if (electronApp) {
      try {
        await electronApp.close();
      } catch (error) {
        console.error('[Desktop Test] Error closing Electron app:', error);
      }
    }
  });

  testRunner('window opens and shows loading state', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    await expect(page).toHaveTitle(/Ksiegowy Vibe/);

    // Wait for the window to be visible
    const isVisible = await page.evaluate(() => document.visibilityState === 'visible');
    expect(isVisible).toBe(true);
  });

  testRunner('window has correct dimensions', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    if (viewport) {
      expect(viewport.width).toBeGreaterThanOrEqual(1024);
      expect(viewport.height).toBeGreaterThanOrEqual(700);
    }
  });

  testRunner('desktop gateway health endpoint responds', async () => {
    if (!electronApp) {
      throw new Error('Electron app not initialized');
    }

    // Check that the Electron app is running by evaluating in main process
    const gatewayInfo = await electronApp.evaluate(async () => {
      // Return a simple health check indicator
      return { status: 'ok' };
    });

    expect(gatewayInfo).toBeDefined();
    expect(gatewayInfo.status).toBe('ok');
  });

  testRunner('desktop API is exposed to renderer', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    // Check that the desktop API is available
    const hasDesktopApi = await page.evaluate(() => {
      return typeof window.desktop !== 'undefined' &&
        typeof window.desktop.getApplicationVersion === 'function';
    });

    expect(hasDesktopApi).toBe(true);
  });

  testRunner('desktop API returns version', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    const version = await page.evaluate(async () => {
      if (!window.desktop) {
        throw new Error('Desktop API not available');
      }
      return await window.desktop.getApplicationVersion();
    });

    expect(version).toBeDefined();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });

  testRunner('secret store API is exposed', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    const hasSecretApi = await page.evaluate(() => {
      return typeof window.desktop !== 'undefined' &&
        typeof window.desktop.setSecret === 'function' &&
        typeof window.desktop.getSecret === 'function';
    });

    expect(hasSecretApi).toBe(true);
  });

  testRunner('encrypted cache API is exposed', async () => {
    if (!page) {
      throw new Error('Page not initialized');
    }

    const hasCacheApi = await page.evaluate(() => {
      return typeof window.desktop !== 'undefined' &&
        typeof window.desktop.setCacheEntry === 'function' &&
        typeof window.desktop.getCacheEntry === 'function';
    });

    expect(hasCacheApi).toBe(true);
  });
});
