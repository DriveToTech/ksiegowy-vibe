import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Company } from './api-types';
import { API_BASE } from './api-base';

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
}

export interface AuthSession {
  authenticated: boolean;
  user: AuthenticatedUser | null;
  companies: Company[];
  companyRoles: Record<string, 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'>;
  activeCompanyId: string | null;
}

interface SessionRequestResult {
  response: Response;
  headers: Headers;
}

interface AuthSessionOptions {
  onExpired?: 'passive' | 'refresh-redirect';
  refreshNext?: string;
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
  refreshNext = '/dashboard',
}: AuthSessionOptions = {}): Promise<AuthSession> {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  if (!cookieHeader) {
    return {
      authenticated: false,
      user: null,
      companies: [],
      companyRoles: {},
      activeCompanyId: null,
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

  return {
    authenticated: true,
    user: session.user,
    companies,
    companyRoles: Object.fromEntries(session.companies.map((company) => [company.id, company.role])),
    activeCompanyId,
  };
}

export const getAuthSession = cache(async (): Promise<AuthSession> => {
  return loadAuthSession();
});

export async function requireAuthSession(refreshNext = '/dashboard'): Promise<AuthSession> {
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
