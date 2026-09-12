import { redirect } from 'next/navigation';
import { Button } from '../../components/atoms/Button';
import { BrandImage } from '../../components/brand/BrandImage';
import { getAuthSession } from '../../lib/auth';
import { t } from '../../lib/translations';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const featureBullets = [
  { dot: 'bg-success-ink', text: t.login.featureBulletFa3 },
  { dot: 'bg-warning-ink', text: t.login.featureBulletOffline24 },
  { dot: 'bg-primary', text: t.login.featureBulletOcr },
];

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
    <main className="flex min-h-full w-full items-center justify-center p-4 sm:p-6 lg:p-10">
      <div className="grid w-full max-w-[1200px] overflow-hidden rounded-frame border border-outline shadow-frame lg:grid-cols-[1.15fr_1fr]">
        <div className="flex flex-col justify-between gap-10 bg-canvas p-8 sm:p-12">
          <BrandImage variant="lockup" className="w-[172px]" priority />

          <div className="flex max-w-lg flex-col gap-6">
            <h1 className="text-3xl font-semibold leading-[1.1] tracking-[-0.025em] text-foreground sm:text-4xl lg:text-[46px] lg:leading-[1.06] lg:tracking-[-0.035em]">
              {t.login.headline}
            </h1>
            <p className="text-base leading-relaxed text-foreground-secondary">
              {t.login.description}
            </p>
            <ul className="flex flex-col gap-2.5 pt-1">
              {featureBullets.map((bullet) => (
                <li key={bullet.text} className="flex items-center gap-3 text-sm text-foreground-secondary">
                  <span aria-hidden="true" className={`h-[7px] w-[7px] shrink-0 rounded-[2px] ${bullet.dot}`} />
                  {bullet.text}
                </li>
              ))}
            </ul>
          </div>

          <p className="font-mono text-[11px] tracking-[0.14em] text-muted">{t.login.openSourceTag}</p>
        </div>

        <div className="flex flex-col justify-center gap-6 border-t border-outline bg-chrome p-8 sm:p-12 lg:border-l lg:border-t-0">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-foreground">{t.login.formTitle}</h2>
            <p className="text-sm text-muted">{t.login.formSubtitle}</p>
          </div>

          <Button href={`${apiUrl}/auth/google`} size="lg" className="w-full">{t.login.googleButton}</Button>

          <div className="rounded-inset border-l-[3px] border-primary bg-surface-raised px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground-secondary">
            {t.login.ksefNote}
          </div>
        </div>
      </div>
    </main>
  );
}
