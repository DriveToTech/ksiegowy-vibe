'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { HouseholdAccount } from '../../lib/api-types';
import { accountBadge, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { cn } from '../../lib/cn';

interface AccountPickerProps {
  accounts: HouseholdAccount[];
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * Data-source-agnostic: takes a plain array prop and fetches nothing itself.
 * A custom listbox rather than a native <select> because the design's row
 * shape (name, masked number, one badge chip, balance, and for credit cards
 * the limit/statement date) can't be laid out inside <option> elements.
 * Keyboard-operable: ArrowDown/ArrowUp move the active row, Home/End jump to
 * the first/last row, Enter/Space picks it, and Escape closes.
 */
export function AccountPicker({ accounts, value, onChange, disabled = false, id, ariaLabel, className }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listboxId = `${triggerId}-listbox`;
  const accessibleLabel = ariaLabel ?? t.household.accountPicker.selectAccount;

  const selectedAccount = accounts.find((account) => account.id === value) ?? null;

  useEffect(() => {
    if (!open) return undefined;
    listboxRef.current?.focus();
    const handleClickOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && containerRef.current && !containerRef.current.contains(event.target)) {
        const targetElement = event.target instanceof Element ? event.target : null;
        const clickTargetControl = targetElement?.closest('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        const shouldRestoreFocus = document.activeElement === listboxRef.current && !clickTargetControl;
        setOpen(false);
        if (shouldRestoreFocus) window.setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [open]);

  const openList = () => {
    if (accounts.length === 0) return;
    const index = Math.max(0, accounts.findIndex((account) => account.id === value));
    setActiveIndex(index);
    setOpen(true);
  };

  const pick = (accountId: string) => {
    onChange(accountId);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (open) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      openList();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const currentActiveIndex = Math.min(activeIndex, Math.max(0, accounts.length - 1));

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(accounts.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, accounts.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const account = accounts[currentActiveIndex];
      if (account) pick(account.id);
    } else if (event.key === ' ' || event.code === 'Space') {
      event.preventDefault();
      const account = accounts[currentActiveIndex];
      if (account) pick(account.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  const currentActiveIndex = Math.min(activeIndex, Math.max(0, accounts.length - 1));

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={accessibleLabel}
         disabled={disabled || accounts.length === 0}
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
          <span className="flex-1 text-muted">
            {accounts.length === 0 ? t.household.accountPicker.noAccounts : t.household.accountPicker.selectAccount}
          </span>
        )}
        <span className="shrink-0 text-muted" aria-hidden="true">▾</span>
      </button>

      {open ? (
         <div className="absolute left-0 z-20 mt-1.5 w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-control border border-outline bg-surface-panel shadow-lg">
           <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-outline px-3 py-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted">
            <span>{t.household.accountPicker.accountCount(accounts.length)}</span>
            <span>{t.household.accountPicker.keyboardHint}</span>
          </div>
          <ul
            role="listbox"
            id={listboxId}
            aria-label={accessibleLabel}
            aria-activedescendant={accounts[currentActiveIndex] ? `${listboxId}-option-${accounts[currentActiveIndex].id}` : undefined}
            ref={listboxRef}
            tabIndex={-1}
            onKeyDown={handleListKeyDown}
            className="max-h-72 overflow-y-auto outline-none"
          >
            {accounts.map((account, index) => {
              const badge = accountBadge(account);
              const creditLimit = account.type === 'CREDIT_CARD' ? account.creditLimit : null;
              const accountTypeLabel = creditLimit !== null
                ? `${t.household.accountPicker.creditLimitLabel} ${formatMoney(creditLimit)}${account.statementDay ? ` · ${t.household.accountPicker.statementDayLabel(account.statementDay)}` : ''}`
                : t.household.accountPicker.typeLabels[account.type];

              return (
                <li
                  key={account.id}
                  id={`${listboxId}-option-${account.id}`}
                  role="option"
                  aria-selected={account.id === value}
                  data-active={index === currentActiveIndex ? 'true' : undefined}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pick(account.id)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition',
                    index === currentActiveIndex ? 'bg-primary-soft' : 'hover:bg-surface-row-hover',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="block truncate font-medium text-foreground">{account.name}</span>
                    <span className="block truncate font-mono text-[10.5px] text-muted">
                      {account.accountNumberMask ? `${account.accountNumberMask} · ` : ''}
                      {accountTypeLabel}
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
