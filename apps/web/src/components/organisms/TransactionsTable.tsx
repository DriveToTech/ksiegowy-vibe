import Link from 'next/link';
import type { HouseholdAccount, HouseholdCategory, HouseholdTransaction } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';

interface TransactionsTableProps {
  transactions: HouseholdTransaction[];
  categories: HouseholdCategory[];
  accounts: HouseholdAccount[];
}

function amountToneClass(amount: string): string {
  return parseFloat(amount) >= 0 ? 'text-success-ink' : 'text-error-ink';
}

export function TransactionsTable({ transactions, categories, accounts }: TransactionsTableProps) {
  const categoryName = (categoryId: string | null) => categories.find((category) => category.id === categoryId)?.name ?? null;
  const accountName = (accountId: string) => accounts.find((account) => account.id === accountId)?.name ?? '—';

  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-outline bg-surface-panel lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="bg-surface-muted text-left">
                <HeaderCell>{t.household.ledger.columns.date}</HeaderCell>
                <HeaderCell>{t.household.ledger.columns.payee}</HeaderCell>
                <HeaderCell>{t.household.ledger.columns.category}</HeaderCell>
                <HeaderCell>{t.household.ledger.columns.account}</HeaderCell>
                <HeaderCell className="text-right">{t.household.ledger.columns.amount}</HeaderCell>
                <HeaderCell className="text-right">{t.household.ledger.columns.tag}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => {
                const category = categoryName(transaction.categoryId);
                return (
                  <tr key={transaction.id} className="border-t border-outline transition hover:bg-surface-row-hover">
                    <BodyCell className="text-muted">{formatDate(transaction.date)}</BodyCell>
                    <BodyCell className="max-w-0 truncate">
                      <Link href={`/household/ledger/${transaction.id}`} className="font-medium text-foreground transition hover:text-primary">
                        {transaction.payee}
                      </Link>
                    </BodyCell>
                    <BodyCell>
                      {category ? <span className="text-foreground-secondary">{category}</span> : <Badge tone="warning">{t.household.ledger.uncategorized}</Badge>}
                    </BodyCell>
                    <BodyCell className="text-muted">{accountName(transaction.accountId)}</BodyCell>
                    <BodyCell className={`text-right tabular-nums font-medium ${amountToneClass(transaction.amount)}`}>{formatMoney(transaction.amount)}</BodyCell>
                    <BodyCell className="text-right font-mono text-[10px] text-muted">{transaction.tag ?? '—'}</BodyCell>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {transactions.map((transaction) => {
          const category = categoryName(transaction.categoryId);
          return (
            <div key={transaction.id} className="space-y-4 rounded-card border border-outline bg-surface-panel p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/household/ledger/${transaction.id}`} className="font-medium text-foreground">
                    {transaction.payee}
                  </Link>
                  <p className="mt-1 text-sm text-muted">{accountName(transaction.accountId)}</p>
                </div>
                <p className={`tabular-nums text-base font-semibold ${amountToneClass(transaction.amount)}`}>{formatMoney(transaction.amount)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem label={t.household.ledger.columns.date} value={formatDate(transaction.date)} />
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.household.ledger.columns.category}</p>
                  {category ? <p className="mt-1 text-sm font-semibold text-foreground">{category}</p> : <Badge tone="warning">{t.household.ledger.uncategorized}</Badge>}
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Link href={`/household/ledger/${transaction.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary">
                    {t.household.ledger.detailsLink}
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HeaderCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted ${className}`}>{children}</th>;
}

function BodyCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle text-foreground ${className}`}>{children}</td>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
