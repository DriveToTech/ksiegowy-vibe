'use client';

import { RouteErrorState } from '../../../components/templates/RouteErrorState';

export default function InvoicesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Błąd widoku faktur"
      error={error}
      reset={reset}
      backHref="/dashboard/invoices"
      backLabel="Wróć do faktur"
    />
  );
}
