import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACTIVE_MODE_COOKIE_NAME, MODE_COOKIE_MAX_AGE } from './lib/mode';

/**
 * Keeps the active_mode cookie truthful to where the user actually is.
 * Without this, a household page reached without the cookie ever having
 * been set (a bookmark, a shared link, a fresh session after logout, a
 * direct hit on /household after login) falls back to normalizeAppMode's
 * 'business' default and the root layout renders it in the purple business
 * theme instead of green — even though the page itself is fully personal.
 * ModeSwitch still writes the cookie for cross-navigation persistence; this
 * only corrects it when the path and the cookie disagree.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isHouseholdRoute = pathname === '/household' || pathname.startsWith('/household/');
  const isBusinessRoute = pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  if (!isHouseholdRoute && !isBusinessRoute) return NextResponse.next();

  const desiredMode = isHouseholdRoute ? 'personal' : 'business';
  if (request.cookies.get(ACTIVE_MODE_COOKIE_NAME)?.value === desiredMode) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(ACTIVE_MODE_COOKIE_NAME, desiredMode, {
    path: '/',
    maxAge: MODE_COOKIE_MAX_AGE,
    sameSite: 'lax',
  });
  return response;
}

export const config = {
  matcher: ['/household/:path*', '/dashboard/:path*'],
};
