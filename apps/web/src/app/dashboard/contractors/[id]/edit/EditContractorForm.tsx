'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Contractor } from '../../../../../lib/api-types';
import { updateContractor } from '../../../../../lib/api-client';
import { Button } from '../../../../../components/atoms/Button';
import { Input } from '../../../../../components/atoms/Input';
import { Surface } from '../../../../../components/atoms/Surface';
import { FormField } from '../../../../../components/molecules/FormField';
import { ErrorState } from '../../../../../components/molecules/ErrorState';
import { t } from '../../../../../lib/translations';

export function EditContractorForm({
  companyId,
  contractor,
}: {
  companyId: string;
  contractor: Contractor;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: contractor.name,
    nip: contractor.nip ?? '',
    pesel: contractor.pesel ?? '',
    addressLine1: contractor.addressLine1 ?? '',
    addressLine2: contractor.addressLine2 ?? '',
    countryCode: contractor.countryCode,
    email: contractor.email ?? '',
    phone: contractor.phone ?? '',
    bankAccount: contractor.bankAccount ?? '',
    notes: contractor.notes ?? '',
    isActive: contractor.isActive,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSuccess(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError(t.contractors.errors.nameRequired); return; }
    setBusy(true);
    setError(null);
    setSuccess(false);
    updateContractor(companyId, contractor.id, {
      name: form.name.trim(),
      nip: form.nip || undefined,
      pesel: form.pesel || undefined,
      addressLine1: form.addressLine1 || undefined,
      addressLine2: form.addressLine2 || undefined,
      countryCode: form.countryCode || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      bankAccount: form.bankAccount || undefined,
      notes: form.notes || undefined,
      isActive: form.isActive,
    })
      .then(() => setSuccess(true))
      .catch((err) => setError(err instanceof Error ? err.message : t.contractors.errors.saveFailed))
      .finally(() => setBusy(false));
  };

  return (
    <Surface tone="glass" shape="organic" className="space-y-5 p-6 xl:max-w-2xl">
      {error ? <ErrorState message={error} /> : null}
      {success ? (
        <div className="rounded-[1.25rem] border border-outline bg-success px-4 py-3 text-sm font-medium text-success-ink">
          {t.contractors.success.updated}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <FormField label={t.contractors.fields.name} htmlFor="edit-name" required>
          <Input
            id="edit-name"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </FormField>
        <FormField label={t.contractors.fields.nip} htmlFor="edit-nip">
          <Input
            id="edit-nip"
            value={form.nip}
            onChange={(e) => setField('nip', e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
          />
        </FormField>
        <FormField label={t.contractors.fields.addressLine1} htmlFor="edit-address">
          <Input
            id="edit-address"
            value={form.addressLine1}
            onChange={(e) => setField('addressLine1', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.addressLine2} htmlFor="edit-address-2">
          <Input
            id="edit-address-2"
            value={form.addressLine2}
            onChange={(e) => setField('addressLine2', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.email} htmlFor="edit-email">
          <Input
            id="edit-email"
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.phone} htmlFor="edit-phone">
          <Input
            id="edit-phone"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.bankAccount} htmlFor="edit-bank">
          <Input
            id="edit-bank"
            value={form.bankAccount}
            onChange={(e) => setField('bankAccount', e.target.value)}
            placeholder="00 0000 0000 0000 0000 0000 0000"
          />
        </FormField>
        <FormField label={t.contractors.fields.countryCode} htmlFor="edit-country">
          <Input
            id="edit-country"
            value={form.countryCode}
            onChange={(e) => setField('countryCode', e.target.value.toUpperCase().slice(0, 2))}
            maxLength={2}
          />
        </FormField>
        <FormField label={t.contractors.fields.pesel} htmlFor="edit-pesel">
          <Input
            id="edit-pesel"
            value={form.pesel}
            onChange={(e) => setField('pesel', e.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
          />
        </FormField>
        <FormField label={t.contractors.fields.notes} htmlFor="edit-notes">
          <Input
            id="edit-notes"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
          />
        </FormField>

        <div className="flex items-center gap-3 md:col-span-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setField('isActive', e.target.checked)}
              className="h-4 w-4 rounded border-outline"
            />
            {t.contractors.fields.isActive}
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? t.contractors.actions.saving : t.contractors.actions.save}
          </Button>
          <button
            type="button"
            onClick={() => router.push('/dashboard/contractors')}
            className="text-sm font-medium text-muted transition hover:text-foreground"
          >
            {t.contractors.actions.cancel}
          </button>
        </div>
      </form>
    </Surface>
  );
}
