export const ACTIVE_MODE_COOKIE_NAME = 'active_mode';
export const ACTIVE_HOUSEHOLD_COOKIE_NAME = 'active_household';
export const MODE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type AppMode = 'business' | 'personal';

export function normalizeAppMode(value: string | null | undefined): AppMode {
  return value === 'personal' ? 'personal' : 'business';
}
