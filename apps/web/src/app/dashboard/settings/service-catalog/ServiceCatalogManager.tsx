'use client';

import { useMemo, useState } from 'react';
import type { ServiceTemplate, VatRate } from '../../../../lib/api-client';
import {
  createServiceTemplate,
  updateServiceTemplate,
  deleteServiceTemplate,
} from '../../../../lib/api-client';
import { Badge } from '../../../../components/atoms/Badge';
import { Button } from '../../../../components/atoms/Button';
import { Input } from '../../../../components/atoms/Input';
import { Select } from '../../../../components/atoms/Select';
import { Banner } from '../../../../components/molecules/Banner';
import { FormField } from '../../../../components/molecules/FormField';
import { cn } from '../../../../lib/cn';
import { t } from '../../../../lib/translations';

const VAT_RATES: VatRate[] = ['23', '8', '5', '0', 'zw', 'np', 'oo'];
const VAT_RATE_LABELS: Record<VatRate, string> = {
  '23': '23%', '8': '8%', '5': '5%', '0': '0%', zw: 'zw.', np: 'np.', oo: 'oo.',
};

type StatusFilter = 'active' | 'archived' | 'all';

interface FormState {
  name: string;
  unit: string;
  vatRate: VatRate;
  description: string;
}

function emptyForm(): FormState {
  return { name: '', unit: 'szt.', vatRate: '23', description: '' };
}

function formFromTemplate(template: ServiceTemplate): FormState {
  return {
    name: template.name,
    unit: template.unit,
    vatRate: template.vatRate as VatRate,
    description: template.description ?? '',
  };
}

export function ServiceCatalogManager({
  companyId,
  initialTemplates,
}: {
  companyId: string;
  initialTemplates: ServiceTemplate[];
}) {
  const [templates, setTemplates] = useState<ServiceTemplate[]>(initialTemplates);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => templates.filter((template) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && template.isActive) ||
      (statusFilter === 'archived' && !template.isActive);
    const matchesSearch = search.trim() === '' || template.name.toLowerCase().includes(search.trim().toLowerCase());
    return matchesStatus && matchesSearch;
  }), [templates, statusFilter, search]);

  const effectiveSelectedId = filtered.some((template) => template.id === selectedId) ? selectedId : filtered[0]?.id ?? null;
  const selected = !isCreating ? templates.find((template) => template.id === effectiveSelectedId) ?? null : null;
  const activeForm = isCreating ? form : selected ? formFromTemplate(selected) : form;

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const selectRow = (id: string) => {
    setIsCreating(false);
    setSelectedId(id);
    setError(null);
  };

  const startCreate = () => {
    setIsCreating(true);
    setSelectedId(null);
    setForm(emptyForm());
    setError(null);
  };

  const handleSave = () => {
    if (!activeForm.name.trim()) { setError(t.serviceCatalog.errors.nameRequired); return; }
    setSubmitting(true);
    setError(null);

    const payload = {
      name: activeForm.name.trim(),
      unit: activeForm.unit.trim() || 'szt.',
      vatRate: activeForm.vatRate,
      description: activeForm.description.trim() || undefined,
    };

    const request = isCreating || !selected
      ? createServiceTemplate(companyId, payload)
      : updateServiceTemplate(companyId, selected.id, payload);

    request
      .then((saved) => {
        setTemplates((prev) => (isCreating || !selected
          ? [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
          : prev.map((template) => (template.id === saved.id ? saved : template))));
        setIsCreating(false);
        setSelectedId(saved.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.saveFailed))
      .finally(() => setSubmitting(false));
  };

  const handleArchive = () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    deleteServiceTemplate(companyId, selected.id)
      .then(() => setTemplates((prev) => prev.map((template) => (template.id === selected.id ? { ...template, isActive: false } : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.deleteFailed))
      .finally(() => setSubmitting(false));
  };

  const handleRestore = () => {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    updateServiceTemplate(companyId, selected.id, { isActive: true })
      .then((updated) => setTemplates((prev) => prev.map((template) => (template.id === selected.id ? updated : template))))
      .catch((err) => setError(err instanceof Error ? err.message : t.serviceCatalog.errors.updateFailed))
      .finally(() => setSubmitting(false));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              type="search"
              placeholder={t.contractors.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-1 rounded-control border border-outline bg-surface-panel p-1">
            {(['all', 'active', 'archived'] as StatusFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-xs font-semibold transition',
                  statusFilter === filter ? 'bg-primary text-primary-ink' : 'text-muted hover:text-foreground',
                )}
              >
                {filter === 'all' ? t.contractors.filterAll : filter === 'active' ? t.contractors.filterActive : t.serviceCatalog.inactive}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-card border border-outline bg-surface-panel p-6 text-center text-sm text-muted">
            {t.serviceCatalog.emptyState}
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="bg-surface-muted text-left">
                    <HeaderCell>{t.serviceCatalog.columns.name}</HeaderCell>
                    <HeaderCell>{t.serviceCatalog.columns.unit}</HeaderCell>
                    <HeaderCell className="text-right">{t.serviceCatalog.columns.vatRate}</HeaderCell>
                    <HeaderCell className="text-right">{t.serviceCatalog.columns.status}</HeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((template) => (
                    <tr
                      key={template.id}
                      onClick={() => selectRow(template.id)}
                      className={cn(
                        'cursor-pointer border-t border-outline transition hover:bg-surface-row-hover',
                        !isCreating && template.id === effectiveSelectedId && 'bg-surface-row-hover',
                      )}
                    >
                      <BodyCell className={template.isActive ? 'font-medium text-foreground' : 'text-muted line-through'}>
                        {template.name}
                      </BodyCell>
                      <BodyCell className="text-muted">{template.unit}</BodyCell>
                      <BodyCell className="text-right text-foreground-secondary">
                        {VAT_RATE_LABELS[template.vatRate as VatRate] ?? template.vatRate}
                      </BodyCell>
                      <BodyCell className="text-right">
                        <Badge tone={template.isActive ? 'success' : 'draft'}>
                          {template.isActive ? t.contractors.status.active : t.serviceCatalog.inactive}
                        </Badge>
                      </BodyCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-card border border-outline bg-chrome p-[22px]">
        <div className="mb-3.5 flex items-start justify-between gap-3">
          <p className="text-[17px] font-semibold leading-tight text-foreground">
            {isCreating ? t.serviceCatalog.addButton : selected?.name ?? t.serviceCatalog.detail.eyebrow}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={startCreate} disabled={isCreating}>
            {t.serviceCatalog.addButton}
          </Button>
        </div>

        {error ? <Banner tone="error" className="mb-3.5">{error}</Banner> : null}

        {!isCreating && !selected ? (
          <p className="text-sm text-muted">{t.serviceCatalog.detail.selectPrompt}</p>
        ) : (
          <div className="flex flex-col gap-3.5">
            <FormField label={t.serviceCatalog.fields.name} required>
              <Input value={activeForm.name} onChange={(e) => updateField('name', e.target.value)} placeholder={t.serviceCatalog.fields.namePlaceholder} />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t.serviceCatalog.detail.unit}>
                <Input value={activeForm.unit} onChange={(e) => updateField('unit', e.target.value)} placeholder="szt." />
              </FormField>
              <FormField label={t.serviceCatalog.detail.vatRate}>
                <Select value={activeForm.vatRate} onChange={(e) => updateField('vatRate', e.target.value as VatRate)}>
                  {VAT_RATES.map((rate) => <option key={rate} value={rate}>{VAT_RATE_LABELS[rate]}</option>)}
                </Select>
              </FormField>
            </div>
            <FormField label={t.serviceCatalog.detail.description}>
              <Input value={activeForm.description} onChange={(e) => updateField('description', e.target.value)} placeholder={t.serviceCatalog.fields.descriptionPlaceholder} />
            </FormField>

            <div className="mt-auto flex gap-2 pt-2">
              {!isCreating && selected ? (
                selected.isActive ? (
                  <Button type="button" variant="danger" className="flex-1" onClick={handleArchive} disabled={submitting}>
                    {t.serviceCatalog.actions.deactivate}
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" className="flex-1" onClick={handleRestore} disabled={submitting}>
                    {t.serviceCatalog.actions.restore}
                  </Button>
                )
              ) : null}
              <Button type="button" className="flex-1" onClick={handleSave} disabled={submitting}>
                {submitting ? t.serviceCatalog.actions.saving : t.serviceCatalog.actions.save}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}
