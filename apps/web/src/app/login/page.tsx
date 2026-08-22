import { redirect } from 'next/navigation';
import { Button } from '../../components/atoms/Button';
import { Surface } from '../../components/atoms/Surface';
import { PublicPageLayout } from '../../components/templates/PublicPageLayout';
import { getAuthSession } from '../../lib/auth';
import { t } from '../../lib/translations';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

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
      <Surface tone="panel" className="mx-auto w-full max-w-md p-8 sm:p-10">
        <div className="space-y-6">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{t.login.tagline}</p>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">{t.login.headline}</h1>
            <p className="text-sm text-muted">{t.login.description}</p>
          </div>
          <a href={`${apiUrl}/auth/google`} className="block">
            <Button size="lg" className="w-full">{t.login.googleButton}</Button>
          </a>
        </div>
      </Surface>
    </PublicPageLayout>
  );
}
