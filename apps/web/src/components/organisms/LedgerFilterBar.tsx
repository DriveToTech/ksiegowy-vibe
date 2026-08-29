'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdAccount, HouseholdCategory } from '../../lib/api-types';
import { t } from '../../lib/translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { Select } from '../atoms/Select';
import { Input } from '../atoms/Input';

interface LedgerFilterBarProps {
  accounts: HouseholdAccount[];
  categories: HouseholdCategory[];
}

type Direction = '' | 'in' | 'out';

/**
 * Maps directly to the real query params listTransactions() accepts
 * (accountId/categoryId/dateFrom/dateTo/search/direction) — no client-side
 * filtering, every change re-requests the ledger page with page reset to 1.
 */
export function LedgerFilterBar({ accounts, categories }: LedgerFilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [direction, setDirection] = useState<Direction>((searchParams.get('direction') as Direction) ?? '');
  const [accountId, setAccountId] = useState(searchParams.get('accountId') ?? '');
  const [categoryId, setCategoryId] = useState(searchParams.get('categoryId') ?? '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') ?? '');

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (direction) params.set('direction', direction);
    if (accountId) params.set('accountId', accountId);
    if (categoryId) params.set('categoryId', categoryId);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    router.push(`/household/ledger${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const clearFilters = () => {
    setSearch('');
    setDirection('');
    setAccountId('');
    setCategoryId('');
    setDateFrom('');
    setDateTo('');
    router.push('/household/ledger');
  };

  return (
    <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          id="ledger-filter-search"
          aria-label={t.household.ledger.searchPlaceholder}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t.household.ledger.searchPlaceholder}
          className="min-w-[220px] flex-1"
        />
        <div role="group" aria-label={t.household.ledger.filterBar.directionLabel} className="flex gap-0.5 rounded-control border border-outline bg-surface-raised p-0.5">
          {([
            ['', t.household.ledger.filters.all],
            ['in', t.household.ledger.filters.in],
            ['out', t.household.ledger.filters.out],
          ] as const).map(([value, label]) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={direction === value}
              onClick={() => setDirection(value)}
              className={cn(
                'min-h-11 rounded-[7px] px-3.5 text-sm font-medium transition',
                direction === value ? 'bg-[image:var(--nav-active)] border border-[var(--nav-active-border)] font-semibold text-foreground' : 'border border-transparent text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ledger-filter-account" className="text-xs font-medium text-muted">{t.household.ledger.filterBar.accountLabel}</label>
          <Select id="ledger-filter-account" value={accountId} onChange={(event) => setAccountId(event.target.value)} className="min-w-[180px]">
            <option value="">{t.household.ledger.filterBar.accountAll}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ledger-filter-category" className="text-xs font-medium text-muted">{t.household.ledger.filterBar.categoryLabel}</label>
          <Select id="ledger-filter-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-w-[180px]">
            <option value="">{t.household.ledger.filterBar.categoryAll}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ledger-filter-date-from" className="text-xs font-medium text-muted">{t.household.ledger.filterBar.dateFromLabel}</label>
          <Input id="ledger-filter-date-from" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ledger-filter-date-to" className="text-xs font-medium text-muted">{t.household.ledger.filterBar.dateToLabel}</label>
          <Input id="ledger-filter-date-to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={clearFilters}>{t.household.ledger.filterBar.clear}</Button>
          <Button onClick={applyFilters}>{t.household.ledger.filterBar.apply}</Button>
        </div>
      </div>
    </div>
  );
}
