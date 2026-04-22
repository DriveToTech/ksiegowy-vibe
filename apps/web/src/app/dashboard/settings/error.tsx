'use client';

import { RouteErrorState } from '../../../components/templates/RouteErrorState';

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Błąd ustawień"
      error={error}
      reset={reset}
      backHref="/dashboard/settings"
      backLabel="Wróć do ustawień"
    />
  );
}
