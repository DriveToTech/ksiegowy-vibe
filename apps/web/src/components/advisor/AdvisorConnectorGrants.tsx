'use client';

import { useEffect, useRef, useState } from 'react';
import { advisorErrorMessage, revokeAdvisorConnector, type AdvisorConnectorClient, type AdvisorConnectorGrant, type AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { NativeDialog } from '../atoms/NativeDialog';
import { InvoiceEnvironmentChip } from '../molecules/StatusChip';

const statusTone = { WAITING: 'warning', ACTIVE: 'success', EXPIRED: 'draft', REVOKED: 'draft' } as const;
const expiresSoonMilliseconds = 3 * 24 * 60 * 60 * 1000;

// Step 4: one responsive list. Status comes from the server; only "expires soon" is computed here. Re-granting pre-fills step 2 and never grants.
export function AdvisorConnectorGrants({ companyId, grants, canRegrant, onRegrant, onChanged }: {
  companyId: string; grants: AdvisorConnectorGrant[]; canRegrant: boolean;
  onRegrant: (client: AdvisorConnectorClient, environment: AdvisorEnvironment) => void; onChanged: () => Promise<void>;
}) {
  const [now] = useState(() => Date.now());
  const [revokeTarget, setRevokeTarget] = useState<AdvisorConnectorGrant | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState('');
  const focusReadinessAfterRender = useRef(false);

  // Runs when the dialog closes, after its own focus restore, so the readiness summary wins once the revoked row has replaced the trigger.
  useEffect(() => {
    if (revokeTarget !== null || !focusReadinessAfterRender.current) return;
    focusReadinessAfterRender.current = false;
    window.requestAnimationFrame(() => document.getElementById('advisor-readiness-title')?.focus());
  }, [revokeTarget]);

  function revoke(grant: AdvisorConnectorGrant) {
    setRevoking(true); setError('');
    void revokeAdvisorConnector(companyId, grant.client, grant.environment)
      .then(onChanged)
      .then(() => {
        focusReadinessAfterRender.current = true;
        setRevokeTarget(null);
      })
      .catch((failure: unknown) => setError(advisorErrorMessage(failure)))
      .finally(() => setRevoking(false));
  }

  if (grants.length === 0) return <p className="text-sm text-muted">{text.external.grantsEmpty}</p>;

  const columns = text.settingsRedesign.grantsColumns;
  return <>
    <div className="overflow-hidden rounded-inset border border-outline">
      <div aria-hidden="true" className="hidden grid-cols-[110px_110px_1fr_150px_auto] gap-2.5 bg-surface-raised px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted md:grid">
        <span>{columns.host}</span><span>{columns.environment}</span><span>{columns.status}</span><span>{columns.validity}</span><span className="w-24" />
      </div>
      <ul>
        {grants.map((grant) => {
          const hostName = text.external.hosts[grant.client];
          const isGranted = grant.status === 'WAITING' || grant.status === 'ACTIVE';
          const expiresSoon = isGranted && new Date(grant.expiresAt).getTime() - now <= expiresSoonMilliseconds;
          const validity = isGranted ? text.external.validUntil(new Date(grant.expiresAt).toLocaleDateString('pl-PL'))
            : grant.status === 'EXPIRED' ? text.external.expiredOn(new Date(grant.expiresAt).toLocaleDateString('pl-PL'))
              : grant.revokedAt ? text.external.revokedOn(new Date(grant.revokedAt).toLocaleDateString('pl-PL')) : '';
          return <li key={`${grant.client}:${grant.environment}`} className="grid min-h-[52px] items-center gap-x-2.5 gap-y-1 border-t border-outline px-3.5 py-2 text-[13px] first:border-t-0 md:grid-cols-[110px_110px_1fr_150px_auto]">
            <span className="flex flex-wrap items-center gap-2 md:contents">
              <strong className="font-medium">{hostName}</strong>
              <span><InvoiceEnvironmentChip environment={grant.environment} /></span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="tag" tone={statusTone[grant.status]}>{grant.status === 'WAITING' ? text.settingsRedesign.withoutAuthorizedRead : text.external.grantStatus[grant.status]}</Badge>
              {expiresSoon && <Badge variant="tag" tone="warning">{text.external.expiresSoon}</Badge>}
            </span>
            <span className="text-xs text-muted">{validity}{grant.lastUsedAt && <><br />{text.external.lastUsed(new Date(grant.lastUsedAt).toLocaleString('pl-PL'))}</>}</span>
            <span className="flex flex-col gap-2 md:flex-row">
              {canRegrant && expiresSoon && <Button variant="secondary" onClick={() => onRegrant(grant.client, grant.environment)}>{text.external.extend}</Button>}
              {isGranted && <Button variant="danger" onClick={() => { setError(''); setRevokeTarget(grant); }}>{text.external.revoke}</Button>}
              {canRegrant && !isGranted && <Button variant="secondary" onClick={() => onRegrant(grant.client, grant.environment)}>{text.external.grantAgain}</Button>}
            </span>
          </li>;
        })}
      </ul>
    </div>
    {grants.some((grant) => grant.status === 'EXPIRED' || grant.status === 'REVOKED') && <p className="text-xs text-muted">{text.settingsRedesign.grantsRetention}</p>}
    <NativeDialog sheet="mobile" open={revokeTarget !== null} title={revokeTarget ? text.external.revokeTitle(text.external.hosts[revokeTarget.client]) : ''}
      description={revokeTarget ? text.external.revokeBody(text.external.hosts[revokeTarget.client]) : ''} onClose={() => { if (!revoking) setRevokeTarget(null); }}>
      {error && <p role="alert" className="text-sm text-error-ink">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" data-dialog-cancel disabled={revoking} onClick={() => setRevokeTarget(null)}>{text.external.cancel}</Button>
        <Button variant="danger" loading={revoking} onClick={() => revokeTarget && revoke(revokeTarget)}>{text.external.revoke}</Button>
      </div>
    </NativeDialog>
  </>;
}
