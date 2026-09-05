'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Contractor, ContractorSummary } from '../../../lib/api-types';
import { getContractorSummary } from '../../../lib/api-client';
import { Badge } from '../../../components/atoms/Badge';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Banner } from '../../../components/molecules/Banner';
import { cn } from '../../../lib/cn';
import { formatMoney } from '../../../lib/format';
import { t } from '../../../lib/translations';

type StatusFilter = 'all' | 'active' | 'inactive';

const PANEL_SHELL = 'flex flex-col rounded-inset border border-outline bg-surface-panel px-4 py-[15px]';

export function ContractorList({
  contractors,
  canEdit,
  companyId,
}: {
  contractors: Contractor[];
  canEdit: boolean;
  companyId: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [selectedId, setSelectedId] = useState<string | null>(contractors[0]?.id ?? null);

  const filtered = useMemo(() => contractors.filter((contractor) => {
    const matchesSearch =
      search.trim() === '' ||
      contractor.name.toLowerCase().includes(search.toLowerCase()) ||
      (contractor.nip ?? '').includes(search.trim());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && contractor.isActive) ||
      (statusFilter === 'inactive' && !contractor.isActive);

    return matchesSearch && matchesStatus;
  }), [contractors, search, statusFilter]);

  const effectiveSelectedId = filtered.some((contractor) => contractor.id === selectedId)
    ? selectedId
    : filtered[0]?.id ?? null;
  const selected = contractors.find((contractor) => contractor.id === effectiveSelectedId) ?? null;
  const missingNipCount = contractors.filter((contractor) => !contractor.nip).length;
  const turnoverYear = contractors[0]?.turnoverYear ?? new Date().getFullYear();

  const [summary, setSummary] = useState<ContractorSummary | null>(null);
  const requestedContractorIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!effectiveSelectedId) {
      requestedContractorIdRef.current = null;
      setSummary(null);
      return;
    }
    requestedContractorIdRef.current = effectiveSelectedId;
    setSummary(null);
    getContractorSummary(companyId, effectiveSelectedId, selected?.turnoverYear)
      .catch(() => null)
      .then((result) => {
        if (requestedContractorIdRef.current === effectiveSelectedId) {
          setSummary(result);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, effectiveSelectedId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_372px] lg:items-start">
      <div className="space-y-4">
        {missingNipCount > 0 ? (
          <Banner tone="warning">{t.contractors.dataQuality.missingNip(missingNipCount)}</Banner>
        ) : null}

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
            {(['all', 'active', 'inactive'] as StatusFilter[]).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  'rounded-control px-3 py-1.5 text-xs font-semibold transition',
                  statusFilter === filter ? 'bg-primary text-primary-ink' : 'text-muted hover:text-foreground',
                )}
              >
                {filter === 'all'
                  ? t.contractors.filterAll
                  : filter === 'active'
                    ? t.contractors.filterActive
                    : t.contractors.filterInactive}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-card border border-outline bg-surface-panel p-6 text-center text-sm text-muted">
            {search.trim() || statusFilter !== 'all' ? t.contractors.emptyFiltered : t.contractors.emptyList}
          </p>
        ) : (
          <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <colgroup>
                  <col />
                  <col className="w-[124px]" />
                  <col className="w-[118px]" />
                  <col className="w-[104px]" />
                </colgroup>
                <thead>
                  <tr className="bg-surface-muted text-left">
                    <HeaderCell>{t.contractors.columns.name}</HeaderCell>
                    <HeaderCell>{t.contractors.columns.nip}</HeaderCell>
                    <HeaderCell className="text-right">{t.contractors.columns.turnover(turnoverYear)}</HeaderCell>
                    <HeaderCell className="text-right">{t.contractors.columns.status}</HeaderCell>
                    {canEdit ? <HeaderCell className="text-right lg:hidden">{t.contractors.actions.edit}</HeaderCell> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contractor) => (
                    <tr
                      key={contractor.id}
                      onClick={() => setSelectedId(contractor.id)}
                      className={cn(
                        'cursor-pointer border-t border-outline transition hover:bg-surface-row-hover',
                        contractor.id === effectiveSelectedId && 'bg-surface-row-hover',
                      )}
                    >
                      <BodyCell className="font-medium text-foreground">{contractor.name}</BodyCell>
                      <BodyCell className={contractor.nip ? 'font-mono text-xs text-foreground-secondary' : 'font-mono text-xs text-error-ink'}>
                        {contractor.nip ?? t.contractors.nipMissing}
                      </BodyCell>
                      <BodyCell className="text-right tabular-nums">{formatMoney(contractor.turnover)}</BodyCell>
                      <BodyCell className="text-right">
                        <Badge tone={contractor.nip ? (contractor.isActive ? 'success' : 'draft') : 'danger'}>
                          {contractor.nip
                            ? contractor.isActive ? t.contractors.status.active : t.contractors.status.inactive
                            : t.contractors.status.blocked}
                        </Badge>
                      </BodyCell>
                      {canEdit ? (
                        <BodyCell className="text-right lg:hidden">
                          <Link
                            href={`/dashboard/contractors/${contractor.id}/edit`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-xs font-semibold text-primary-strong transition hover:text-primary"
                          >
                            {t.contractors.actions.edit}
                          </Link>
                        </BodyCell>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="hidden rounded-card border border-outline bg-chrome p-[22px] lg:block">
        {selected ? (
          <ContractorDetail
            contractor={selected}
            canEdit={canEdit}
            summary={summary}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <p className="text-sm text-muted">{t.contractors.detail.selectPrompt}</p>
        )}
      </div>
    </div>
  );
}

function ContractorDetail({
  contractor,
  canEdit,
  summary,
  onClose,
}: {
  contractor: Contractor;
  canEdit: boolean;
  summary: ContractorSummary | null;
  onClose: () => void;
}) {
  const outstandingIsPositive = summary != null && summary.outstanding !== '0' && summary.outstanding !== '0.00';

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[17px] font-semibold leading-tight text-foreground">{contractor.name}</p>
          {contractor.nip ? <p className="font-mono text-xs text-muted">NIP {contractor.nip}</p> : null}
        </div>
        <button type="button" onClick={onClose} className="text-[12.5px] text-muted transition hover:text-foreground">
          {t.contractors.detail.close}
        </button>
      </div>

      <div className={cn(PANEL_SHELL, 'gap-2.5')}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.contractors.detail.eyebrow}</p>
        <DetailRow label={t.contractors.detail.status}>
          <Badge tone={contractor.nip ? (contractor.isActive ? 'success' : 'draft') : 'danger'}>
            {contractor.nip
              ? contractor.isActive ? t.contractors.status.active : t.contractors.status.inactive
              : t.contractors.status.blocked}
          </Badge>
        </DetailRow>
        <DetailRow label={t.contractors.detail.address}>
          {contractor.addressLine1 ? `${contractor.addressLine1}${contractor.addressLine2 ? `, ${contractor.addressLine2}` : ''}` : '—'}
        </DetailRow>
        <DetailRow label={t.contractors.detail.email}>{contractor.email ?? '—'}</DetailRow>
        <DetailRow label={t.contractors.detail.phone}>{contractor.phone ?? '—'}</DetailRow>
        <DetailRow label={t.contractors.detail.bankAccount}>{contractor.bankAccount ?? '—'}</DetailRow>
        {contractor.notes ? <DetailRow label={t.contractors.detail.notes}>{contractor.notes}</DetailRow> : null}
      </div>

      <div className={cn(PANEL_SHELL, 'gap-[11px]')}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.contractors.detail.balanceEyebrow}</p>
        <BalanceRow
          label={t.contractors.detail.balanceOutstanding}
          value={summary ? formatMoney(summary.outstanding) : '—'}
          warn={outstandingIsPositive}
        />
        <BalanceRow
          label={t.contractors.detail.balancePaidThisYear}
          value={summary ? formatMoney(summary.paidThisYear) : '—'}
        />
      </div>

      <div className={cn(PANEL_SHELL, 'gap-[10px]')}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.contractors.detail.recentDocuments}</p>
        {summary && summary.recentDocuments.length > 0 ? (
          summary.recentDocuments.map((document) => (
            <div key={document.id} className="flex justify-between text-[12.5px]">
              <Link href={`/dashboard/invoices/${document.id}`} className="font-mono text-[12px]">
                {document.invoiceNumber ?? '—'}
              </Link>
              <span className="tabular-nums text-foreground-secondary">{formatMoney(document.totalGross)}</span>
            </div>
          ))
        ) : (
          <p className="text-[12.5px] text-muted">—</p>
        )}
      </div>

      {canEdit ? (
        <div className="mt-auto flex gap-2">
          <Link href={`/dashboard/contractors/${contractor.id}/edit`} className="flex-1">
            <Button variant="secondary" className="w-full">{t.contractors.detail.editButton}</Button>
          </Link>
          <Link href="/dashboard/invoices/new" className="flex-1">
            <Button className="w-full">{t.contractors.detail.newInvoiceButton}</Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className="max-w-[190px] text-right font-medium text-foreground">{children}</span>
    </div>
  );
}

function BalanceRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12.5px] text-muted">{label}</span>
      <span className={cn('text-[19px] font-semibold tabular-nums', warn && 'text-warning-ink')}>{value}</span>
    </div>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-[18px] py-[10px] font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-[18px] py-3 align-middle text-[13px] ${className}`}>{children}</td>;
}
