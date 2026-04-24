export interface DesktopPendingAuthenticationCallbackSuccess {
  status: 'success';
  transactionId: string;
  handoffCode: string;
  codeVerifier: string;
}

export interface DesktopPendingAuthenticationCallbackError {
  status: 'error';
  transactionId: string | null;
  error: string;
  errorDescription: string | null;
}

export type DesktopPendingAuthenticationCallback =
  | DesktopPendingAuthenticationCallbackSuccess
  | DesktopPendingAuthenticationCallbackError;

export interface DesktopApi {
  getApplicationVersion: () => Promise<string>;
  openExternalUrl: (url: string) => Promise<void>;
  startGoogleAuthentication: () => Promise<void>;
  consumePendingDesktopAuthenticationCallback: () => Promise<DesktopPendingAuthenticationCallback | null>;
}
