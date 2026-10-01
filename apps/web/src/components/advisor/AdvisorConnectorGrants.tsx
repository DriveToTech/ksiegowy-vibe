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
export function AdvisorConnectorGrants({ companyId, grants, onRegrant, onChanged }: {
  companyId: string; grants: AdvisorConnectorGrant[];
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

  return <>
    <ul className="space-y-3">
      {grants.map((grant) => {
        const hostName = text.external.hosts[grant.client];
        const isGranted = grant.status === 'WAITING' || grant.status === 'ACTIVE';
        const expiresSoon = isGranted && new Date(grant.expiresAt).getTime() - now <= expiresSoonMilliseconds;
        return <li key={`${grant.client}:${grant.environment}`} className="grid gap-3 rounded-inset border border-outline bg-surface-raised p-4 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{hostName}</span>
              <InvoiceEnvironmentChip environment={grant.environment} />
              <Badge variant="tag" tone={statusTone[grant.status]}>{text.external.grantStatus[grant.status]}</Badge>
              {expiresSoon && <Badge variant="tag" tone="warning">{text.external.expiresSoon}</Badge>}
            </div>
            <p className="text-sm text-muted">
              {isGranted && text.external.validUntil(new Date(grant.expiresAt).toLocaleDateString('pl-PL'))}
              {grant.status === 'EXPIRED' && text.external.expiredOn(new Date(grant.expiresAt).toLocaleDateString('pl-PL'))}
              {grant.status === 'REVOKED' && grant.revokedAt && text.external.revokedOn(new Date(grant.revokedAt).toLocaleDateString('pl-PL'))}
            </p>
            {grant.lastUsedAt && <p className="text-sm text-muted">{text.external.lastUsed(new Date(grant.lastUsedAt).toLocaleString('pl-PL'))}</p>}
            {grant.status === 'WAITING' && <p className="text-sm text-muted">{text.external.waitingHelp(hostName)}</p>}
            {(grant.status === 'EXPIRED' || grant.status === 'REVOKED') && <p className="text-sm text-muted">{text.external.recovery}</p>}
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            {expiresSoon && <Button variant="secondary" onClick={() => onRegrant(grant.client, grant.environment)}>{text.external.extend}</Button>}
            {isGranted && <Button variant="danger" onClick={() => { setError(''); setRevokeTarget(grant); }}>{text.external.revoke}</Button>}
            {!isGranted && <Button variant="secondary" onClick={() => onRegrant(grant.client, grant.environment)}>{text.external.grantAgain}</Button>}
          </div>
        </li>;
      })}
    </ul>
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
