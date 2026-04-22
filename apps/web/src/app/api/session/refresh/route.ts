import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_BASE } from '../../../../lib/api-base';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authToken = request.cookies.get('auth_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard';

  // Use APP_URL as the redirect origin to avoid the localhost/127.0.0.1 mismatch.
  // When a browser resolves localhost to 127.0.0.1, request.url reflects that IP,
  // and redirecting to it breaks cookie delivery (cookies are bound to the hostname).
  const appOrigin = process.env.APP_URL ?? request.nextUrl.origin;

  const cookieHeader = [
    authToken ? `auth_token=${authToken}` : null,
    refreshToken ? `refresh_token=${refreshToken}` : null,
  ].filter((value): value is string => value !== null).join('; ');

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    const loginUrl = new URL('/login', appOrigin);
    loginUrl.searchParams.set('next', next);
    const redirectResponse = NextResponse.redirect(loginUrl);
    redirectResponse.cookies.delete('auth_token');
    redirectResponse.cookies.delete('refresh_token');
    redirectResponse.cookies.delete('active_company');
    return redirectResponse;
  }

  const redirectResponse = NextResponse.redirect(new URL(next, appOrigin));
  const setCookieHeader = response.headers.getSetCookie();

  for (const cookie of setCookieHeader) {
    redirectResponse.headers.append('set-cookie', cookie);
  }

  return redirectResponse;
}
