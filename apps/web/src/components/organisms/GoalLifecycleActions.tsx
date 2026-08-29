'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { HouseholdGoalStatus } from '../../lib/api-types';
import { updateHouseholdGoal } from '../../lib/api-client';
import { t } from '../../lib/translations';
import { Button } from '../atoms/Button';
import { ErrorState } from '../molecules/ErrorState';

interface GoalLifecycleActionsProps {
  householdId: string;
  goalId: string;
  status: HouseholdGoalStatus;
  currentAmount: string;
}

export function GoalLifecycleActions({ householdId, goalId, status, currentAmount }: GoalLifecycleActionsProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canArchive = Number(currentAmount) === 0;

  const changeStatus = async (nextStatus: HouseholdGoalStatus) => {
    if (nextStatus === 'ARCHIVED' && (!canArchive || !window.confirm(t.household.goals.archiveConfirm))) return;

    setError(null);
    setSubmitting(true);
    const result = await updateHouseholdGoal(householdId, goalId, { status: nextStatus }).catch((submitError: Error) => submitError);
    setSubmitting(false);

    if (result instanceof Error) {
      setError(result.message);
      return;
    }

    router.refresh();
  };

  if (status === 'ARCHIVED') return null;

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-3 sm:items-end">
      {error ? <ErrorState message={error} /> : null}
      <div className="flex flex-wrap gap-2 sm:justify-end">
        {status === 'ACTIVE' ? (
          <Button variant="secondary" disabled={submitting} onClick={() => changeStatus('PAUSED')} aria-label={t.household.goals.pauseAction}>
            {submitting ? t.household.goals.lifecycleSaving : t.household.goals.pauseAction}
          </Button>
        ) : status === 'PAUSED' ? (
          <Button variant="secondary" disabled={submitting} onClick={() => changeStatus('ACTIVE')} aria-label={t.household.goals.resumeAction}>
            {submitting ? t.household.goals.lifecycleSaving : t.household.goals.resumeAction}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={submitting || !canArchive}
          onClick={() => changeStatus('ARCHIVED')}
          aria-label={t.household.goals.archiveAction}
          title={!canArchive ? t.household.goals.archiveDisabledHint : undefined}
        >
          {t.household.goals.archiveAction}
        </Button>
      </div>
      {!canArchive ? <p className="max-w-xs text-right text-xs text-muted">{t.household.goals.archiveDisabledHint}</p> : null}
      <Link href={`/household/goals/${goalId}/edit`} className="text-right text-sm font-semibold text-primary-strong hover:text-primary">
        {t.household.goals.editAction}
      </Link>
    </div>
  );
}
