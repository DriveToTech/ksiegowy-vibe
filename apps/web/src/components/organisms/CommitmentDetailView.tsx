'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Commitment, HouseholdAccount } from '../../lib/api-types';
import { updateCommitment } from '../../lib/api-client';
import type { CommitmentAmortizationScheduleEntry } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { t } from '../../lib/translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { ErrorState } from '../molecules/ErrorState';

interface CommitmentDetailViewProps {
  householdId: string;
  commitment: Commitment;
  account: HouseholdAccount | null;
  amortizationSchedule: CommitmentAmortizationScheduleEntry[] | null;
}

const statusTone = {
  ACTIVE: 'success',
  PAUSED: 'draft',
  CANCELLED: 'danger',
} as const;

/**
 * Years left is derived from the amortization schedule (computed server-side
 * from principal/rate/term, never stored): the month whose remainingBalance
 * is closest to the commitment's actual outstandingBalance tells us how many
 * payments remain, without fabricating a "months paid" figure the domain
 * model doesn't track.
 */
function deriveYearsLeft(schedule: CommitmentAmortizationScheduleEntry[], outstandingBalance: number, termMonths: number): number | null {
  if (schedule.length === 0) return null;
  let closest = schedule[0]!;
  let closestDiff = Math.abs(Number(closest.remainingBalance) - outstandingBalance);
  for (const entry of schedule) {
    const diff = Math.abs(Number(entry.remainingBalance) - outstandingBalance);
    if (diff < closestDiff) {
      closest = entry;
      closestDiff = diff;
    }
  }
  return Math.max(0, Math.round((termMonths - closest.month) / 12));
}

export function CommitmentDetailView({ householdId, commitment, account, amortizationSchedule }: CommitmentDetailViewProps) {
  const router = useRouter();
  const [status, setStatus] = useState(commitment.status);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changeStatus = async (nextStatus: typeof status) => {
    if (nextStatus === 'CANCELLED' && !window.confirm(t.household.commitmentDetail.endConfirm)) return;

    setError(null);
    setUpdating(true);
    const result = await updateCommitment(householdId, commitment.id, { status: nextStatus }).catch((updateError: Error) => updateError);
    setUpdating(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    setStatus(nextStatus);
    router.refresh();
  };

  const principal = commitment.principal ? Number(commitment.principal) : null;
  const outstanding = commitment.outstandingBalance ? Number(commitment.outstandingBalance) : principal;
  const ratePercent = commitment.interestRate ? Number(commitment.interestRate) * 100 : null;
  const paidOffPercent = principal && outstanding !== null && principal > 0 ? Math.round((1 - outstanding / principal) * 100) : null;
  const yearsLeft = amortizationSchedule && outstanding !== null && commitment.termMonths
    ? deriveYearsLeft(amortizationSchedule, outstanding, commitment.termMonths)
    : null;

  return (
    <div className="space-y-6">
      {error ? <ErrorState message={error} /> : null}

      <div className="flex flex-col gap-5 rounded-card border border-outline bg-surface-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{t.household.commitments.types[commitment.type]}</Badge>
              <Badge tone={statusTone[status]}>{t.household.commitments.statuses[status]}</Badge>
              <Badge tone={commitment.isAutomatic ? 'success' : 'warning'}>
                {commitment.isAutomatic ? t.household.commitmentDetail.automaticLabel : t.household.commitmentDetail.manualLabel}
              </Badge>
            </div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-foreground">{commitment.name}</h1>
            <p className="text-sm text-muted">
              {t.household.commitments.frequencies[commitment.billingFrequency]}
              {' · '}
              {t.household.commitments.columns.next}: {formatDate(commitment.nextDueDate)}
            </p>
          </div>
          <div className="space-y-1 text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.commitmentDetail.instalmentLabel}</p>
            <p className="text-[32px] font-semibold tracking-[-0.03em] tabular-nums text-foreground">{formatMoney(commitment.amount)}</p>
            {account ? <p className="text-sm text-muted">{formatDate(commitment.nextDueDate)}, {t.household.commitmentDetail.nextPaymentFrom(account.name)}</p> : null}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-outline pt-5">
          {status === 'ACTIVE' ? (
            <Button variant="secondary" onClick={() => changeStatus('PAUSED')} disabled={updating}>{t.household.commitmentDetail.pauseAction}</Button>
          ) : status === 'PAUSED' ? (
            <Button variant="secondary" onClick={() => changeStatus('ACTIVE')} disabled={updating}>{t.household.commitmentDetail.resumeAction}</Button>
          ) : null}
          {status !== 'CANCELLED' ? (
            <Button variant="danger" onClick={() => changeStatus('CANCELLED')} disabled={updating}>{t.household.commitmentDetail.endAction}</Button>
          ) : null}
        </div>
      </div>

      {commitment.type === 'LOAN' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {outstanding !== null ? (
            <StatCard label={t.household.commitmentDetail.outstandingLabel} value={formatMoney(outstanding)} context={principal !== null ? t.household.commitmentDetail.ofBorrowed(formatMoney(principal)) : undefined} />
          ) : null}
          {ratePercent !== null ? (
            <StatCard label={t.household.commitmentDetail.rateLabel} value={`${ratePercent.toFixed(2)}%`} />
          ) : null}
          {paidOffPercent !== null ? (
            <StatCard
              label={t.household.commitmentDetail.paidOffLabel}
              value={`${paidOffPercent}%`}
              context={yearsLeft !== null ? t.household.commitmentDetail.yearsLeft(yearsLeft) : undefined}
            />
          ) : null}
        </div>
      ) : null}

      {commitment.type === 'INSURANCE' ? (
        <div className="rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.commitmentForm.sections.policy}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {commitment.provider ? <DetailRow label={t.household.commitmentForm.fields.provider} value={commitment.provider} /> : null}
            {commitment.policyNumber ? <DetailRow label={t.household.commitmentForm.fields.policyNumber} value={commitment.policyNumber} /> : null}
            {commitment.insuredObject ? <DetailRow label={t.household.commitmentForm.fields.insuredObject} value={commitment.insuredObject} /> : null}
            {commitment.sumInsured ? <DetailRow label={t.household.commitmentForm.fields.sumInsured} value={formatMoney(commitment.sumInsured)} /> : null}
          </div>
          {commitment.coverBreakdown && commitment.coverBreakdown.length > 0 ? (
            <div className="mt-4 border-t border-outline pt-4">
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.commitmentDetail.coverTitle}</h3>
              <div className="grid gap-2">
                {commitment.coverBreakdown.map((entry) => (
                  <DetailRow key={entry.label} label={entry.label} value={formatMoney(entry.amount)} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {commitment.type === 'LOAN' && !amortizationSchedule ? (
        <div className="rounded-card border border-outline bg-surface-panel p-5">
          <p className="text-sm text-muted">{t.household.commitmentDetail.amortizationUnavailable}</p>
        </div>
      ) : null}

      {account ? (
        <div className="rounded-card border border-outline bg-surface-panel p-5">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{t.household.commitmentDetail.paidFromTitle}</h2>
          <DetailRow label={t.household.commitmentForm.fields.account} value={account.name} />
          {account.accountNumberMask ? <DetailRow label={t.household.accountPicker.selectAccount} value={account.accountNumberMask} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, context }: { label: string; value: string; context?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-card border border-outline bg-surface-panel p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="text-[22px] font-semibold tracking-[-0.02em] tabular-nums text-foreground">{value}</p>
      {context ? <p className="text-[12px] text-muted">{context}</p> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
