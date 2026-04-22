'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCompanyKsefSettings } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Surface } from '../../../components/atoms/Surface';
import { FormField } from '../../../components/molecules/FormField';

interface KsefSettingsFormProps {
  companyId: string;
  currentEnv: string;
}

export function KsefSettingsForm({ companyId, currentEnv }: KsefSettingsFormProps) {
  const router = useRouter();
  const [ksefToken, setKsefToken] = useState('');
  const [ksefEnv, setKsefEnv] = useState<'TEST' | 'PRODUCTION'>(currentEnv === 'PRODUCTION' ? 'PRODUCTION' : 'TEST');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    updateCompanyKsefSettings(companyId, { ksefToken, ksefEnv })
      .then(() => {
        setSuccess('Ustawienia KSeF zostały zapisane.');
        setKsefToken('');
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nie udało się zapisać ustawień KSeF.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Surface tone="glass" shape="organic" className="space-y-5 p-6 xl:max-w-4xl">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">Integracja KSeF</h2>
        <p className="mt-1 text-sm text-muted">
          Token API do uwierzytelniania w Krajowym Systemie e-Faktur. Przechowywany szyfrowany (AES-256).
          Jeśli nie zostanie ustawiony, system użyje zmiennej środowiskowej <code className="text-xs">KSEF_AUTH_TOKEN</code> (tylko środowisko lokalne/testowe).
        </p>
      </div>

      {error ? (
        <Surface className="border-error/20 bg-error-soft/70 px-4 py-3 text-sm text-error-ink" role="alert">
          {error}
        </Surface>
      ) : null}
      {success ? (
        <Surface className="border-success/20 bg-success/25 px-4 py-3 text-sm text-success-ink">
          {success}
        </Surface>
      ) : null}

      <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4 md:grid-cols-2">
        <FormField label="Token API KSeF" htmlFor="ksef-token" required>
          <Input
            id="ksef-token"
            type="password"
            value={ksefToken}
            onChange={(event) => setKsefToken(event.target.value)}
            placeholder="Wklej nowy token — pole puste zachowuje obecny"
            required
          />
        </FormField>

        <FormField label="Środowisko" htmlFor="ksef-env">
          <select
            id="ksef-env"
            value={ksefEnv}
            onChange={(event) => setKsefEnv(event.target.value as 'TEST' | 'PRODUCTION')}
            className="w-full rounded-lg border border-outline/20 bg-surface px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="TEST">Test (środowisko testowe MF)</option>
            <option value="PRODUCTION">Produkcja</option>
          </select>
        </FormField>

        <div className="md:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? 'Zapisywanie…' : 'Zapisz token KSeF'}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
