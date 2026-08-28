'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdAccount, HouseholdCategory } from '../../lib/api-types';
import { t } from '../../lib/translations';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { Input } from '../atoms/Input';

interface LedgerFilterBarProps {
  accounts: HouseholdAccount[];
  categories: HouseholdCategory[];
}

/**
 * Maps directly to the real query params listTransactions() accepts
 * (accountId/categoryId/dateFrom/dateTo) — no client-side filtering, every
 * change re-requests the ledger page with page reset to 1.
 */
export function LedgerFilterBar({ accounts, categories }: LedgerFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? '');

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (accountId) params.set('accountId', accountId);
    if (categoryId) params.set('categoryId', categoryId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    router.push(`/household/ledger${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const clearFilters = () => {
    setAccountId('');
    setCategoryId('');
    setDateFrom('');
    setDateTo('');
    router.push('/household/ledger');
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-card border border-outline bg-surface-panel p-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">{t.household.ledger.filterBar.accountLabel}</label>
        <Select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="min-w-[180px]">
          <option value="">{t.household.ledger.filterBar.accountAll}</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">{t.household.ledger.filterBar.categoryLabel}</label>
        <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-w-[180px]">
          <option value="">{t.household.ledger.filterBar.categoryAll}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">{t.household.ledger.filterBar.dateFromLabel}</label>
        <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted">{t.household.ledger.filterBar.dateToLabel}</label>
        <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
      </div>
      <div className="ml-auto flex gap-2">
        <Button variant="secondary" onClick={clearFilters}>{t.household.ledger.filterBar.clear}</Button>
        <Button onClick={applyFilters}>{t.household.ledger.filterBar.apply}</Button>
      </div>
    </div>
  );
}
