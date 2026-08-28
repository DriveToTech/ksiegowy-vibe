import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Company, HouseholdSummary } from './api-types';
import { API_BASE } from './api-base';
import {
  ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME,
  normalizeKsefEnvironment,
  type KsefEnvironment,
} from './ksef-environment';
import { ACTIVE_HOUSEHOLD_COOKIE_NAME, ACTIVE_MODE_COOKIE_NAME, normalizeAppMode, type AppMode } from './mode';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthenticatedUser;
  companies: Array<{ id: string; role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' }>;
  households: HouseholdSummary[];
}

export interface AuthSession {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  companies: Company[];
  companyRoles: Record<string, 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'>;
  activeCompanyId: string | null;
  activeKsefEnvironment: KsefEnvironment;
  households: HouseholdSummary[];
  activeHouseholdId: string | null;
  activeMode: AppMode;
}

interface SessionRequestResult {
  response: Response;
  headers: Headers;
}

interface AuthSessionOptions {
  onExpired?: 'passive' | 'refresh-redirect';
  refreshNext?: string;
}

export async function getActiveKsefEnvironment(): Promise<KsefEnvironment> {
  const cookieStore = await cookies();
  return normalizeKsefEnvironment(cookieStore.get(ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME)?.value);
}

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  const authToken = cookieStore.get('auth_token')?.value;
  const refreshToken = cookieStore.get('refresh_token')?.value;

  const parts = [
    authToken ? `auth_token=${authToken}` : null,
    refreshToken ? `refresh_token=${refreshToken}` : null,
  ].filter((value): value is string => value !== null);

  return parts.length > 0 ? parts.join('; ') : null;
}

async function requestSession(path: string, cookieHeader: string | null): Promise<SessionRequestResult> {
  const headers = new Headers();

  if (cookieHeader) {
    headers.set('Cookie', cookieHeader);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
    redirect: 'manual',
  });

  return { response, headers };
}

function hasRefreshCookie(cookieStore: Awaited<ReturnType<typeof cookies>>): boolean {
  return cookieStore.has('refresh_token');
}

async function loadAuthSession({
  onExpired = 'passive',
  // '/' rather than a hardcoded protected route: the home page itself resolves
  // the mode-aware landing path via landingPathForSession() once a session
  // exists, so this fallback never needs to guess business vs. household.
  refreshNext = '/',
}: AuthSessionOptions = {}): Promise<AuthSession> {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);
  const activeKsefEnvironment = normalizeKsefEnvironment(cookieStore.get(ACTIVE_KSEF_ENVIRONMENT_COOKIE_NAME)?.value);
  const activeMode = normalizeAppMode(cookieStore.get(ACTIVE_MODE_COOKIE_NAME)?.value);

  if (!cookieHeader) {
    return {
      authenticated: false,
      user: null,
      companies: [],
      companyRoles: {},
      activeCompanyId: null,
      activeKsefEnvironment,
      households: [],
      activeHouseholdId: null,
      activeMode,
    };
  }

  const sessionResponse = await requestSession('/auth/me', cookieHeader);

  if (sessionResponse.response.status === 401) {
    if (onExpired === 'refresh-redirect' && hasRefreshCookie(cookieStore)) {
      redirect(`/api/session/refresh?next=${encodeURIComponent(refreshNext)}`);
    }

    return {
      authenticated: false,
      user: null,
      companies: [],
      companyRoles: {},
      activeCompanyId: null,
      activeKsefEnvironment,
      households: [],
      activeHouseholdId: null,
      activeMode,
    };
  }

  if (!sessionResponse.response.ok) {
    throw new Error(`Session lookup failed with status ${sessionResponse.response.status}`);
  }

  const session = (await sessionResponse.response.json()) as AuthSessionResponse;
  const companiesResponse = await fetch(`${API_BASE}/companies`, {
    method: 'GET',
    headers: sessionResponse.headers,
    cache: 'no-store',
  });

  if (!companiesResponse.ok) {
    throw new Error(`Companies lookup failed with status ${companiesResponse.status}`);
  }

  const companies = (await companiesResponse.json()) as Company[];
  const savedCompanyId = cookieStore.get('active_company')?.value;
  const activeCompanyId = companies.find((company) => company.id === savedCompanyId)?.id ?? companies[0]?.id ?? null;

  // households carry their own `name`, unlike the companies claim, so no second
  // round trip (mirroring getCompanies) is needed here — see Cross-Cutting.
  const households = session.households ?? [];
  const savedHouseholdId = cookieStore.get(ACTIVE_HOUSEHOLD_COOKIE_NAME)?.value;
  const activeHouseholdId = households.find((household) => household.id === savedHouseholdId)?.id ?? households[0]?.id ?? null;

  return {
    authenticated: true,
    user: session.user,
    companies,
    companyRoles: Object.fromEntries(session.companies.map((company) => [company.id, company.role])),
    activeCompanyId,
    activeKsefEnvironment,
    households,
    activeHouseholdId,
    activeMode,
  };
}

export const getAuthSession = cache(async (): Promise<AuthSession> => {
  return loadAuthSession();
});

export async function requireAuthSession(refreshNext = '/'): Promise<AuthSession> {
  const session = await loadAuthSession({ onExpired: 'refresh-redirect', refreshNext });

  if (!session.authenticated) {
    redirect(`/login?next=${encodeURIComponent(refreshNext)}`);
  }

  return session;
}

export function getActiveCompanyRole(session: AuthSession): 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' | null {
  if (!session.activeCompanyId) {
    return null;
  }

  return session.companyRoles[session.activeCompanyId] ?? null;
}

/**
 * Where an authenticated user should land after login/refresh. A household-only
 * user (no companies) has no reachable page under /dashboard — it redirects
 * back to /onboarding, which loops forever without this. Personal mode also
 * wins when the user's last explicit choice (the active_mode cookie) was
 * 'personal', even if they also have a company.
 */
export function landingPathForSession(session: AuthSession): string {
  if (session.activeMode === 'personal') {
    return '/household';
  }

  if (session.companies.length === 0 && session.households.length > 0) {
    return '/household';
  }

  return '/dashboard';
}
