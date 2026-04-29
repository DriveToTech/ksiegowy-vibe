import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import type { DesktopPendingAuthenticationCallback } from './desktop-api';
import { getBundledApiUrl, startDesktopGateway } from './desktop-gateway';
import { ApiSidecar } from './api-sidecar';
import {
  setSecret,
  getSecret,
  deleteSecret,
  findCredentials
} from './secret-store';
import {
  setCacheEntry,
  getCacheEntry,
  deleteCacheEntry,
  hasCacheEntry,
  listCacheKeys,
  clearCache,
  getCacheSize,
  cleanupExpiredEntries
} from './encrypted-cache';

const defaultDesktopAuthCallbackUrl = 'ksiegowy-vibe://auth/desktop/callback';
const desktopGoogleAuthStartPath = '/auth/google';
const desktopAuthCallbackRoutePath = '/auth/desktop/callback';

type ParsedDesktopAuthenticationDeepLink =
  | {
      status: 'success';
      transactionId: string;
      handoffCode: string;
    }
  | {
      status: 'error';
      transactionId: string | null;
      error: string;
      errorDescription: string | null;
    };

let mainWindow: BrowserWindow | null = null;
let rendererUrl: URL | null = null;
let pendingDesktopAuthenticationCallback: DesktopPendingAuthenticationCallback | null = null;
let apiSidecar: ApiSidecar | null = null;

const pendingCodeVerifiersByTransactionId = new Map<string, string>();
const desktopAuthCallbackUrl = getDesktopAuthCallbackUrl();
const desktopAuthProtocol = desktopAuthCallbackUrl.protocol.replace(/:$/, '');
const allowedRendererHostnames = new Set(['127.0.0.1', 'localhost', '::1']);

function getDesktopAuthCallbackUrl(): URL {
  return new URL(process.env.DESKTOP_AUTH_CALLBACK_URL ?? defaultDesktopAuthCallbackUrl);
}

function isAllowedRendererNavigation(url: string, allowedOrigin: string): boolean {
  return new URL(url).origin === allowedOrigin;
}

function isTrustedRendererUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const usesAllowedProtocol = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    const usesAllowedHostname = allowedRendererHostnames.has(parsedUrl.hostname);

    return usesAllowedProtocol && usesAllowedHostname;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  const targetUrl = new URL(url);

  return targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:';
}

function assertAllowedRendererSender(senderUrl: string, allowedOrigin: string): void {
  if (!senderUrl || (!isAllowedRendererNavigation(senderUrl, allowedOrigin) && !isTrustedRendererUrl(senderUrl))) {
    throw new Error('Blocked renderer IPC call from an untrusted origin.');
  }
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function createCodeVerifier(): string {
  return toBase64Url(randomBytes(32));
}

function createCodeChallenge(codeVerifier: string): string {
  return toBase64Url(createHash('sha256').update(codeVerifier).digest());
}

function buildDesktopGoogleAuthenticationUrl(gatewayUrl: URL, transactionId: string, codeChallenge: string): URL {
  const authenticationUrl = new URL(desktopGoogleAuthStartPath, gatewayUrl);

  authenticationUrl.searchParams.set('clientTransactionId', transactionId);
  authenticationUrl.searchParams.set('clientCodeChallenge', codeChallenge);

  return authenticationUrl;
}

function isDesktopAuthenticationUrl(url: string): boolean {
  return url.startsWith(`${desktopAuthProtocol}://`);
}

function findDesktopAuthenticationUrl(values: string[]): string | null {
  return values.find(isDesktopAuthenticationUrl) ?? null;
}

function focusMainWindow(): void {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function navigateToDesktopAuthenticationCallbackRoute(): void {
  if (!mainWindow || !rendererUrl) {
    return;
  }

  const callbackUrl = new URL(desktopAuthCallbackRoutePath, rendererUrl);
  void mainWindow.loadURL(callbackUrl.toString());
}

function parseDesktopAuthenticationDeepLink(rawUrl: string): ParsedDesktopAuthenticationDeepLink | null {
  let callbackUrl: URL;

  try {
    callbackUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  if (callbackUrl.protocol !== desktopAuthCallbackUrl.protocol) {
    return null;
  }

  if (callbackUrl.host !== desktopAuthCallbackUrl.host || callbackUrl.pathname !== desktopAuthCallbackUrl.pathname) {
    return null;
  }

  const error = callbackUrl.searchParams.get('error');
  const errorDescription = callbackUrl.searchParams.get('errorDescription');
  const transactionId = callbackUrl.searchParams.get('transactionId');

  if (error) {
    return {
      status: 'error',
      transactionId,
      error,
      errorDescription
    };
  }

  const handoffCode = callbackUrl.searchParams.get('handoffCode');

  if (!transactionId || !handoffCode) {
    return null;
  }

  return {
    status: 'success',
    transactionId,
    handoffCode
  };
}

function storePendingDesktopAuthenticationCallback(
  callback: ParsedDesktopAuthenticationDeepLink
): DesktopPendingAuthenticationCallback {
  if (callback.status === 'error') {
    if (callback.transactionId) {
      pendingCodeVerifiersByTransactionId.delete(callback.transactionId);
    }

    pendingDesktopAuthenticationCallback = callback;
    return callback;
  }

  const codeVerifier = pendingCodeVerifiersByTransactionId.get(callback.transactionId);

  if (!codeVerifier) {
    pendingDesktopAuthenticationCallback = {
      status: 'error',
      transactionId: callback.transactionId,
      error: 'desktop_auth_transaction_not_found',
      errorDescription: 'Desktop sign-in session expired. Start the sign-in flow again.'
    };

    return pendingDesktopAuthenticationCallback;
  }

  pendingCodeVerifiersByTransactionId.delete(callback.transactionId);

  pendingDesktopAuthenticationCallback = {
    status: 'success',
    transactionId: callback.transactionId,
    handoffCode: callback.handoffCode,
    codeVerifier
  };

  return pendingDesktopAuthenticationCallback;
}

function handleDesktopAuthenticationDeepLink(rawUrl: string): void {
  const callback = parseDesktopAuthenticationDeepLink(rawUrl);

  if (!callback) {
    return;
  }

  storePendingDesktopAuthenticationCallback(callback);

  if (!app.isReady()) {
    return;
  }

  focusMainWindow();
  navigateToDesktopAuthenticationCallbackRoute();
}

function registerDesktopProtocolClient(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(desktopAuthProtocol, process.execPath, [resolve(process.argv[1])]);
    return;
  }

  app.setAsDefaultProtocolClient(desktopAuthProtocol);
}

function createMainWindow(currentRendererUrl: URL): BrowserWindow {
  const nextMainWindow = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      safeDialogs: true,
      devTools: !app.isPackaged
    }
  });

  nextMainWindow.once('ready-to-show', () => {
    nextMainWindow.show();
  });

  nextMainWindow.on('closed', () => {
    if (mainWindow === nextMainWindow) {
      mainWindow = null;
    }
  });

  nextMainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedRendererNavigation(url, currentRendererUrl.origin)) {
      return;
    }

    event.preventDefault();

    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  nextMainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedRendererNavigation(url, currentRendererUrl.origin)) {
      void nextMainWindow.loadURL(url);

      return { action: 'deny' };
    }

    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  nextMainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] level=${level} source=${sourceId}:${line} message=${message}`);
  });

  nextMainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(
      `[Renderer Load Failed] code=${errorCode} description=${errorDescription} url=${validatedUrl}`
    );
  });

  void nextMainWindow.loadURL(currentRendererUrl.toString());

  return nextMainWindow;
}

function registerDesktopHandlers(currentRendererUrl: URL): void {
  ipcMain.handle('desktop:get-application-version', (event) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return app.getVersion();
  });

  ipcMain.handle('desktop:open-external-url', (event, url: string) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    if (!isAllowedExternalUrl(url)) {
      throw new Error('Only HTTP and HTTPS URLs can be opened externally.');
    }

    return shell.openExternal(url).then(() => undefined);
  });

  ipcMain.handle('desktop:start-google-authentication', (event) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    const transactionId = randomUUID();
    const codeVerifier = createCodeVerifier();
    const codeChallenge = createCodeChallenge(codeVerifier);
    const authenticationUrl = buildDesktopGoogleAuthenticationUrl(currentRendererUrl, transactionId, codeChallenge);

    pendingCodeVerifiersByTransactionId.set(transactionId, codeVerifier);

    return shell.openExternal(authenticationUrl.toString()).catch((error: unknown) => {
      pendingCodeVerifiersByTransactionId.delete(transactionId);
      throw error;
    });
  });

  ipcMain.handle('desktop:consume-pending-authentication-callback', (event) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    const callback = pendingDesktopAuthenticationCallback;
    pendingDesktopAuthenticationCallback = null;

    return callback;
  });

  // Secret store handlers
  ipcMain.handle('desktop:set-secret', (event, service: string, account: string, secret: string) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return setSecret(service, account, secret);
  });

  ipcMain.handle('desktop:get-secret', (event, service: string, account: string) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return getSecret(service, account);
  });

  ipcMain.handle('desktop:delete-secret', (event, service: string, account: string) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return deleteSecret(service, account);
  });

  ipcMain.handle('desktop:find-credentials', (event, service: string) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return findCredentials(service);
  });

  // Encrypted cache handlers
  ipcMain.handle('desktop:set-cache-entry', (event, key: string, data: unknown, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return setCacheEntry(key, data, options);
  });

  ipcMain.handle('desktop:get-cache-entry', (event, key: string, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return getCacheEntry(key, options);
  });

  ipcMain.handle('desktop:delete-cache-entry', (event, key: string, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return deleteCacheEntry(key, options);
  });

  ipcMain.handle('desktop:has-cache-entry', (event, key: string, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return hasCacheEntry(key, options);
  });

  ipcMain.handle('desktop:list-cache-keys', (event, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return listCacheKeys(options);
  });

  ipcMain.handle('desktop:clear-cache', (event, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return clearCache(options);
  });

  ipcMain.handle('desktop:get-cache-size', (event, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return getCacheSize(options);
  });

  ipcMain.handle('desktop:cleanup-expired-entries', (event, maxAgeMs: number, options?: { subdirectory?: string }) => {
    assertAllowedRendererSender(event.senderFrame?.url ?? '', currentRendererUrl.origin);

    return cleanupExpiredEntries(maxAgeMs, options);
  });

  // Auto-updater handlers
  ipcMain.handle('desktop:check-for-updates', () => {
    // Auto-updater not yet implemented
    return { available: false, message: 'Auto-updater not implemented' };
  });

  ipcMain.handle('desktop:install-update', () => {
    // Auto-updater not yet implemented
    throw new Error('Auto-updater not implemented');
  });
}

async function startDesktopApplication(): Promise<void> {
  console.log('[Desktop] Starting desktop application...');

  await app.whenReady();
  console.log('[Desktop] App is ready');

  registerDesktopProtocolClient();
  console.log('[Desktop] Desktop protocol registered');

  // Start API sidecar before gateway to avoid infinite proxy loop
  apiSidecar = new ApiSidecar();

  apiSidecar.on('log', (entry) => {
    console.log(`[API Sidecar] ${entry.message}`);
  });

  apiSidecar.on('unhealthy', () => {
    console.error('[API Sidecar] Health check failed - API is unhealthy');
  });

  apiSidecar.on('failed', () => {
    console.error('[API Sidecar] Max restart attempts reached - API failed');
    app.quit();
  });

  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET'
  ];

  const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  console.log('[Desktop] All required environment variables present');

  const sidecarOptions: {
    databaseUrl: string;
    jwtSecret: string;
    jwtRefreshSecret: string;
    googleClientId?: string;
    googleClientSecret?: string;
    googleRedirectUri?: string;
    desktopAuthCallbackUrl?: string;
  } = {
    databaseUrl: process.env.DATABASE_URL!,
    jwtSecret: process.env.JWT_SECRET!,
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET!
  };

  if (process.env.GOOGLE_CLIENT_ID) {
    sidecarOptions.googleClientId = process.env.GOOGLE_CLIENT_ID;
  }

  if (process.env.GOOGLE_CLIENT_SECRET) {
    sidecarOptions.googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  }

  if (process.env.GOOGLE_REDIRECT_URI) {
    sidecarOptions.googleRedirectUri = process.env.GOOGLE_REDIRECT_URI;
  }

  sidecarOptions.desktopAuthCallbackUrl = process.env.DESKTOP_AUTH_CALLBACK_URL ?? defaultDesktopAuthCallbackUrl;

  console.log('[Desktop] Starting API sidecar...');
  const sidecarResult = await apiSidecar.start(sidecarOptions);
  const apiUrl = getBundledApiUrl(sidecarResult.port);
  console.log(`[Desktop] API sidecar started on port ${sidecarResult.port}, using URL: ${apiUrl.origin}`);

  console.log('[Desktop] Starting desktop gateway...');
  const desktopGateway = await startDesktopGateway(apiUrl);
  rendererUrl = new URL(desktopGateway.origin);
  console.log(`[Desktop] Desktop gateway started at ${rendererUrl.origin}`);

  app.on('before-quit', async () => {
    await desktopGateway.close().catch((error: unknown) => {
      console.error('Failed to close desktop gateway.', error);
    });

    if (apiSidecar) {
      await apiSidecar.stop().catch((error: unknown) => {
        console.error('Failed to stop API sidecar.', error);
      });
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  registerDesktopHandlers(rendererUrl);
  mainWindow = createMainWindow(rendererUrl);

  if (pendingDesktopAuthenticationCallback) {
    navigateToDesktopAuthenticationCallbackRoute();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && rendererUrl) {
      mainWindow = createMainWindow(rendererUrl);

      if (pendingDesktopAuthenticationCallback) {
        navigateToDesktopAuthenticationCallbackRoute();
      }
    }
  });
}

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDesktopAuthenticationDeepLink(url);
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const desktopAuthenticationUrl = findDesktopAuthenticationUrl(commandLine);

    if (desktopAuthenticationUrl) {
      handleDesktopAuthenticationDeepLink(desktopAuthenticationUrl);
      return;
    }

    focusMainWindow();
  });

  const initialDesktopAuthenticationUrl = findDesktopAuthenticationUrl(process.argv);

  if (initialDesktopAuthenticationUrl) {
    handleDesktopAuthenticationDeepLink(initialDesktopAuthenticationUrl);
  }

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught errors to prevent silent crashes
process.on('uncaughtException', (error: Error) => {
  console.error('[Desktop] Uncaught Exception:', error);
  console.error('[Desktop] Stack trace:', error.stack);
  app.quit();
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Desktop] Unhandled Rejection:', reason);
  app.quit();
});

startDesktopApplication().catch((error: unknown) => {
  console.error('[Desktop] Failed to start desktop application:', error);
  if (error instanceof Error && error.stack) {
    console.error('[Desktop] Stack trace:', error.stack);
  }
  app.quit();
});
}
