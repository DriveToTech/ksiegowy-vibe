import type { HouseholdGoal, HouseholdGoalAutomationRule } from './api-types';

export type HouseholdGoalForecastState = 'AVAILABLE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED' | 'FUTURE_FIXED_RULE' | 'UNAVAILABLE';

export interface HouseholdGoalForecast {
  state: HouseholdGoalForecastState;
  forecastDate: string | null;
}

export function getHouseholdGoalForecast(
  goal: Pick<HouseholdGoal, 'status'> & { activeRules: Array<Pick<HouseholdGoalAutomationRule, 'ruleType' | 'startsOn'>> },
  forecastDate: string | null,
  asOfDate: string,
): HouseholdGoalForecast {
  if (goal.status === 'ARCHIVED') return { state: 'ARCHIVED', forecastDate: null };
  if (goal.status === 'COMPLETED') return { state: 'COMPLETED', forecastDate: null };
  if (goal.status === 'PAUSED') return { state: 'PAUSED', forecastDate: null };

  const hasFutureFixedRule = goal.activeRules.some(
    (rule) => rule.ruleType === 'FIXED_ON_DAY' && rule.startsOn > asOfDate,
  );
  if (hasFutureFixedRule) return { state: 'FUTURE_FIXED_RULE', forecastDate: null };
  if (!forecastDate) return { state: 'UNAVAILABLE', forecastDate: null };

  return { state: 'AVAILABLE', forecastDate };
}
