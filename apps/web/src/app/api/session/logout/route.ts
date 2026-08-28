import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { API_BASE } from '../../../../lib/api-base';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const authToken = request.cookies.get('auth_token')?.value;
  const refreshToken = request.cookies.get('refresh_token')?.value;
  const cookieHeader = [
    authToken ? `auth_token=${authToken}` : null,
    refreshToken ? `refresh_token=${refreshToken}` : null,
  ].filter((value): value is string => value !== null).join('; ');

  await fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: 'no-store',
  }).catch(() => undefined);

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete('auth_token');
  response.cookies.delete('refresh_token');
  response.cookies.delete('active_company');
  response.cookies.delete('active_mode');
  response.cookies.delete('active_household');
  return response;
}
