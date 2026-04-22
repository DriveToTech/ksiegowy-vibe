'use client';

import Link from 'next/link';
import { Button } from '../atoms/Button';
import { ErrorState } from '../molecules/ErrorState';

interface RouteErrorStateProps {
  title?: string;
  error: Error & { digest?: string };
  reset: () => void;
  backHref?: string;
  backLabel?: string;
}

export function RouteErrorState({
  title = 'Nie udało się wczytać widoku',
  error,
  reset,
  backHref = '/dashboard',
  backLabel = 'Wróć do dashboardu',
}: RouteErrorStateProps) {
  return (
    <div className="space-y-4">
      <ErrorState title={title} message={error.message || 'Wystąpił nieoczekiwany błąd.'} />
      <div className="flex flex-wrap gap-3 lg:pl-4">
        <Button onClick={reset}>Spróbuj ponownie</Button>
        <Link href={backHref}>
          <Button variant="secondary">{backLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
