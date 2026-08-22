'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCompany } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Surface } from '../../../components/atoms/Surface';
import { Banner } from '../../../components/molecules/Banner';
import { FormField } from '../../../components/molecules/FormField';

interface InvoiceNumberPatternFormProps {
  companyId: string;
  currentPattern: string | null;
}

const DEFAULT_PATTERN = 'FV {SEQ}/{MONTH}/{YEAR}';

const TOKENS = [
  { token: '{SEQ}', label: 'Numer', description: 'Kolejny numer w serii' },
  { token: '{YEAR}', label: 'Rok (4)', description: 'Rok 4-cyfrowy, np. 2026' },
  { token: '{YEAR_SHORT}', label: 'Rok (2)', description: 'Rok 2-cyfrowy, np. 26' },
  { token: '{MONTH}', label: 'Miesiąc', description: 'Miesiąc bez zera, np. 4' },
  { token: '{MONTH_PAD}', label: 'Miesiąc (00)', description: 'Miesiąc z zerem, np. 04' },
  { token: '{DAY}', label: 'Dzień', description: 'Dzień bez zera, np. 9' },
  { token: '{DAY_PAD}', label: 'Dzień (00)', description: 'Dzień z zerem, np. 09' },
  { token: '{CONTRACTOR_NIP}', label: 'NIP kontrahenta', description: 'NIP nabywcy, np. 1234567890' },
] as const;

const PRESETS = [
  { label: 'Domyślny', pattern: 'FV {SEQ}/{MONTH}/{YEAR}' },
  { label: 'Z zerem', pattern: 'FV {SEQ}/{MONTH_PAD}/{YEAR}' },
  { label: 'Rok/miesiąc', pattern: 'FV/{YEAR}/{MONTH_PAD}/{SEQ}' },
  { label: 'Roczny', pattern: 'FV/{YEAR}/{SEQ}' },
  { label: 'Z NIP', pattern: '{CONTRACTOR_NIP}/{YEAR}/{MONTH_PAD}/{SEQ}' },
] as const;

const SAMPLE_DATE = new Date();
const SAMPLE_NIP = '1234567890';

function resolvePatternPreview(pattern: string): string {
  const year = SAMPLE_DATE.getFullYear();
  const month = SAMPLE_DATE.getMonth() + 1;
  const day = SAMPLE_DATE.getDate();
  return pattern
    .replace('{SEQ}', '1')
    .replace('{YEAR}', String(year))
    .replace('{YEAR_SHORT}', String(year).slice(-2))
    .replace('{MONTH_PAD}', String(month).padStart(2, '0'))
    .replace('{MONTH}', String(month))
    .replace('{DAY_PAD}', String(day).padStart(2, '0'))
    .replace('{DAY}', String(day))
    .replace('{CONTRACTOR_NIP}', SAMPLE_NIP);
}

export function InvoiceNumberPatternForm({ companyId, currentPattern }: InvoiceNumberPatternFormProps) {
  const router = useRouter();
  const [pattern, setPattern] = useState(currentPattern ?? DEFAULT_PATTERN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const preview = pattern.includes('{SEQ}') ? resolvePatternPreview(pattern) : null;
  const isDefault = currentPattern === null;

  const insertToken = (token: string) => {
    setPattern((current) => current + token);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    updateCompany(companyId, { invoiceNumberPattern: pattern === DEFAULT_PATTERN ? null : pattern })
      .then(() => {
        setSuccess('Schemat numeracji został zapisany.');
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nie udało się zapisać schematu numeracji.');
      })
      .finally(() => setBusy(false));
  };

  const handleReset = () => {
    setError(null);
    setSuccess(null);
    setBusy(true);

    updateCompany(companyId, { invoiceNumberPattern: null })
      .then(() => {
        setPattern(DEFAULT_PATTERN);
        setSuccess('Schemat numeracji przywrócony do domyślnego.');
        router.refresh();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Nie udało się przywrócić domyślnego schematu.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Surface tone="panel" className="space-y-5 p-6 xl:max-w-4xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Schemat numeracji faktur</h2>
        <p className="mt-1 text-sm text-muted">
          Określ własny format numeru faktury. Schemat musi zawierać token <code className="rounded bg-surface px-1 text-xs">{'{SEQ}'}</code> (kolejny numer).
          Faktury korygujące (KOR) zawsze używają domyślnego formatu <code className="rounded bg-surface px-1 text-xs">KOR {'{SEQ}'}/{'{MONTH}'}/{'{YEAR}'}</code>.
        </p>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">Szablony</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.pattern}
              type="button"
              onClick={() => setPattern(preset.pattern)}
              className="rounded-full border border-outline bg-surface px-3 py-1 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <FormField label="Schemat numeru" htmlFor="invoice-pattern" required>
          <Input
            id="invoice-pattern"
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder={DEFAULT_PATTERN}
            required
          />
        </FormField>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-muted">Dostępne tokeny</p>
          <div className="flex flex-wrap gap-2">
            {TOKENS.map(({ token, label, description }) => (
              <button
                key={token}
                type="button"
                title={description}
                onClick={() => insertToken(token)}
                className="rounded-full border border-outline bg-surface px-3 py-1 text-xs font-mono font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {preview ? (
          <div className="rounded-xl border border-outline bg-surface-panel/55 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Podgląd</p>
            <p className="mt-1 font-mono text-base font-semibold text-foreground">{preview}</p>
            <p className="mt-0.5 text-xs text-muted">
              Przykład dla dzisiaj, NIP: {SAMPLE_NIP}, numer: 1
            </p>
          </div>
        ) : (
          <Banner tone="error">Schemat musi zawierać token {'{SEQ}'}.</Banner>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy || !preview}>
            {busy ? 'Zapisywanie…' : 'Zapisz schemat'}
          </Button>
          {!isDefault ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void handleReset()}>
              Przywróć domyślny
            </Button>
          ) : null}
        </div>
      </form>

      <div className="border-t border-outline pt-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">Aktualny schemat</p>
        <p className="mt-1 font-mono text-sm text-foreground">
          {isDefault ? `${DEFAULT_PATTERN} (domyślny)` : currentPattern}
        </p>
      </div>
    </Surface>
  );
}
