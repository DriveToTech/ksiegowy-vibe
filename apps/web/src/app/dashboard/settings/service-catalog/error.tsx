'use client';

import { RouteErrorState } from '../../../../components/templates/RouteErrorState';

export default function ServiceCatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorState
      title="Błąd katalogu usług"
      error={error}
      reset={reset}
      backHref="/dashboard/settings/service-catalog"
      backLabel="Wróć do katalogu usług"
    />
  );
}
