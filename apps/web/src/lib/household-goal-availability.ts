import type { HouseholdGoal } from './api-types';

export interface HouseholdGoalActionAvailability {
  canAdd: boolean;
  canWithdraw: boolean;
  canManageRules: boolean;
}

export function getHouseholdGoalActionAvailability(
  goal: Pick<HouseholdGoal, 'status' | 'currentAmount'>,
): HouseholdGoalActionAvailability {
  const hasBalance = Number.isFinite(Number(goal.currentAmount)) && Number(goal.currentAmount) > 0;

  if (goal.status === 'ARCHIVED') {
    return { canAdd: false, canWithdraw: false, canManageRules: false };
  }

  if (goal.status === 'COMPLETED') {
    return { canAdd: false, canWithdraw: hasBalance, canManageRules: false };
  }

  return { canAdd: true, canWithdraw: hasBalance, canManageRules: true };
}
