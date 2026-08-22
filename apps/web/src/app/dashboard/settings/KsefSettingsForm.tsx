'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CompanyKsefEnvironment, CompanyKsefSettings } from '../../../lib/api-types';
import { updateCompanyKsefCredential, updateCompanyKsefDefaultEnvironment } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Select } from '../../../components/atoms/Select';
import { Surface } from '../../../components/atoms/Surface';
import { FormField } from '../../../components/molecules/FormField';

interface KsefSettingsFormProps {
  companyId: string;
  settings: CompanyKsefSettings;
}

const KSEF_ENVIRONMENTS: CompanyKsefEnvironment[] = ['TEST', 'PRODUCTION'];

export function KsefSettingsForm({ companyId, settings }: KsefSettingsFormProps) {
  const router = useRouter();
  const [tokenByEnvironment, setTokenByEnvironment] = useState<Record<CompanyKsefEnvironment, string>>({
    TEST: '',
    PRODUCTION: '',
  });
  const [defaultEnvironment, setDefaultEnvironment] = useState<CompanyKsefEnvironment>(settings.defaultEnvironment);
  const [savingCredentialEnvironment, setSavingCredentialEnvironment] = useState<CompanyKsefEnvironment | null>(null);
  const [savingDefaultEnvironment, setSavingDefaultEnvironment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSaveCredential = async (event: React.FormEvent<HTMLFormElement>, environment: CompanyKsefEnvironment) => {
    event.preventDefault();

    const ksefToken = tokenByEnvironment[environment].trim();

    if (!ksefToken) {
      setError('Wklej token API KSeF przed zapisaniem.');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    setSavingCredentialEnvironment(environment);

    updateCompanyKsefCredential(companyId, environment, ksefToken)
      .then(() => {
        setSuccess(`Token KSeF dla środowiska ${environment} został zapisany.`);
        setTokenByEnvironment((currentValue) => ({
          ...currentValue,
          [environment]: '',
        }));
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : `Nie udało się zapisać tokenu KSeF dla środowiska ${environment}.`);
      })
      .finally(() => setSavingCredentialEnvironment(null));
  };

  const handleSaveDefaultEnvironment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSavingDefaultEnvironment(true);

    updateCompanyKsefDefaultEnvironment(companyId, defaultEnvironment)
      .then(() => {
        setSuccess(`Domyślne środowisko KSeF zostało ustawione na ${defaultEnvironment}.`);
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nie udało się zapisać domyślnego środowiska KSeF.');
      })
      .finally(() => setSavingDefaultEnvironment(false));
  };

  return (
    <Surface tone="glass" shape="organic" className="space-y-5 p-6 xl:max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Integracja KSeF</h2>
        <p className="mt-1 text-sm text-muted">
          Token API do uwierzytelniania w Krajowym Systemie e-Faktur. Przechowywany szyfrowany (AES-256).
          Jeśli nie zostanie ustawiony, system użyje zmiennej środowiskowej <code className="text-xs">KSEF_AUTH_TOKEN</code> (tylko środowisko lokalne/testowe).
        </p>
      </div>

      {error ? (
        <Surface className="border-error bg-error px-4 py-3 text-sm text-error-ink" role="alert">
          {error}
        </Surface>
      ) : null}
      {success ? (
        <Surface className="border-success bg-success px-4 py-3 text-sm text-success-ink">
          {success}
        </Surface>
      ) : null}

      <form onSubmit={(event) => void handleSaveDefaultEnvironment(event)} className="rounded-[1.5rem] border border-outline bg-surface-raised/30 p-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <FormField label="Domyślne środowisko firmy" htmlFor="company-default-ksef-environment">
            <Select
              id="company-default-ksef-environment"
              value={defaultEnvironment}
              onChange={(event) => setDefaultEnvironment(event.target.value as CompanyKsefEnvironment)}
            >
              <option value="TEST">TEST</option>
              <option value="PRODUCTION">PRODUCTION</option>
            </Select>
          </FormField>

          <Button type="submit" disabled={savingDefaultEnvironment}>
            {savingDefaultEnvironment ? 'Zapisywanie…' : 'Zapisz domyślne środowisko'}
          </Button>
        </div>
      </form>

      <div className="grid gap-4 xl:grid-cols-2">
        {KSEF_ENVIRONMENTS.map((environment) => {
          const credential = settings.credentials.find((item) => item.environment === environment);
          const hasToken = credential?.hasToken ?? false;
          const isSavingCredential = savingCredentialEnvironment === environment;
          const isDefaultEnvironment = settings.defaultEnvironment === environment;

          return (
            <form
              key={environment}
              onSubmit={(event) => void handleSaveCredential(event, environment)}
              className="rounded-[1.75rem_1.25rem_2rem_1.25rem] border border-outline bg-surface-panel/55 p-5 backdrop-blur-xl"
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Środowisko</p>
                    <h3 className="mt-1 text-xl font-semibold tracking-tight text-foreground">{environment}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {environment === 'TEST'
                        ? 'Środowisko testowe Ministerstwa Finansów do bezpiecznych prób i integracji.'
                        : 'Środowisko produkcyjne do realnych operacji KSeF. Zmieniaj token ostrożnie.'}
                    </p>
                  </div>

                  <div className="space-y-2 text-right">
                    <p className={hasToken ? 'text-sm font-semibold text-success-ink' : 'text-sm font-semibold text-error-ink'}>
                      {hasToken ? 'Token skonfigurowany' : 'Brak tokenu'}
                    </p>
                    {isDefaultEnvironment ? (
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Domyślne środowisko firmy</p>
                    ) : null}
                  </div>
                </div>

                <FormField label={`Token API KSeF (${environment})`} htmlFor={`ksef-token-${environment}`} required>
                  <Input
                    id={`ksef-token-${environment}`}
                    type="password"
                    value={tokenByEnvironment[environment]}
                    onChange={(event) => setTokenByEnvironment((currentValue) => ({
                      ...currentValue,
                      [environment]: event.target.value,
                    }))}
                    placeholder={hasToken ? 'Wklej nowy token, aby nadpisać istniejący' : 'Wklej token API dla tego środowiska'}
                    required
                  />
                </FormField>

                <Button type="submit" disabled={isSavingCredential}>
                  {isSavingCredential ? 'Zapisywanie…' : `Zapisz token ${environment}`}
                </Button>
              </div>
            </form>
          );
        })}
      </div>
    </Surface>
  );
}
