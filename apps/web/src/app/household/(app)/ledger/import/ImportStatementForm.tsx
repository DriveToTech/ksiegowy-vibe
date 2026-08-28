'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE } from '../../../../../lib/api-base';
import { t } from '../../../../../lib/translations';
import { Button } from '../../../../../components/atoms/Button';
import { ErrorState } from '../../../../../components/molecules/ErrorState';

/**
 * TODO(backend): services/household's statement-import.service.ts (preview/confirm
 * two-step, per the plan) doesn't have a route yet. This posts straight to
 * POST /households/:id/imports as a single-step call — swap for the real
 * preview → confirm flow once that endpoint exists.
 */
async function importStatement(householdId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`${API_BASE}/households/${householdId}/imports`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Import failed with status ${response.status}`);
  }
}

export function ImportStatementForm({ householdId }: { householdId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    const result = await importStatement(householdId, file).catch((submitError: Error) => submitError);
    setSubmitting(false);
    if (result instanceof Error) {
      setError(result.message);
      return;
    }
    router.push('/household/ledger');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
      {error ? <ErrorState message={error} /> : null}
      <input
        type="file"
        accept=".csv"
        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm text-foreground-secondary file:mr-4 file:rounded-control file:border-0 file:bg-primary-soft file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-soft-ink"
      />
      <div className="flex justify-end gap-3 border-t border-outline pt-5">
        <Button type="button" variant="secondary" onClick={() => router.back()}>{t.household.transactionForm.cancel}</Button>
        <Button type="submit" disabled={!file || submitting}>{t.household.ledger.importStatement}</Button>
      </div>
    </form>
  );
}
