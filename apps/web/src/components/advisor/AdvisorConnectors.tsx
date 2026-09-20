'use client';

import { useEffect, useState } from 'react';
import { advisorErrorMessage, advisorRequest, type AdvisorConnectorClient, type AdvisorConnectorSettings, type AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';

export function AdvisorConnectors({ companyId, allowedClients }: { companyId: string; allowedClients: AdvisorConnectorClient[] }) {
  const [settings, setSettings] = useState<AdvisorConnectorSettings | null>(null);
  const [environment, setEnvironment] = useState<AdvisorEnvironment>('TEST');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void advisorRequest<AdvisorConnectorSettings>(companyId, '/connectors', { signal: controller.signal }).then(setSettings)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
    return () => controller.abort();
  }, [companyId]);
  async function changeGrant(client: AdvisorConnectorClient, revoke: boolean) {
    setBusy(true); setError('');
    await advisorRequest(companyId, `/connectors/${client}`, { method: revoke ? 'DELETE' : 'PUT', headers: { 'x-ksef-environment': environment },
      ...(revoke ? {} : { body: JSON.stringify({ days: 30 }) }) })
      .then(async () => { setSettings(await advisorRequest<AdvisorConnectorSettings>(companyId, '/connectors')); setConsent(false); })
      .catch((failure: unknown) => setError(advisorErrorMessage(failure))).finally(() => setBusy(false));
  }
  return <section className="space-y-3 border-t border-outline pt-4">
    <h3 className="font-medium">{text.subscriptions}</h3>
    <p className="text-sm text-muted">{text.subscriptionDescription}</p>
    {error && <p role="alert" className="text-sm text-error-ink">{error}</p>}
    {settings && !settings.endpoint && <p className="text-sm text-muted">{text.connectorUnavailable}</p>}
    {settings?.endpoint && <>
      <label className="block text-sm">{text.connectorAddress}<input readOnly className="mt-1 min-h-11 w-full rounded-control border border-outline bg-surface-raised px-2" value={settings.endpoint} onFocus={(event) => event.target.select()} /></label>
      <p className="break-all text-xs text-muted">{text.companyIdentifier}: {companyId}</p>
      <label className="block text-sm">{text.environment}<select value={environment} disabled={busy} onChange={(event) => { setEnvironment(event.target.value as AdvisorEnvironment); setConsent(false); }} className="ml-2 min-h-11 rounded-control border border-outline bg-surface-raised px-2"><option value="TEST">TEST</option><option value="PRODUCTION">PRODUCTION</option></select></label>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} />{text.connectorConsent}</label>
      {settings.clients.map((client) => {
        const grant = settings.grants.find((entry) => entry.client === client && entry.environment === environment);
        return <div key={client} className="space-y-2 rounded-inset bg-surface-raised p-3"><h4 className="font-medium">{client === 'CHATGPT' ? 'ChatGPT' : 'Claude'}</h4>
          {grant ? <><p className="text-xs">{text.expires}: {new Date(grant.expiresAt).toLocaleString('pl-PL')}</p><Button variant="danger" disabled={busy} onClick={() => void changeGrant(client, true)}>{text.revoke}</Button></>
            : <Button disabled={busy || !consent || !allowedClients.includes(client)} onClick={() => void changeGrant(client, false)}>{text.grant}</Button>}
        </div>;
      })}
    </>}
  </section>;
}
