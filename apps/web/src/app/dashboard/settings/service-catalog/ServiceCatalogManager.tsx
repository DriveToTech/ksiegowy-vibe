'use client';

import { useState, useCallback } from 'react';
import type { ServiceTemplate, VatRate } from '../../../../lib/api-client';
import {
  createServiceTemplate,
  updateServiceTemplate,
  deleteServiceTemplate,
} from '../../../../lib/api-client';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Select } from '../../../../components/atoms/Select';
import { Surface } from '../../../../components/atoms/Surface';
import { FormField } from '../../../../components/molecules/FormField';
import { ErrorState } from '../../../../components/molecules/ErrorState';
import { t } from '../../../../lib/translations';

const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];
const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%', '8': '8%', '5': '5%', '0': '0%', zw: 'zw.', np: 'np.', oo: 'oo.',
};

interface FormState {
  name: string;
  unit: string;
  vatRate: VatRate;
  description: string;
}

function emptyForm(): FormState {
  return { name: '', unit: 'szt.', vatRate: '23', description: '' };
}

export function ServiceCatalogManager({
  companyId,
  initialTemplates,
}: {
  companyId: string;
  initialTemplates: ServiceTemplate[];
}) {
  const [templates, setTemplates] = useState<ServiceTemplate[]>(initialTemplates);
  const [showInactive, setShowInactive] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visibleTemplates = showInactive ? templates : templates.filter((template) => template.isActive);

  const updateForm = useCallback(<K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleAdd = () => {
    setError(null);
    setEditingId(null);
    setForm(emptyForm());
    setShowAddForm(true);
  };

  const handleEdit = (template: ServiceTemplate) => {
    setError(null);
    setShowAddForm(false);
    setEditingId(template.id);
    setForm({
      name: template.name,
      unit: template.unit,
      vatRate: template.vatRate as VatRate,
      description: template.description ?? '',
    });
  };

  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  };

  const handleSubmitAdd = () => {
    if (!form.name.trim()) { setError(t.serviceCatalog.errors.nameRequired); return; }
    setSubmitting(true);
    setError(null);
    createServiceTemplate(companyId, {
      name: form.name.trim(),
      unit: form.unit.trim() || 'szt.',
      vatRate: form.vatRate,
      description: form.description.trim() || undefined,
    })
      .then((created) => {
        setTemplates((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        setShowAddForm(false);
        setForm(emptyForm());
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.saveFailed))
      .finally(() => setSubmitting(false));
  };

  const handleSubmitEdit = (id: string) => {
    if (!form.name.trim()) { setError(t.serviceCatalog.errors.nameRequired); return; }
    setSubmitting(true);
    setError(null);
    updateServiceTemplate(companyId, id, {
      name: form.name.trim(),
      unit: form.unit.trim() || 'szt.',
      vatRate: form.vatRate,
      description: form.description.trim() || undefined,
    })
      .then((updated) => {
        setTemplates((prev) => prev.map((template) => (template.id === id ? updated : template)));
        setEditingId(null);
        setForm(emptyForm());
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.saveFailed))
      .finally(() => setSubmitting(false));
  };

  const handleDeactivate = (id: string) => {
    setSubmitting(true);
    setError(null);
    deleteServiceTemplate(companyId, id)
      .then(() => setTemplates((prev) => prev.map((template) => (template.id === id ? { ...template, isActive: false } : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.deleteFailed))
      .finally(() => setSubmitting(false));
  };

  const handleReactivate = (id: string) => {
    setSubmitting(true);
    setError(null);
    updateServiceTemplate(companyId, id, { isActive: true })
      .then((updated) => setTemplates((prev) => prev.map((template) => (template.id === id ? updated : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.updateFailed))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="space-y-4">
      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={handleAdd} disabled={showAddForm}>
          {t.serviceCatalog.addButton}
        </Button>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-outline"
          />
          {t.serviceCatalog.showInactive}
        </label>
      </div>

      {showAddForm ? (
        <TemplateForm
          form={form}
          onChange={updateForm}
          onSubmit={handleSubmitAdd}
          onCancel={handleCancelForm}
          submitting={submitting}
          submitLabel={t.serviceCatalog.actions.add}
        />
      ) : null}

      {visibleTemplates.length === 0 && !showAddForm ? (
        <p className="rounded-[1.5rem] border border-outline bg-surface-panel/40 p-6 text-center text-sm text-muted">
          {t.serviceCatalog.emptyState}
        </p>
      ) : null}

      {visibleTemplates.length > 0 ? (
        <div className="space-y-2">
          {visibleTemplates.map((template) => (
            <Surface key={template.id} tone="glass" shape="organic" className="p-4">
              {editingId === template.id ? (
                <TemplateForm
                  form={form}
                  onChange={updateForm}
                  onSubmit={() => handleSubmitEdit(template.id)}
                  onCancel={handleCancelForm}
                  submitting={submitting}
                  submitLabel={t.serviceCatalog.actions.save}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${template.isActive ? 'text-foreground' : 'text-muted line-through'}`}>
                        {template.name}
                      </span>
                      <span className="rounded-full bg-surface-raised/60 px-2 py-0.5 text-xs text-muted">
                        {template.unit}
                      </span>
                      <span className="rounded-full bg-surface-raised/60 px-2 py-0.5 text-xs text-muted">
                        VAT {VAT_RATE_LABELS[template.vatRate as VatRate] ?? template.vatRate}
                      </span>
                      {!template.isActive ? (
                        <span className="rounded-full bg-error-soft px-2 py-0.5 text-xs text-error-ink">
                          {t.serviceCatalog.inactive}
                        </span>
                      ) : null}
                    </div>
                    {template.description ? (
                      <p className="mt-1 text-sm text-muted">{template.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {template.isActive ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template)}
                          disabled={submitting}
                        >
                          {t.serviceCatalog.actions.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-error-ink hover:bg-error-soft"
                          onClick={() => handleDeactivate(template.id)}
                          disabled={submitting}
                        >
                          {t.serviceCatalog.actions.deactivate}
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleReactivate(template.id)}
                        disabled={submitting}
                      >
                        {t.serviceCatalog.actions.restore}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Surface>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TemplateForm({
  form,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  submitLabel,
}: {
  form: FormState;
  onChange: <K extends keyof FormState>(field: K, value: FormState[K]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}) {
  return (
    <Surface tone="glass" shape="organic" className="space-y-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t.serviceCatalog.fields.name} required>
          <Input
            type="text"
            value={form.name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder={t.serviceCatalog.fields.namePlaceholder}
          />
        </FormField>
        <FormField label={t.serviceCatalog.fields.unit}>
          <Input
            type="text"
            value={form.unit}
            onChange={(e) => onChange('unit', e.target.value)}
            placeholder="szt."
          />
        </FormField>
        <FormField label={t.serviceCatalog.fields.vatRate}>
          <Select
            value={form.vatRate}
            onChange={(e) => onChange('vatRate', e.target.value as VatRate)}
          >
            {VAT_RATES.map((rate) => (
              <option key={rate} value={rate}>{VAT_RATE_LABELS[rate]}</option>
            ))}
          </Select>
        </FormField>
        <FormField label={t.serviceCatalog.fields.description}>
          <Input
            type="text"
            value={form.description}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder={t.serviceCatalog.fields.descriptionPlaceholder}
          />
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting ? t.serviceCatalog.actions.saving : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          {t.serviceCatalog.actions.cancel}
        </Button>
      </div>
    </Surface>
  );
}
