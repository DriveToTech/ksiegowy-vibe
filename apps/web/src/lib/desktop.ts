export interface BrowserPendingAuthenticationSuccess {
  status: 'success';
  transactionId: string;
  handoffCode: string;
  codeVerifier: string;
}

export interface BrowserPendingAuthenticationError {
  status: 'error';
  transactionId: string | null;
  error: string;
  errorDescription: string | null;
}

export type BrowserPendingAuthenticationResult =
  | BrowserPendingAuthenticationSuccess
  | BrowserPendingAuthenticationError;

export interface BrowserSecretCredentials {
  account: string;
  password: string;
}

export interface BrowserClientAuthApi {
  startGoogleAuthentication: () => Promise<void>;
  consumePendingAuthenticationCallback: () => Promise<BrowserPendingAuthenticationResult | null>;
}

export interface BrowserSecretStoreApi {
  setSecret: (service: string, account: string, secret: string) => Promise<void>;
  getSecret: (service: string, account: string) => Promise<string | null>;
  deleteSecret: (service: string, account: string) => Promise<boolean>;
  findCredentials: (service: string) => Promise<BrowserSecretCredentials[]>;
}

export interface BrowserCacheEntryOptions {
  subdirectory?: string;
}

export interface BrowserEncryptedCacheApi {
  setCacheEntry: (key: string, data: unknown, options?: BrowserCacheEntryOptions) => Promise<void>;
  getCacheEntry: <T = unknown>(key: string, options?: BrowserCacheEntryOptions) => Promise<T | null>;
  deleteCacheEntry: (key: string, options?: BrowserCacheEntryOptions) => Promise<boolean>;
  hasCacheEntry: (key: string, options?: BrowserCacheEntryOptions) => Promise<boolean>;
  listCacheKeys: (options?: BrowserCacheEntryOptions) => Promise<string[]>;
  clearCache: (options?: BrowserCacheEntryOptions) => Promise<number>;
  getCacheSize: (options?: BrowserCacheEntryOptions) => Promise<number>;
  cleanupExpiredEntries: (maxAgeMs: number, options?: BrowserCacheEntryOptions) => Promise<number>;
}

export interface BrowserUpdateCheckResult {
  available: boolean;
  version?: string;
  releaseDate?: string;
  message: string;
}

export interface BrowserAutoUpdateApi {
  checkForUpdates: () => Promise<BrowserUpdateCheckResult>;
  installUpdate: () => Promise<void>;
}

export interface BrowserDesktopApi
  extends BrowserClientAuthApi,
    BrowserSecretStoreApi,
    BrowserEncryptedCacheApi,
    BrowserAutoUpdateApi {}

declare global {
  interface Window {
    desktop?: BrowserDesktopApi;
  }
}

export {};
