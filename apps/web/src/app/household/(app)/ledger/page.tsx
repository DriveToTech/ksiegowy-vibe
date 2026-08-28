import Link from 'next/link';
import { getHouseholdAccounts, getHouseholdCategories, getHouseholdTransactions } from '../../../../lib/api';
import { requireAuthSession } from '../../../../lib/auth';
import { formatMoney } from '../../../../lib/format';
import { t } from '../../../../lib/translations';
import { Button } from '../../../../components/atoms/Button';
import { EmptyState } from '../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { LedgerFilterBar } from '../../../../components/organisms/LedgerFilterBar';
import { TransactionsTable } from '../../../../components/organisms/TransactionsTable';

const PAGE_SIZE = 20;

export default async function HouseholdLedgerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requireAuthSession('/household/ledger');
  const householdId = session.activeHouseholdId as string;
  const query = await searchParams;

  const page = Math.max(1, Number(query.page) || 1);
  const filterParams: Record<string, string> = { page: String(page), limit: String(PAGE_SIZE) };
  if (query.accountId) filterParams.accountId = query.accountId;
  if (query.categoryId) filterParams.categoryId = query.categoryId;
  if (query.dateFrom) filterParams.dateFrom = query.dateFrom;
  if (query.dateTo) filterParams.dateTo = query.dateTo;

  const [transactionsResult, categories, accounts] = await Promise.all([
    getHouseholdTransactions(householdId, filterParams).catch(() => ({ data: [], total: 0, page: 1, limit: PAGE_SIZE, moneyIn: '0.00', moneyOut: '0.00' })),
    getHouseholdCategories(householdId).catch(() => []),
    getHouseholdAccounts(householdId).catch(() => []),
  ]);

  const hasFilters = Boolean(query.accountId || query.categoryId || query.dateFrom || query.dateTo);
  const totalPages = Math.max(1, Math.ceil(transactionsResult.total / transactionsResult.limit));
  const fromIndex = transactionsResult.total === 0 ? 0 : (transactionsResult.page - 1) * transactionsResult.limit + 1;
  const toIndex = Math.min(transactionsResult.total, transactionsResult.page * transactionsResult.limit);

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1])));
    params.set('page', String(targetPage));
    return `/household/ledger?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.household.ledger.pageEyebrow}
        title={t.household.ledger.pageTitle}
        actions={
          <>
            <Link href="/household/ledger/import">
              <Button variant="secondary">{t.household.ledger.importStatement}</Button>
            </Link>
            <Link href="/household/ledger/new">
              <Button>{t.household.ledger.addPayment}</Button>
            </Link>
          </>
        }
      />

      <LedgerFilterBar accounts={accounts} categories={categories} />

      {transactionsResult.data.length === 0 ? (
        <EmptyState
          title={t.household.ledger.emptyTitle}
          description={t.household.ledger.emptyDescription}
          action={
            hasFilters ? undefined : (
              <Link href="/household/ledger/new">
                <Button>{t.household.ledger.addPayment}</Button>
              </Link>
            )
          }
        />
      ) : (
        <>
          <TransactionsTable transactions={transactionsResult.data} categories={categories} accounts={accounts} />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-outline bg-surface-panel px-4 py-3">
            <p className="font-mono text-[11px] text-muted">
              {t.household.ledger.pagination.summary(fromIndex, toIndex, transactionsResult.total, formatMoney(transactionsResult.moneyIn), formatMoney(transactionsResult.moneyOut))}
            </p>
            <div className="flex items-center gap-2">
              {page <= 1 ? (
                <Button variant="secondary" size="sm" disabled>{t.household.ledger.pagination.previous}</Button>
              ) : (
                <Button variant="secondary" size="sm" href={pageHref(page - 1)}>{t.household.ledger.pagination.previous}</Button>
              )}
              <span className="font-mono text-[11px] text-muted">{t.household.ledger.pagination.pageOf(page, totalPages)}</span>
              {page >= totalPages ? (
                <Button variant="secondary" size="sm" disabled>{t.household.ledger.pagination.next}</Button>
              ) : (
                <Button variant="secondary" size="sm" href={pageHref(page + 1)}>{t.household.ledger.pagination.next}</Button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
