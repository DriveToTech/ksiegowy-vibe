export const ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME = 'active_ksef_environment';
export const KSEF_ENVIRONMENT_HEADER_NAME = 'x-ksef-environment';
export const KSEF_ENVIRONMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type KsefEnvironment = 'TEST' | 'PRODUCTION';

export function normalizeKsefEnvironment(value: string | null | undefined): KsefEnvironment {
  return value === 'PRODUCTION' ? 'PRODUCTION' : 'TEST';
}

export function getActiveKsefEnvironmentFromBrowser(): KsefEnvironment {
  if (typeof document === 'undefined') {
    return 'TEST';
  }

  const cookiePrefix = `${ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME}=`;
  const rawValue = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(cookiePrefix))
    ?.slice(cookiePrefix.length);
  const environment = normalizeKsefEnvironment(rawValue);

  if (!rawValue) {
    document.cookie = `${ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME}=${environment}; path=/; max-age=${KSEF_ENVIRONMENT_COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  return environment;
}
