import Link from 'next/link';
import type { Commitment } from '../../lib/api-types';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';

interface CommitmentsListProps {
  commitments: Commitment[];
}

const statusTone: Record<Commitment['status'], 'success' | 'draft' | 'danger'> = {
  ACTIVE: 'success',
  PAUSED: 'draft',
  CANCELLED: 'danger',
};

export function CommitmentsList({ commitments }: CommitmentsListProps) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-card border border-outline bg-surface-panel lg:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="bg-surface-muted text-left">
                <HeaderCell>{t.household.commitments.columns.commitment}</HeaderCell>
                <HeaderCell>{t.household.commitments.columns.type}</HeaderCell>
                <HeaderCell>{t.household.commitments.columns.cycle}</HeaderCell>
                <HeaderCell className="text-right">{t.household.commitments.columns.amount}</HeaderCell>
                <HeaderCell className="text-right">{t.household.commitments.columns.next}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {commitments.map((commitment) => (
                <tr key={commitment.id} className="border-t border-outline transition hover:bg-surface-row-hover">
                  <BodyCell>
                    <Link
                      href={`/household/commitments/${commitment.id}`}
                      className="inline-flex min-h-11 items-center font-medium text-foreground transition hover:text-primary"
                    >
                      {commitment.name}
                    </Link>
                  </BodyCell>
                  <BodyCell className="text-foreground-secondary">{t.household.commitments.types[commitment.type]}</BodyCell>
                  <BodyCell className="text-muted">{t.household.commitments.frequencies[commitment.billingFrequency]}</BodyCell>
                  <BodyCell className="text-right tabular-nums font-medium">{formatMoney(commitment.amount)}</BodyCell>
                  <BodyCell className="text-right text-muted">{formatDate(commitment.nextDueDate)}</BodyCell>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-4 lg:hidden">
        {commitments.map((commitment) => (
          <div key={commitment.id} className="space-y-4 rounded-card border border-outline bg-surface-panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Link href={`/household/commitments/${commitment.id}`} className="font-medium text-foreground">
                  {commitment.name}
                </Link>
                <p className="mt-1 text-sm text-muted">{t.household.commitments.types[commitment.type]}</p>
              </div>
              <Badge tone={statusTone[commitment.status]}>{t.household.commitments.statuses[commitment.status]}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label={t.household.commitments.columns.amount} value={formatMoney(commitment.amount)} align="right" />
              <DetailItem label={t.household.commitments.columns.next} value={formatDate(commitment.nextDueDate)} />
              <div className="sm:col-span-2 flex items-center justify-between gap-3">
                <span className="text-sm text-muted">{t.household.commitments.frequencies[commitment.billingFrequency]}</span>
                <Link href={`/household/commitments/${commitment.id}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary-strong transition hover:text-primary">
                  {t.household.commitments.detailsLink}
                </Link>
              </div>
            </div>
          </div>
        ))}
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

function DetailItem({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
