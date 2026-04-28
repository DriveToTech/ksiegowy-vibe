export interface ClientPendingAuthenticationSuccess {
  status: 'success';
  transactionId: string;
  handoffCode: string;
  codeVerifier: string;
}

export interface ClientPendingAuthenticationError {
  status: 'error';
  transactionId: string | null;
  error: string;
  errorDescription: string | null;
}

export type ClientPendingAuthenticationResult =
  | ClientPendingAuthenticationSuccess
  | ClientPendingAuthenticationError;

export interface SecretCredentials {
  account: string;
  password: string;
}

export interface ClientAuthApi {
  getApplicationVersion: () => Promise<string>;
  openExternalUrl: (url: string) => Promise<void>;
  startGoogleAuthentication: () => Promise<void>;
  consumePendingAuthenticationCallback: () => Promise<ClientPendingAuthenticationResult | null>;
}

export interface SecretStoreApi {
  setSecret: (service: string, account: string, secret: string) => Promise<void>;
  getSecret: (service: string, account: string) => Promise<string | null>;
  deleteSecret: (service: string, account: string) => Promise<boolean>;
  findCredentials: (service: string) => Promise<SecretCredentials[]>;
}

export interface CacheEntryOptions {
  subdirectory?: string;
}

export interface EncryptedCacheApi {
  setCacheEntry: (key: string, data: unknown, options?: CacheEntryOptions) => Promise<void>;
  getCacheEntry: <T = unknown>(key: string, options?: CacheEntryOptions) => Promise<T | null>;
  deleteCacheEntry: (key: string, options?: CacheEntryOptions) => Promise<boolean>;
  hasCacheEntry: (key: string, options?: CacheEntryOptions) => Promise<boolean>;
  listCacheKeys: (options?: CacheEntryOptions) => Promise<string[]>;
  clearCache: (options?: CacheEntryOptions) => Promise<number>;
  getCacheSize: (options?: CacheEntryOptions) => Promise<number>;
  cleanupExpiredEntries: (maxAgeMs: number, options?: CacheEntryOptions) => Promise<number>;
}

export interface UpdateCheckResult {
  available: boolean;
  version?: string;
  releaseDate?: string;
  message: string;
}

export interface AutoUpdateApi {
  checkForUpdates: () => Promise<UpdateCheckResult>;
  installUpdate: () => Promise<void>;
}

export interface DesktopApi extends ClientAuthApi, SecretStoreApi, EncryptedCacheApi, AutoUpdateApi {}

export type DesktopPendingAuthenticationCallback = ClientPendingAuthenticationResult;
