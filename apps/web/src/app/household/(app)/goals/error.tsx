'use client';

import { Button } from '../../../../components/atoms/Button';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { t } from '../../../../lib/translations';

export default function HouseholdGoalsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="space-y-4">
      <ErrorState title="Błąd oszczędności i celów" message="Nie udało się wczytać tego widoku. Dane finansowe nie zostały zmienione." />
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>Spróbuj ponownie</Button>
        <Button href="/household" variant="secondary">{t.householdNav.home}</Button>
      </div>
    </div>
  );
}
