'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BudgetEnvelope, HouseholdAccount, HouseholdCategory, HouseholdMember, HouseholdTransaction } from '../../lib/api-types';
import { createHouseholdTransaction, createHouseholdTransfer, updateHouseholdTransaction } from '../../lib/api-client';
import { formatMoney, parseDecimalValue, todayAsCalendarDate } from '../../lib/format';
import { t } from '../../lib/translations';
import { AccountPicker } from '../molecules/AccountPicker';
import { ErrorState } from '../molecules/ErrorState';
import { FormField } from '../molecules/FormField';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Select } from '../atoms/Select';
import { Textarea } from '../atoms/Textarea';
import { cn } from '../../lib/cn';

type Direction = 'in' | 'out' | 'transfer';

/**
 * Direction is visually unmistakable: money out gets a warning/red tint,
 * money in and transfer keep the household's green "active" identity.
 */
function directionActiveClass(value: Direction): string {
  if (value === 'out') {
    return 'bg-error/15 border border-error text-error-ink font-semibold';
  }
  return 'bg-[image:var(--nav-active)] border border-[var(--nav-active-border)] font-semibold text-foreground';
}

interface TransactionFormProps {
  householdId: string;
  accounts: HouseholdAccount[];
  categories: HouseholdCategory[];
  members?: HouseholdMember[];
  envelopes?: BudgetEnvelope[];
  transaction?: HouseholdTransaction;
}

export function TransactionForm({ householdId, accounts, categories, members = [], envelopes = [], transaction }: TransactionFormProps) {
  const router = useRouter();
  const isEdit = Boolean(transaction);

  const [direction, setDirection] = useState<Direction>(transaction && parseFloat(transaction.amount) >= 0 ? 'in' : 'out');
  const [payee, setPayee] = useState(transaction?.payee ?? '');
  const [amount, setAmount] = useState(transaction ? Math.abs(parseFloat(transaction.amount)).toString() : '');
  const [accountId, setAccountId] = useState(transaction?.accountId ?? accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts.find((account) => account.id !== accountId)?.id ?? '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [date, setDate] = useState(transaction?.date ?? todayAsCalendarDate());
  const [payerUserId, setPayerUserId] = useState(transaction?.payerUserId ?? '');
  const [tag, setTag] = useState(transaction?.tag ?? '');
  const [note, setNote] = useState(transaction?.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envelope = categoryId ? envelopes.find((item) => item.categoryId === categoryId) ?? null : null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!date) {
      setError(t.household.transactionForm.dateRequiredError);
      return;
    }

    if (isEdit && transaction) {
      if (!payee.trim()) {
        setError(t.household.transactionForm.payeeRequiredError);
        return;
      }

      setSubmitting(true);
      const result = await updateHouseholdTransaction(householdId, transaction.id, {
        payee: payee.trim(),
        categoryId: categoryId || null,
        tag: tag.trim() || null,
        note: note.trim() || null,
        date,
      }).catch((submitError: Error) => submitError);
      setSubmitting(false);
      if (result instanceof Error) {
        setError(result.message);
        return;
      }

      router.push('/household/ledger');
      router.refresh();
      return;
    }

    const parsedAmount = parseDecimalValue(amount);
    if (parsedAmount === null || parsedAmount <= 0) {
      setError(t.household.transactionForm.amountRequiredError);
      return;
    }
    if (!accountId) {
      setError(t.household.transactionForm.accountRequiredError);
      return;
    }

    if (direction === 'transfer') {
      if (!toAccountId) {
        setError(t.household.transactionForm.toAccountRequiredError);
        return;
      }
      if (toAccountId === accountId) {
        setError(t.household.transactionForm.sameAccountError);
        return;
      }

      setSubmitting(true);
      const result = await createHouseholdTransfer(householdId, {
        fromAccountId: accountId,
        toAccountId,
        amount: parsedAmount.toFixed(2),
        date,
        payee: payee.trim() || undefined,
        note: note.trim() || undefined,
      }).catch((submitError: Error) => submitError);
      setSubmitting(false);

      if (result instanceof Error) {
        setError(result.message);
        return;
      }

      router.push('/household/ledger');
      router.refresh();
      return;
    }

    if (!payee.trim()) {
      setError(t.household.transactionForm.payeeRequiredError);
      return;
    }

    const signedAmount = direction === 'in' ? parsedAmount : -parsedAmount;
    const body = {
      accountId,
      categoryId: categoryId || undefined,
      payee: payee.trim(),
      payerUserId: payerUserId || undefined,
      amount: signedAmount.toFixed(2),
      date,
      tag: tag.trim() || undefined,
      note: note.trim() || undefined,
    };

    setSubmitting(true);
    const result = await createHouseholdTransaction(householdId, body).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push('/household/ledger');
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
      {error ? <ErrorState message={error} /> : null}

      {/* Amount is the hero of the form, not one of many equal-weight fields. */}
      <div className="flex flex-col gap-4 rounded-inset bg-surface-raised p-5 sm:flex-row sm:items-end sm:justify-between">
        {isEdit && transaction ? (
          <div className="max-w-[220px] space-y-2">
            <label htmlFor="transaction-amount-output" className="block text-sm font-semibold text-foreground">{t.household.transactionForm.fields.amount}</label>
            <output id="transaction-amount-output" className="block h-14 rounded-control border border-outline-control bg-surface-raised px-3 py-3 text-2xl font-semibold tabular-nums text-foreground" aria-label={t.household.transactionForm.fields.amount}>
              {formatMoney(transaction.amount)}
            </output>
          </div>
        ) : (
          <FormField label={t.household.transactionForm.fields.amount} htmlFor="transaction-amount" required className="max-w-[220px]">
            <div className="relative">
              <Input
                id="transaction-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-14 pr-11 text-2xl font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-base font-medium text-muted">zł</span>
            </div>
          </FormField>
        )}

        {!isEdit ? (
          <div role="group" aria-label={t.household.transactionForm.directionLabel} className="flex gap-0.5 rounded-control border border-outline bg-surface-panel p-0.5">
            {(['out', 'in', 'transfer'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={direction === value}
                onClick={() => setDirection(value)}
                className={cn(
                  'min-h-11 flex-1 rounded-[7px] px-4 text-sm font-medium transition',
                  direction === value ? directionActiveClass(value) : 'border border-transparent text-muted',
                )}
              >
                {value === 'in' ? t.household.transactionForm.directionIn : value === 'out' ? t.household.transactionForm.directionOut : t.household.transactionForm.directionTransfer}
              </button>
            ))}
          </div>
        ) : (
          <div role="group" aria-label={t.household.transactionForm.directionLabel} className="flex min-h-11 items-center rounded-control border border-outline bg-surface-panel px-4">
            <Badge tone={direction === 'in' ? 'success' : 'danger'}>
              {direction === 'in' ? t.household.transactionForm.directionIn : t.household.transactionForm.directionOut}
            </Badge>
          </div>
        )}
      </div>

      {direction !== 'transfer' ? (
        <FormSection title={t.household.transactionForm.sections.whenAndWho}>
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField label={t.household.transactionForm.fields.payee} required className="sm:col-span-3">
              <Input value={payee} onChange={(event) => setPayee(event.target.value)} placeholder={t.household.transactionForm.fields.payee} />
            </FormField>
            <FormField label={t.household.transactionForm.fields.date} required>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </FormField>
            {isEdit ? (
              <FormField label={t.household.transactionForm.fields.payer} className="sm:col-span-2">
                <output aria-label={t.household.transactionForm.fields.payer} className="flex h-11 items-center rounded-control border border-outline-control bg-surface-raised px-3 text-sm text-foreground-secondary">
                  {members.find((member) => member.userId === transaction?.payerUserId)?.displayName
                    ?? members.find((member) => member.userId === transaction?.payerUserId)?.userEmail
                    ?? '—'}
                </output>
              </FormField>
            ) : members.length > 0 ? (
              <FormField label={t.household.transactionForm.fields.payer} className="sm:col-span-2">
                <Select value={payerUserId} onChange={(event) => setPayerUserId(event.target.value)}>
                  <option value="">{t.household.transactionForm.payerPlaceholder}</option>
                  {members.map((member) => (
                    <option key={member.userId} value={member.userId}>{member.displayName ?? member.userEmail}</option>
                  ))}
                </Select>
              </FormField>
            ) : null}
          </div>
        </FormSection>
      ) : (
        <FormSection title={t.household.transactionForm.sections.whenAndWho}>
          <FormField label={t.household.transactionForm.fields.date} required className="max-w-xs">
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </FormField>
        </FormSection>
      )}

      <FormSection
        title={t.household.transactionForm.sections.fromAccount}
        action={<Link href="/household/settings/accounts" className="text-sm font-medium text-primary-strong hover:text-primary">{t.household.transactionForm.manageAccounts}</Link>}
      >
        {isEdit ? (
          <output aria-label={t.household.transactionForm.fields.account} className="flex min-h-11 items-center rounded-control border border-outline-control bg-surface-raised px-3 text-sm text-foreground-secondary">
            {accounts.find((account) => account.id === accountId)?.name ?? '—'}
          </output>
        ) : (
          <FormField label={t.household.transactionForm.fields.account} required>
            <AccountPicker ariaLabel={t.household.transactionForm.fields.account} accounts={accounts} value={accountId} onChange={setAccountId} />
          </FormField>
        )}
      </FormSection>

      {direction === 'transfer' ? (
        <FormSection title={t.household.transactionForm.sections.toAccount}>
          <FormField label={t.household.transactionForm.fields.toAccount} required>
            <AccountPicker ariaLabel={t.household.transactionForm.fields.toAccount} accounts={accounts.filter((account) => account.id !== accountId)} value={toAccountId} onChange={setToAccountId} />
          </FormField>
        </FormSection>
      ) : (
        <FormSection title={t.household.transactionForm.sections.categoryAndEnvelope}>
          <div className="flex flex-col gap-3">
            <FormField label={t.household.transactionForm.fields.category}>
              <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">{t.household.ledger.uncategorized}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </FormField>
            {envelope ? (
              <div className="flex flex-col gap-1.5 rounded-inset bg-surface-raised p-3">
                <div className="flex items-center justify-between text-[12.5px] text-foreground-secondary">
                  <span>{envelope.categoryName}</span>
                  <span className="tabular-nums">
                    {t.household.transactionForm.envelopeAfterSaving(formatMoney(envelope.spent), formatMoney(envelope.monthlyLimit))}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-panel">
                  <div
                    className="h-full rounded-full bg-[image:var(--brand-gradient)]"
                    style={{ width: `${Math.min(100, Math.round((parseFloat(envelope.spent) / (parseFloat(envelope.monthlyLimit) || 1)) * 100))}%` }}
                  />
                </div>
              </div>
            ) : null}
            <FormField label={t.household.transactionForm.fields.tag}>
              <Input value={tag} onChange={(event) => setTag(event.target.value)} />
            </FormField>
          </div>
        </FormSection>
      )}

      <FormSection title={t.household.transactionForm.sections.note}>
        <label htmlFor="transaction-note" className="sr-only">{t.household.transactionForm.fields.note}</label>
        <Textarea id="transaction-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t.household.transactionForm.notePlaceholder} />
      </FormSection>

      {/* Sticky, not just bottom-of-form: the form is taller than one viewport,
          so Save/Cancel stay reachable without scrolling all the way down. */}
      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-3 rounded-b-card border-t border-outline bg-surface-panel px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t.household.transactionForm.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {!isEdit && direction === 'transfer' ? t.household.transactionForm.saveTransfer : t.household.transactionForm.save}
        </Button>
      </div>
    </form>
  );
}

function FormSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-raised/40 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
