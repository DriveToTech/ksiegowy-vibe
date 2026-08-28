'use client';

import { RouteErrorState } from '../../components/templates/RouteErrorState';

export default function HouseholdError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState title="Błąd gospodarstwa domowego" error={error} reset={reset} backHref="/household" />;
}
