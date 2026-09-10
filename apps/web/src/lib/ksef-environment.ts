export const KSEF_ENVIRONMENT_HEADER_NAME = 'x-ksef-environment';
export const KSEF_ENVIRONMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type KsefEnvironment = 'TEST' | 'PRODUCTION';

export function getActiveKsefEnvironmentCookieName(companyId: string): string {
  return `active_ksef_environment_${companyId}`;
}

export function isKsefEnvironment(value: string | null | undefined): value is KsefEnvironment {
  return value === 'TEST' || value === 'PRODUCTION';
}

function readCookieValue(cookieName: string): string | null {
  try {
    const cookiePrefix = `${cookieName}=`;

    return document.cookie
      .split(';')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(cookiePrefix))
      ?.slice(cookiePrefix.length) ?? null;
  } catch {
    return null;
  }
}

function writeEnvironmentCookie(companyId: string, environment: KsefEnvironment): boolean {
  try {
    const cookieName = getActiveKsefEnvironmentCookieName(companyId);
    document.cookie = `${cookieName}=${environment}; path=/; max-age=${KSEF_ENVIRONMENT_COOKIE_MAX_AGE}; SameSite=Lax`;
    return readCookieValue(cookieName) === environment;
  } catch {
    return false;
  }
}

export function setActiveKsefEnvironmentFromBrowser(companyId: string, environment: KsefEnvironment): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  return writeEnvironmentCookie(companyId, environment);
}
