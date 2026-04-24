import { redirect } from 'next/navigation';
import { Surface } from '../../components/atoms/Surface';
import { DesktopGoogleLoginButton } from '../../components/auth/DesktopGoogleLoginButton';
import { PublicPageLayout } from '../../components/templates/PublicPageLayout';
import { BROWSER_AUTH_BASE } from '../../lib/api-base';
import { getAuthSession } from '../../lib/auth';
import { t } from '../../lib/translations';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, params] = await Promise.all([
    getAuthSession().catch(() => null),
    searchParams,
  ]);

  if (session?.authenticated) {
    redirect(params.next && params.next.startsWith('/') ? params.next : '/dashboard');
  }

  return (
    <PublicPageLayout className="items-center justify-center">
      <Surface tone="glass" shape="organic" className="mx-auto w-full max-w-md p-8 sm:p-10">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{t.login.tagline}</p>
          <div className="space-y-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{t.login.headline}</h1>
            <p className="text-sm text-muted">{t.login.description}</p>
          </div>
          <DesktopGoogleLoginButton
            browserAuthUrl={`${BROWSER_AUTH_BASE}/auth/google`}
            label={t.login.googleButton}
          />
        </div>
      </Surface>
    </PublicPageLayout>
  );
}
