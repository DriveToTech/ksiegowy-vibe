'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Company } from '../../../lib/api-types';
import { createCompany, lookupCompanyByNip, refreshBrowserSession, updateCompany } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Surface } from '../../../components/atoms/Surface';
import { Banner } from '../../../components/molecules/Banner';
import { FormField } from '../../../components/molecules/FormField';

interface CompanyDetailsFormProps {
  company: Company | null;
  canEdit: boolean;
  redirectTo?: string;
}

export function CompanyDetailsForm({ company, canEdit, redirectTo = '/dashboard' }: CompanyDetailsFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: company?.name ?? '',
    nip: company?.nip ?? '',
    addressLine1: company?.addressLine1 ?? '',
    addressLine2: company?.addressLine2 ?? '',
    email: company?.email ?? '',
    phone: company?.phone ?? '',
    bankName: company?.bankName ?? '',
    bankAccount: company?.bankAccount ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCreateMode = company === null;

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleLookup = async () => {
    setError(null);
    setSuccess(null);
    setLookupBusy(true);

    try {
      const companyLookup = await lookupCompanyByNip(form.nip);
      setForm((current) => ({
        ...current,
        name: companyLookup.name,
        nip: companyLookup.nip,
        addressLine1: companyLookup.addressLine1,
        addressLine2: companyLookup.addressLine2 ?? '',
      }));
      setSuccess('Dane firmy zostały pobrane z rejestru po NIP. Uzupełnij brakujące pola i zapisz formularz.');
    } catch (lookupError: unknown) {
      setError(lookupError instanceof Error ? lookupError.message : 'Nie udało się pobrać danych firmy po NIP.');
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (isCreateMode) {
        const created = await createCompany({
          name: form.name,
          nip: form.nip,
          addressLine1: form.addressLine1,
          ...(form.addressLine2 ? { addressLine2: form.addressLine2 } : {}),
          ...(form.email ? { email: form.email } : {}),
          ...(form.phone ? { phone: form.phone } : {}),
          ...(form.bankName ? { bankName: form.bankName } : {}),
          ...(form.bankAccount ? { bankAccount: form.bankAccount } : {}),
        });

        document.cookie = `active_company=${created.id}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
        await refreshBrowserSession(redirectTo);
        return;
      }

      await updateCompany(company.id, {
        name: form.name,
        addressLine1: form.addressLine1,
        addressLine2: form.addressLine2,
        email: form.email,
        phone: form.phone,
        bankName: form.bankName,
        bankAccount: form.bankAccount,
      });
      setSuccess('Dane firmy zostały zapisane.');
      router.refresh();
    } catch (submissionError: unknown) {
      setError(submissionError instanceof Error ? submissionError.message : 'Nie udało się zapisać danych firmy.');
    } finally {
      setBusy(false);
    }
  };

  if (!isCreateMode && !canEdit) {
    return (
      <Surface tone="panel" className="space-y-5 p-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Dane firmy</h2>
          <p className="mt-1 text-sm text-muted">Masz dostęp podglądowy do ustawień tej firmy.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ReadOnlyField label="Nazwa" value={form.name} />
          <ReadOnlyField label="NIP" value={form.nip} />
          <ReadOnlyField label="Adres" value={form.addressLine1} />
          <ReadOnlyField label="Adres dodatkowy" value={form.addressLine2 || '—'} />
          <ReadOnlyField label="Email" value={form.email || '—'} />
          <ReadOnlyField label="Telefon" value={form.phone || '—'} />
          <ReadOnlyField label="Bank" value={form.bankName || '—'} />
          <ReadOnlyField label="Konto bankowe" value={form.bankAccount || '—'} />
        </div>
      </Surface>
    );
  }

  return (
    <Surface tone="panel" className="space-y-5 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {isCreateMode ? 'Skonfiguruj firmę' : 'Dane firmy'}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {isCreateMode
            ? 'Dodaj pierwszą firmę, aby odblokować pracę na kontrahentach, fakturach i OCR.'
            : 'Uzupełnij dane firmy używane w całym workspace i na dokumentach sprzedażowych.'}
        </p>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}
      {success ? <Banner tone="success">{success}</Banner> : null}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <FormField label="Nazwa firmy" htmlFor="company-name" required>
          <Input id="company-name" value={form.name} onChange={(event) => updateField('name', event.target.value)} required />
        </FormField>
        <FormField label="NIP" htmlFor="company-nip" required={isCreateMode}>
          <div className="space-y-3">
            <Input
              id="company-nip"
              value={form.nip}
              onChange={(event) => updateField('nip', event.target.value.replace(/\D/g, '').slice(0, 10))}
              required={isCreateMode}
              inputMode="numeric"
              disabled={!isCreateMode || lookupBusy}
            />
            {isCreateMode ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void handleLookup()}
                disabled={lookupBusy || form.nip.length !== 10}
              >
                {lookupBusy ? 'Pobieranie…' : 'Pobierz dane po NIP'}
              </Button>
            ) : null}
          </div>
        </FormField>
        <FormField label="Adres" htmlFor="company-address" required>
          <Input id="company-address" value={form.addressLine1} onChange={(event) => updateField('addressLine1', event.target.value)} required />
        </FormField>
        <FormField label="Adres dodatkowy" htmlFor="company-address-2">
          <Input id="company-address-2" value={form.addressLine2} onChange={(event) => updateField('addressLine2', event.target.value)} />
        </FormField>
        <FormField label="Email" htmlFor="company-email">
          <Input id="company-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} />
        </FormField>
        <FormField label="Telefon" htmlFor="company-phone">
          <Input id="company-phone" value={form.phone} onChange={(event) => updateField('phone', event.target.value)} />
        </FormField>
        <FormField label="Bank" htmlFor="company-bank-name">
          <Input id="company-bank-name" value={form.bankName} onChange={(event) => updateField('bankName', event.target.value)} />
        </FormField>
        <FormField label="Konto bankowe" htmlFor="company-bank-account">
          <Input id="company-bank-account" value={form.bankAccount} onChange={(event) => updateField('bankAccount', event.target.value)} />
        </FormField>

        <div className="md:col-span-2 flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {busy ? 'Zapisywanie…' : isCreateMode ? 'Utwórz firmę' : 'Zapisz zmiany'}
          </Button>
        </div>
      </form>
    </Surface>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}
