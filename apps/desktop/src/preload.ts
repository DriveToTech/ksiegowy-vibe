import { contextBridge, ipcRenderer } from 'electron';
import type {
  ClientPendingAuthenticationResult,
  DesktopApi,
  SecretCredentials,
  UpdateCheckResult
} from './desktop-api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePendingAuthenticationCallback(value: unknown): ClientPendingAuthenticationResult | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new Error('Desktop authentication callback response is invalid.');
  }

  if (value.status === 'success') {
    if (
      typeof value.transactionId !== 'string' ||
      typeof value.handoffCode !== 'string' ||
      typeof value.codeVerifier !== 'string'
    ) {
      throw new Error('Desktop authentication callback success payload is invalid.');
    }

    return {
      status: 'success',
      transactionId: value.transactionId,
      handoffCode: value.handoffCode,
      codeVerifier: value.codeVerifier
    };
  }

  if (value.status === 'error') {
    if (
      (value.transactionId !== null && typeof value.transactionId !== 'string') ||
      typeof value.error !== 'string' ||
      (value.errorDescription !== null && typeof value.errorDescription !== 'string')
    ) {
      throw new Error('Desktop authentication callback error payload is invalid.');
    }

    return {
      status: 'error',
      transactionId: value.transactionId,
      error: value.error,
      errorDescription: value.errorDescription
    };
  }

  throw new Error('Desktop authentication callback response is invalid.');
}

function parseSecretCredentials(value: unknown): SecretCredentials[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is SecretCredentials => {
    if (!isRecord(item)) {
      return false;
    }

    return typeof item.account === 'string' && typeof item.password === 'string';
  });
}

const desktopApi: DesktopApi = {
  getApplicationVersion: () =>
    ipcRenderer.invoke('desktop:get-application-version').then((value) => {
      if (typeof value !== 'string') {
        throw new Error('Desktop application version response is invalid.');
      }

      return value;
    }),
  openExternalUrl: (url: string) =>
    ipcRenderer.invoke('desktop:open-external-url', url).then(() => undefined),
  startGoogleAuthentication: () =>
    ipcRenderer.invoke('desktop:start-google-authentication').then(() => undefined),
  consumePendingAuthenticationCallback: () =>
    ipcRenderer
      .invoke('desktop:consume-pending-authentication-callback')
      .then(parsePendingAuthenticationCallback),
  setSecret: (service: string, account: string, secret: string) =>
    ipcRenderer.invoke('desktop:set-secret', service, account, secret).then(() => undefined),
  getSecret: (service: string, account: string) =>
    ipcRenderer.invoke('desktop:get-secret', service, account).then((value) => {
      if (value === null) {
        return null;
      }

      if (typeof value !== 'string') {
        throw new Error('Secret store get response is invalid.');
      }

      return value;
    }),
  deleteSecret: (service: string, account: string) =>
    ipcRenderer.invoke('desktop:delete-secret', service, account).then((value) => {
      if (typeof value !== 'boolean') {
        throw new Error('Secret store delete response is invalid.');
      }

      return value;
    }),
  findCredentials: (service: string) =>
    ipcRenderer.invoke('desktop:find-credentials', service).then(parseSecretCredentials),
  setCacheEntry: (key: string, data: unknown, options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:set-cache-entry', key, data, options).then(() => undefined),
  getCacheEntry: <T = unknown>(key: string, options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:get-cache-entry', key, options).then((value) => value as T | null),
  deleteCacheEntry: (key: string, options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:delete-cache-entry', key, options).then((value) => {
      if (typeof value !== 'boolean') {
        throw new Error('Cache delete response is invalid.');
      }
      return value;
    }),
  hasCacheEntry: (key: string, options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:has-cache-entry', key, options).then((value) => {
      if (typeof value !== 'boolean') {
        throw new Error('Cache has entry response is invalid.');
      }
      return value;
    }),
  listCacheKeys: (options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:list-cache-keys', options).then((value) => {
      if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) {
        throw new Error('Cache list keys response is invalid.');
      }
      return value as string[];
    }),
  clearCache: (options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:clear-cache', options).then((value) => {
      if (typeof value !== 'number') {
        throw new Error('Cache clear response is invalid.');
      }
      return value;
    }),
  getCacheSize: (options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:get-cache-size', options).then((value) => {
      if (typeof value !== 'number') {
        throw new Error('Cache size response is invalid.');
      }
      return value;
    }),
  cleanupExpiredEntries: (maxAgeMs: number, options?: { subdirectory?: string }) =>
    ipcRenderer.invoke('desktop:cleanup-expired-entries', maxAgeMs, options).then((value) => {
      if (typeof value !== 'number') {
        throw new Error('Cache cleanup response is invalid.');
      }
      return value;
    }),
  checkForUpdates: () =>
    ipcRenderer.invoke('desktop:check-for-updates').then((value: unknown) => {
      if (!isRecord(value) || typeof value.available !== 'boolean' || typeof value.message !== 'string') {
        throw new Error('Update check response is invalid.');
      }
      return {
        available: value.available,
        version: typeof value.version === 'string' ? value.version : undefined,
        releaseDate: typeof value.releaseDate === 'string' ? value.releaseDate : undefined,
        message: value.message
      } as UpdateCheckResult;
    }),
  installUpdate: () => ipcRenderer.invoke('desktop:install-update').then(() => undefined)
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
