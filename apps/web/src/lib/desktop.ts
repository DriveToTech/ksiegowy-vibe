export interface BrowserDesktopPendingAuthenticationCallbackSuccess {
  status: 'success';
  transactionId: string;
  handoffCode: string;
  codeVerifier: string;
}

export interface BrowserDesktopPendingAuthenticationCallbackError {
  status: 'error';
  transactionId: string | null;
  error: string;
  errorDescription: string | null;
}

export type BrowserDesktopPendingAuthenticationCallback =
  | BrowserDesktopPendingAuthenticationCallbackSuccess
  | BrowserDesktopPendingAuthenticationCallbackError;

export interface BrowserDesktopApi {
  startGoogleAuthentication: () => Promise<void>;
  consumePendingDesktopAuthenticationCallback: () => Promise<BrowserDesktopPendingAuthenticationCallback | null>;
}

declare global {
  interface Window {
    desktop?: BrowserDesktopApi;
  }
}

export {};
