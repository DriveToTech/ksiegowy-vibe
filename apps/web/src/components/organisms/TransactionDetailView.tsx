'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BudgetEnvelope, HouseholdAccount, HouseholdCategory, HouseholdMember, HouseholdTransaction } from '../../lib/api-types';
import { deleteHouseholdTransaction } from '../../lib/api-client';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { ErrorState } from '../molecules/ErrorState';
import { TransactionForm } from './TransactionForm';

interface TransactionDetailViewProps {
  householdId: string;
  transaction: HouseholdTransaction;
  accounts: HouseholdAccount[];
  categories: HouseholdCategory[];
  members: HouseholdMember[];
  envelopes: BudgetEnvelope[];
}

export function TransactionDetailView({ householdId, transaction, accounts, categories, members, envelopes }: TransactionDetailViewProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'edit') {
    return (
      <TransactionForm
        householdId={householdId}
        accounts={accounts}
        categories={categories}
        members={members}
        envelopes={envelopes}
        transaction={transaction}
      />
    );
  }

  const amount = parseFloat(transaction.amount);
  const isTransfer = Boolean(transaction.transferGroupId);
  const direction = isTransfer ? 'transfer' : amount >= 0 ? 'in' : 'out';
  const account = accounts.find((item) => item.id === transaction.accountId) ?? null;
  const category = categories.find((item) => item.id === transaction.categoryId) ?? null;
  const payer = members.find((member) => member.userId === transaction.payerUserId) ?? null;
  const envelope = transaction.categoryId ? envelopes.find((item) => item.categoryId === transaction.categoryId) ?? null : null;

  const handleDelete = async () => {
    if (!window.confirm(t.household.transactionDetail.deleteConfirm)) return;

    setError(null);
    setDeleting(true);
    const result = await deleteHouseholdTransaction(householdId, transaction.id).catch((deleteError: Error) => deleteError);
    setDeleting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.push('/household/ledger');
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-col gap-5 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <Badge tone={direction === 'in' ? 'success' : direction === 'transfer' ? 'offline24' : 'danger'}>
              {direction === 'in' ? t.household.transactionDetail.moneyIn : direction === 'transfer' ? t.household.transactionDetail.transfer : t.household.transactionDetail.moneyOut}
            </Badge>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">{transaction.payee}</h1>
            <p className="text-sm text-muted">
              {formatDate(transaction.date)}
              {payer ? ` · ${t.household.transactionDetail.paidBySuffix(payer.displayName ?? payer.userEmail)}` : ''}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.transactionForm.fields.amount}</p>
            <p className={`text-[32px] font-semibold tracking-[-0.03em] tabular-nums ${isTransfer ? 'text-foreground-secondary' : amount >= 0 ? 'text-success-ink' : 'text-error-ink'}`}>{formatMoney(transaction.amount)}</p>
            {category ? <p className="text-sm text-muted">{category.name}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-outline pt-5">
          <Button
            variant="danger"
            size="sm"
            className="mr-auto border border-error bg-transparent text-error-ink hover:bg-error/10"
            onClick={handleDelete}
            disabled={deleting}
          >
            {t.household.transactionDetail.deleteAction}
          </Button>
          {!isTransfer ? <Button onClick={() => setMode('edit')}>{t.household.transactionDetail.editAction}</Button> : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.transactionDetail.accountCardTitle}</h2>
          <p className="text-[14px] font-medium text-foreground">{account?.name ?? '—'}</p>
          {account?.accountNumberMask ? <p className="font-mono text-[11px] text-muted">{account.accountNumberMask}</p> : null}
          {transaction.bankDescription ? <DetailRow label={t.household.transactionDetail.bankLineLabel} value={transaction.bankDescription} mono /> : null}
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.transactionDetail.classificationTitle}</h2>
          <DetailRow label={t.household.transactionDetail.categoryLabel} value={category?.name ?? t.household.ledger.uncategorized} />
          <DetailRow label={t.household.transactionDetail.assignedByLabel} value={t.household.transactionDetail.assignedBySource[transaction.categorizationSource]} />
          <DetailRow label={t.household.transactionDetail.recurringLabel} value={transaction.isRecurring ? t.household.transactionDetail.yes : t.household.transactionDetail.no} />
          <DetailRow label={t.household.transactionDetail.tagsLabel} value={transaction.tag ?? '—'} />
        </div>

        <div className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.transactionDetail.envelopeImpactTitle}</h2>
          {envelope ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">{formatMoney(envelope.spent)}</span>
                <span className="tabular-nums text-sm text-muted">/ {formatMoney(envelope.monthlyLimit)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                <div
                  className="h-full rounded-full bg-[image:var(--brand-gradient)]"
                  style={{ width: `${Math.min(100, Math.round((parseFloat(envelope.spent) / (parseFloat(envelope.monthlyLimit) || 1)) * 100))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{t.household.transactionDetail.noEnvelope}</p>
          )}
        </div>
      </div>

      {transaction.note ? (
        <div className="rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.transactionForm.sections.note}</h2>
          <p className="text-sm text-foreground-secondary">{transaction.note}</p>
        </div>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>
      <span className={mono ? 'font-mono text-foreground' : 'font-medium text-foreground'}>{value}</span>
    </div>
  );
}
