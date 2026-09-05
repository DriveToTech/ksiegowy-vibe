import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '../components/atoms/Button';
import { PublicPageLayout } from '../components/templates/PublicPageLayout';
import { getAuthSession } from '../lib/auth';
import { t } from '../lib/translations';

export default async function HomePage() {
  const session = await getAuthSession().catch(() => null);

  if (session?.authenticated) {
    redirect('/dashboard');
  }

  return (
    <PublicPageLayout className="items-center justify-center">
      <div className="mx-auto max-w-3xl space-y-8 text-center">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted">{t.home.tagline}</p>
          <h1 className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            {t.home.headline}
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted">
            {t.home.description}
          </p>
        </div>

        <div className="flex justify-center">
          <Link href="/login">
            <Button size="lg">{t.home.loginButton}</Button>
          </Link>
        </div>
      </div>
    </PublicPageLayout>
  );
}
