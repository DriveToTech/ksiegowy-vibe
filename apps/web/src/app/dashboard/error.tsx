'use client';

import { RouteErrorState } from '../../components/templates/RouteErrorState';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState title="Błąd dashboardu" error={error} reset={reset} />;
}
