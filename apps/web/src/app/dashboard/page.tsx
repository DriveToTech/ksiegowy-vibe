import Link from 'next/link';
import { getInvoices } from '../../lib/api';
import { Button } from '../../components/atoms/Button';
import { Surface } from '../../components/atoms/Surface';
import { EmptyState } from '../../components/molecules/EmptyState';
import { MetricCard } from '../../components/molecules/MetricCard';
import { PageHeader } from '../../components/molecules/PageHeader';
import { InvoicesTable } from '../../components/organisms/InvoicesTable';
import { t } from '../../lib/translations';
import { formatDate, formatMoney } from '../../lib/format';
import { requireAuthSession } from '../../lib/auth';

export default async function DashboardPage() {
  const session = await requireAuthSession('/dashboard');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t.dashboard.pageEyebrow}
          title={t.dashboard.pageTitle}
          description={t.dashboard.pageDescription}
        />
        <EmptyState
          title={t.dashboard.noCompanyTitle}
          description={t.dashboard.noCompanyDescription}
          action={
            <Link href="/dashboard/settings">
              <Button>{t.dashboard.goToSettings}</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { data: invoices } = await getInvoices(companyId).catch((error: unknown) => {
    throw error instanceof Error ? error : new Error('Błąd pobierania faktur');
  });

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const invoicesThisMonth = invoices.filter((inv) => {
    const d = new Date(inv.issueDate);
    return (
      d.getUTCFullYear() === currentYear &&
      d.getUTCMonth() === currentMonth
    );
  });

  const pendingKsef = invoices.filter(
    (inv) => inv.status === 'ISSUED' && inv.ksefStatus !== 'accepted',
  );

  const recent = invoices.slice(0, 5);
  const totalGross = invoices.reduce(
    (sum, invoice) => sum + (parseFloat(invoice.totalGross) || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.dashboard.pageEyebrow}
        title={t.dashboard.pageTitle}
        description={t.dashboard.pageDescription}
        actions={
          <>
            <Link href="/dashboard/incoming">
              <Button variant="secondary">{t.dashboard.goToIncoming}</Button>
            </Link>
            <Link href="/dashboard/invoices/new">
              <Button>{t.dashboard.createInvoice}</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,1fr)]">
        <MetricCard label={t.dashboard.metrics.invoicesThisMonthLabel} value={String(invoicesThisMonth.length)} hint={t.dashboard.metrics.invoicesThisMonthHint} />
        <MetricCard label={t.dashboard.metrics.pendingKsefLabel} value={String(pendingKsef.length)} hint={t.dashboard.metrics.pendingKsefHint} accent={pendingKsef.length > 0 ? 'warning' : 'default'} />
        <MetricCard label={t.dashboard.metrics.totalGrossLabel} value={formatMoney(totalGross)} hint={t.dashboard.metrics.totalGrossHint} accent="primary" />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t.dashboard.recentInvoices}</h2>
          {invoices.length > 5 ? (
            <Link href="/dashboard/invoices" className="text-sm font-semibold text-primary-strong transition hover:text-primary">
              {t.dashboard.seeAll}
            </Link>
          ) : null}
        </div>

        {recent[0] ? (
          <Surface tone="glass" shape="organic" className="p-5">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{t.dashboard.lastActivityLabel}</p>
            <p className="mt-2 text-sm text-foreground">
              {t.dashboard.lastActivityDescription(recent[0].invoiceNumber ?? 'bez numeru', formatDate(recent[0].issueDate))
                .split(recent[0].invoiceNumber ?? 'bez numeru')
                .map((part, index, parts) => (
                  <span key={`${part}-${index}`}>
                    {part}
                    {index < parts.length - 1 ? <span className="font-semibold">{recent[0].invoiceNumber ?? 'bez numeru'}</span> : null}
                  </span>
                ))}
            </p>
          </Surface>
        ) : null}

        {recent.length === 0 ? (
          <EmptyState
            title={t.dashboard.emptyInvoicesTitle}
            description={t.dashboard.emptyInvoicesDescription}
            action={
              <Link href="/dashboard/contractors">
                <Button variant="secondary">{t.dashboard.addContractor}</Button>
              </Link>
            }
          />
        ) : (
          <InvoicesTable invoices={recent} compact />
        )}
      </div>
    </div>
  );
}
