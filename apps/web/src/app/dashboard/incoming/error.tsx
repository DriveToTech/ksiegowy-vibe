'use client';

import { RouteErrorState } from '../../../components/templates/RouteErrorState';

export default function IncomingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Błąd widoku OCR"
      error={error}
      reset={reset}
      backHref="/dashboard/incoming"
      backLabel="Wróć do faktur przychodzących"
    />
  );
}
