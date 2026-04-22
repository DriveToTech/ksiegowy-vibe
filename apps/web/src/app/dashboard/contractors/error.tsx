'use client';

import { RouteErrorState } from '../../../components/templates/RouteErrorState';

export default function ContractorsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Błąd widoku kontrahentów"
      error={error}
      reset={reset}
      backHref="/dashboard/contractors"
      backLabel="Wróć do kontrahentów"
    />
  );
}
