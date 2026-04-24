import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi, DesktopPendingAuthenticationCallback } from './desktop-api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parsePendingDesktopAuthenticationCallback(value: unknown): DesktopPendingAuthenticationCallback | null {
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
  consumePendingDesktopAuthenticationCallback: () =>
    ipcRenderer
      .invoke('desktop:consume-pending-desktop-authentication-callback')
      .then(parsePendingDesktopAuthenticationCallback)
};

contextBridge.exposeInMainWorld('desktop', desktopApi);
