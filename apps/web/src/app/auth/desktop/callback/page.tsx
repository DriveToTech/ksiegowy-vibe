'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../../components/atoms/Button';
import { Surface } from '../../../../components/atoms/Surface';
import { PublicPageLayout } from '../../../../components/templates/PublicPageLayout';

export default function DesktopAuthCallbackPage() {
  const [statusMessage, setStatusMessage] = useState('Finalizing desktop sign-in…');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!window.desktop?.consumePendingDesktopAuthenticationCallback) {
      setErrorMessage('Desktop sign-in callback is unavailable in this runtime.');
      return;
    }

    window.desktop
      .consumePendingDesktopAuthenticationCallback()
      .then(async (callback) => {
        if (!isActive) {
          return;
        }

        if (!callback) {
          throw new Error('Desktop sign-in callback was not found. Start the sign-in flow again.');
        }

        if (callback.status === 'error') {
          throw new Error(callback.errorDescription ?? callback.error);
        }

        setStatusMessage('Exchanging desktop sign-in for gateway cookies…');

        const response = await fetch('/auth/desktop/exchange', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            handoffCode: callback.handoffCode,
            desktopTransactionId: callback.transactionId,
            desktopCodeVerifier: callback.codeVerifier
          })
        });

        if (!response.ok) {
          const responseBody = await response.text().catch(() => '');
          throw new Error(
            responseBody || `Desktop sign-in exchange failed with status ${response.status}.`
          );
        }

        window.location.replace('/dashboard');
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : 'Desktop sign-in could not be completed.'
        );
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <PublicPageLayout className="items-center justify-center">
      <Surface tone="glass" shape="organic" className="mx-auto w-full max-w-md p-8 sm:p-10">
        <div className="space-y-4">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Desktop sign-in
          </h1>
          <p className="text-sm text-muted">
            {errorMessage ?? statusMessage}
          </p>
          {errorMessage ? (
            <Button size="lg" className="w-full" onClick={() => window.location.assign('/login')}>
              Back to login
            </Button>
          ) : null}
        </div>
      </Surface>
    </PublicPageLayout>
  );
}
