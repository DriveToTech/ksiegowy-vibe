'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { HouseholdAccount } from '../../lib/api-types';
import { formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { cn } from '../../lib/cn';

interface AccountPickerProps {
  accounts: HouseholdAccount[];
  value: string;
  onChange: (accountId: string) => void;
  id?: string;
  className?: string;
}

/**
 * Data-source-agnostic: takes a plain array prop and fetches nothing itself.
 * A custom listbox rather than a native <select> because the design's row
 * shape (name, masked number, one badge chip, balance, and for credit cards
 * the limit/statement date) can't be laid out inside <option> elements.
 * Keyboard-operable: ArrowDown/ArrowUp move the active row, Enter picks it,
 * Escape closes — same behavior a native select gives for free.
 */
export function AccountPicker({ accounts, value, onChange, id, className }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${triggerId}-listbox`;

  const selectedAccount = accounts.find((account) => account.id === value) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const openList = () => {
    const index = Math.max(0, accounts.findIndex((account) => account.id === value));
    setActiveIndex(index);
    setOpen(true);
  };

  const pick = (accountId: string) => {
    onChange(accountId);
    setOpen(false);
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openList();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(accounts.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const account = accounts[activeIndex];
      if (account) pick(account.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={triggerId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={t.household.accountPicker.selectAccount}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleTriggerKeyDown}
        className="flex h-11 w-full items-center gap-3 rounded-control border border-outline-control bg-surface-raised px-3 text-left text-sm text-foreground transition focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {selectedAccount ? (
          <>
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{selectedAccount.name}</span>
              {selectedAccount.accountNumberMask ? (
                <span className="ml-1.5 font-mono text-[11px] text-muted">{selectedAccount.accountNumberMask}</span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-[13px] text-foreground-secondary">{formatMoney(selectedAccount.balance)}</span>
          </>
        ) : (
          <span className="flex-1 text-muted">{t.household.accountPicker.selectAccount}</span>
        )}
        <span className="shrink-0 text-muted" aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="absolute z-20 mt-1.5 w-full min-w-[320px] overflow-hidden rounded-control border border-outline bg-surface-panel shadow-lg">
          <div className="flex items-center justify-between border-b border-outline px-3 py-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted">
            <span>{t.household.accountPicker.accountCount(accounts.length)}</span>
            <span>{t.household.accountPicker.keyboardHint}</span>
          </div>
          <ul
            role="listbox"
            id={listboxId}
            aria-label={t.household.accountPicker.selectAccount}
            tabIndex={0}
            onKeyDown={handleListKeyDown}
            className="max-h-72 overflow-y-auto outline-none"
          >
            {accounts.map((account, index) => {
              const badge = accountBadge(account);
              const isCredit = account.type === 'CREDIT_CARD' && account.creditLimit;

              return (
                <li
                  key={account.id}
                  role="option"
                  aria-selected={account.id === value}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(account.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition',
                    index === activeIndex ? 'bg-primary-soft' : 'hover:bg-surface-row-hover',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate font-medium text-foreground">{account.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-muted">
                      {account.accountNumberMask ? `${account.accountNumberMask} · ` : ''}
                      {isCredit
                        ? `${t.household.accountPicker.creditLimitLabel} ${formatMoney(account.creditLimit as string)}${account.statementDay ? ` · ${t.household.accountPicker.statementDayLabel(account.statementDay)}` : ''}`
                        : t.household.accountPicker.typeLabels[account.type]}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[13px] text-foreground-secondary">{formatMoney(account.balance)}</span>
                  <span className={cn('shrink-0 rounded-chip px-2 py-0.5 font-mono text-[10px] tracking-[0.08em]', badge.toneClass)}>
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function accountBadge(account: HouseholdAccount): { label: string; toneClass: string } {
  if (account.visibility === 'PRIVATE') {
    return { label: t.household.accountPicker.visibilityLabels.PRIVATE, toneClass: 'bg-surface-raised text-muted' };
  }
  if (account.type === 'CREDIT_CARD') {
    return { label: t.household.accountPicker.typeLabels.CREDIT_CARD, toneClass: 'bg-warning text-warning-ink' };
  }
  if (account.type === 'CASH') {
    return { label: t.household.accountPicker.typeLabels.CASH, toneClass: 'bg-surface-raised text-muted' };
  }
  return { label: t.household.accountPicker.visibilityLabels.SHARED, toneClass: 'bg-success text-success-ink' };
}
