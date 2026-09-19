'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createContractor, lookupCompanyByNip } from '../../../../lib/api-client';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Surface } from '../../../../components/atoms/Surface';
import { FormField } from '../../../../components/molecules/FormField';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { t } from '../../../../lib/translations';

export function NewContractorForm({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    nip: '',
    addressLine1: '',
    addressLine2: '',
    email: '',
    phone: '',
  });
  const [busy, setBusy] = useState(false);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleLookup = () => {
    setError(null);
    setLookupBusy(true);
    lookupCompanyByNip(form.nip)
      .then((companyLookup) => {
        setForm((current) => ({
          ...current,
          name: companyLookup.name,
          nip: companyLookup.nip,
          addressLine1: companyLookup.addressLine1,
          addressLine2: companyLookup.addressLine2 ?? '',
        }));
      })
      .catch((lookupError: unknown) => {
        setError(lookupError instanceof Error ? lookupError.message : t.contractors.addByNip.error);
      })
      .finally(() => setLookupBusy(false));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) { setError(t.contractors.errors.nameRequired); return; }
    setBusy(true);
    setError(null);
    createContractor(companyId, {
      name: form.name.trim(),
      ...(form.nip ? { nip: form.nip } : {}),
      ...(form.addressLine1 ? { addressLine1: form.addressLine1 } : {}),
      ...(form.addressLine2 ? { addressLine2: form.addressLine2 } : {}),
      ...(form.email ? { email: form.email } : {}),
      ...(form.phone ? { phone: form.phone } : {}),
    })
      .then((contractor) => router.push(`/dashboard/contractors/${contractor.id}/edit`))
      .catch((err) => {
        setError(err instanceof Error ? err.message : t.contractors.errors.saveFailed);
        setBusy(false);
      });
  };

  return (
    <Surface tone="panel" className="space-y-5 p-6 xl:max-w-2xl">
      {error ? <ErrorState message={error} /> : null}

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <FormField label={t.contractors.fields.name} htmlFor="contractor-name" required>
          <Input
            id="contractor-name"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />
        </FormField>
        <FormField label={t.contractors.fields.nip} htmlFor="contractor-nip">
          <div className="space-y-3">
            <Input
              id="contractor-nip"
              value={form.nip}
              onChange={(e) => setField('nip', e.target.value.replace(/\D/g, '').slice(0, 10))}
              inputMode="numeric"
              aria-label={t.contractors.fields.nip}
              disabled={lookupBusy}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleLookup}
              disabled={lookupBusy || form.nip.length !== 10}
            >
              {lookupBusy ? t.contractors.addByNip.lookupButtonBusy : t.contractors.addByNip.lookupButton}
            </Button>
          </div>
        </FormField>
        <FormField label={t.contractors.fields.addressLine1} htmlFor="contractor-address">
          <Input
            id="contractor-address"
            value={form.addressLine1}
            onChange={(e) => setField('addressLine1', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.addressLine2} htmlFor="contractor-address-2">
          <Input
            id="contractor-address-2"
            value={form.addressLine2}
            onChange={(e) => setField('addressLine2', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.email} htmlFor="contractor-email">
          <Input
            id="contractor-email"
            type="email"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
          />
        </FormField>
        <FormField label={t.contractors.fields.phone} htmlFor="contractor-phone">
          <Input
            id="contractor-phone"
            value={form.phone}
            onChange={(e) => setField('phone', e.target.value)}
          />
        </FormField>

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>
            {busy ? t.contractors.actions.adding : t.contractors.actions.add}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push('/dashboard/contractors')}
          >
            {t.contractors.actions.cancel}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
