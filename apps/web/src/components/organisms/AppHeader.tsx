import Link from 'next/link';
import type { AuthenticatedUser } from '../../lib/auth';
import { t } from '../../lib/translations';
import { BrandImage } from '../brand/BrandImage';
import { SessionActions } from './SessionActions';

export function AppHeader({ user }: { user: AuthenticatedUser | null }) {
  return (
    <header className="sticky top-0 z-40 bg-background px-4 pt-4 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[2rem_1.5rem_2.25rem_1.25rem] border border-outline bg-surface-panel/55 px-5 py-4 backdrop-blur-[28px]">
        <div className="space-y-1 lg:pl-4">
          <Link href="/" className="inline-flex">
            <BrandImage alt="Księgowy Vibe logo" className="w-[156px] sm:w-[172px]" priority />
          </Link>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">{t.header.subtitle}</p>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          {user ? (
            <>
              <div className="hidden min-w-0 text-right sm:block">
                <p className="truncate text-sm font-semibold text-foreground">{user.name ?? user.email}</p>
                <p className="truncate text-xs text-muted">{user.email}</p>
              </div>
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.name ?? user.email}
                  className="h-10 w-10 rounded-full border border-outline/20 object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-outline/20 bg-surface-raised/75 text-sm font-semibold text-foreground">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </div>
              )}
              <SessionActions />
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
