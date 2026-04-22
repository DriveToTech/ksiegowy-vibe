'use client';

import { useState } from 'react';
import type { ContractorServiceRate, ServiceTemplate, VatRate } from '../../../lib/api-client';
import {
  upsertContractorServiceRate,
  deleteContractorServiceRate,
} from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Select } from '../../../components/atoms/Select';
import { FormField } from '../../../components/molecules/FormField';
import { ErrorState } from '../../../components/molecules/ErrorState';
import { t } from '../../../lib/translations';

const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%', '8': '8%', '5': '5%', '0': '0%', zw: 'zw.', np: 'np.', oo: 'oo.',
};

export function ContractorServiceRates({
  companyId,
  contractorId,
  initialRates,
  templates,
}: {
  companyId: string;
  contractorId: string;
  initialRates: ContractorServiceRate[];
  templates: ServiceTemplate[];
}) {
  const [rates, setRates] = useState<ContractorServiceRate[]>(initialRates);
  const [showForm, setShowForm] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [unitNetPrice, setUnitNetPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableTemplates = templates.filter(
    (tmpl) => !rates.some((rate) => rate.serviceTemplateId === tmpl.id),
  );

  const handleAdd = () => {
    if (!selectedTemplateId) { setError(t.contractorRates.errors.serviceRequired); return; }
    if (!unitNetPrice.trim()) { setError(t.contractorRates.errors.priceRequired); return; }
    setSubmitting(true);
    setError(null);
    upsertContractorServiceRate(companyId, contractorId, {
      serviceTemplateId: selectedTemplateId,
      unitNetPrice: unitNetPrice.trim(),
    })
      .then((created) => {
        setRates((prev) => [...prev, created].sort((a, b) => a.serviceTemplate.name.localeCompare(b.serviceTemplate.name)));
        setShowForm(false);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.contractorRates.errors.saveFailed))
      .finally(() => setSubmitting(false));
  };

  const handleDelete = (rateId: string) => {
    setSubmitting(true);
    setError(null);
    deleteContractorServiceRate(companyId, contractorId, rateId)
      .then(() => setRates((prev) => prev.filter((rate) => rate.id !== rateId)))
      .catch((err) => setError(err instanceof Error ? err.message : t.contractorRates.errors.deleteFailed))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="mt-4 space-y-3 border-t border-outline/20 pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        {t.contractorRates.sectionTitle}
      </p>

      {error ? <ErrorState message={error} /> : null}

      {rates.length === 0 && !showForm ? (
        <p className="text-sm text-muted">
          {templates.length === 0
            ? t.contractorRates.noTemplatesHint
            : t.contractorRates.emptyState}
        </p>
      ) : null}

      {rates.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              <th className="pb-2 text-left">{t.contractorRates.columns.service}</th>
              <th className="pb-2 text-left">{t.contractorRates.columns.unit}</th>
              <th className="pb-2 text-left">{t.contractorRates.columns.vatRate}</th>
              <th className="pb-2 text-right">{t.contractorRates.columns.price}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rates.map((rate) => (
              <tr key={rate.id} className="border-t border-outline/10 align-top">
                <td className="py-2">
                  <span className="font-medium text-foreground">{rate.serviceTemplate.name}</span>
                  {rate.serviceTemplate.description ? (
                    <p className="mt-0.5 text-xs text-muted">{rate.serviceTemplate.description}</p>
                  ) : null}
                </td>
                <td className="py-2 text-muted">{rate.serviceTemplate.unit}</td>
                <td className="py-2 text-muted">{VAT_RATE_LABELS[rate.serviceTemplate.vatRate as VatRate] ?? rate.serviceTemplate.vatRate}</td>
                <td className="py-2 text-right font-semibold tabular-nums text-foreground">
                  {rate.unitNetPrice} {rate.currency}
                </td>
                <td className="py-2 pl-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-error-ink hover:bg-error-soft"
                    onClick={() => handleDelete(rate.id)}
                    disabled={submitting}
                  >
                    {t.contractorRates.actions.delete}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {showForm ? (
        <div className="grid gap-3 rounded-[1.5rem] border border-outline/20 bg-surface-raised/20 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <FormField label={t.contractorRates.fields.service}>
            <Select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
            >
              <option value="">{t.contractorRates.fields.serviceDefault}</option>
              {availableTemplates.map((tmpl) => (
                <option key={tmpl.id} value={tmpl.id}>
                  {tmpl.name}{tmpl.description ? ` — ${tmpl.description}` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t.contractorRates.fields.price}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={unitNetPrice}
              onChange={(e) => setUnitNetPrice(e.target.value)}
              placeholder={t.contractorRates.fields.pricePlaceholder}
              className="text-right tabular-nums"
            />
          </FormField>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={handleAdd} disabled={submitting}>
              {submitting ? t.contractorRates.actions.saving : t.contractorRates.actions.add}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>
              {t.contractorRates.actions.cancel}
            </Button>
          </div>
        </div>
      ) : null}

      {!showForm && availableTemplates.length > 0 ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => {
          setSelectedTemplateId(availableTemplates[0]?.id ?? '');
          setUnitNetPrice('');
          setError(null);
          setShowForm(true);
        }}>
          {t.contractorRates.addButton}
        </Button>
      ) : null}
    </div>
  );
}
