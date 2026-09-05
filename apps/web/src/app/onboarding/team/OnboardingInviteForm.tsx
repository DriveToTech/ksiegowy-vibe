'use client';

import { useState } from 'react';
import { createInvite } from '../../../lib/api-client';
import { Button } from '../../../components/atoms/Button';
import { Input } from '../../../components/atoms/Input';
import { Surface } from '../../../components/atoms/Surface';
import { Banner } from '../../../components/molecules/Banner';
import { FormField } from '../../../components/molecules/FormField';
import { t } from '../../../lib/translations';

export function OnboardingInviteForm({ companyId }: { companyId: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ link: string; expiresAt: string } | null>(null);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);

    createInvite(companyId, { email, role: 'ACCOUNTANT' })
      .then((created) => {
        setInvite({ link: `${window.location.origin}/invite/${created.token}`, expiresAt: created.expiresAt.slice(0, 10) });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t.onboarding.team.error))
      .finally(() => setBusy(false));
  };

  return (
    <Surface tone="panel" className="space-y-5 p-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{t.onboarding.team.title}</h2>
        <p className="mt-1 text-sm text-muted">{t.onboarding.team.description}</p>
      </div>

      {error ? <Banner tone="error">{error}</Banner> : null}

      {invite ? (
        <Banner tone="success">
          <p>{t.onboarding.team.linkReady(invite.expiresAt)}</p>
          <p className="mt-2 break-all font-mono text-xs">{invite.link}</p>
        </Banner>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <FormField label={t.onboarding.team.emailLabel} htmlFor="onboarding-invite-email" className="min-w-[240px] flex-1">
            <Input
              id="onboarding-invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder={t.onboarding.team.emailPlaceholder}
            />
          </FormField>
          <Button type="submit" disabled={busy}>
            {busy ? t.onboarding.team.sending : t.onboarding.team.sendInvite}
          </Button>
        </form>
      )}

      <div className="flex flex-wrap gap-3 border-t border-outline pt-5">
        <Button href="/dashboard" variant="secondary">
          {t.onboarding.team.finish}
        </Button>
      </div>
    </Surface>
  );
}
