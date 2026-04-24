'use client';

import { useState } from 'react';
import { Button } from '../atoms/Button';

interface DesktopGoogleLoginButtonProps {
  browserAuthUrl: string;
  label: string;
}

export function DesktopGoogleLoginButton({
  browserAuthUrl,
  label,
}: DesktopGoogleLoginButtonProps) {
  const [isStartingAuthentication, setIsStartingAuthentication] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleClick() {
    if (typeof window === 'undefined') {
      return;
    }

    if (!window.desktop?.startGoogleAuthentication) {
      window.location.assign(browserAuthUrl);
      return;
    }

    setIsStartingAuthentication(true);
    setErrorMessage(null);

    window.desktop
      .startGoogleAuthentication()
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not start desktop Google sign-in.'
        );
      })
      .finally(() => {
        setIsStartingAuthentication(false);
      });
  }

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full"
        onClick={handleClick}
        disabled={isStartingAuthentication}
      >
        {isStartingAuthentication ? 'Otwieranie Google…' : label}
      </Button>
      {errorMessage ? (
        <p role="alert" className="text-sm text-error">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
