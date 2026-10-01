'use client';

import { useRef, useState, type ReactNode } from 'react';
import { advisorErrorMessage, grantAdvisorConnector, type AdvisorConnectorClient, type AdvisorConnectorSettings, type AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Surface } from '../atoms/Surface';
import { Banner } from '../molecules/Banner';
import { InvoiceEnvironmentChip } from '../molecules/StatusChip';
import { AdvisorConnectorGrants } from './AdvisorConnectorGrants';
import { AdvisorStepEyebrow } from './AdvisorStepEyebrow';
import { AdvisorConnectorSetup } from './AdvisorConnectorSetup';

const choiceClassName = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-card border border-outline bg-surface-raised p-3 has-[:checked]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary has-[:disabled]:cursor-not-allowed';
const hostNames = ['CHATGPT', 'CLAUDE'] as const;
const environments = ['TEST', 'PRODUCTION'] as const;
const durations = [7, 30] as const;

function ConnectorChoice({ name, value, checked, disabled, onChange, children }: {
  name: string; value: string; checked: boolean; disabled?: boolean; onChange: () => void; children: ReactNode;
}) {
  return <label className={choiceClassName}>
    <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={onChange} className="size-4 shrink-0 accent-[var(--primary)]" />
    <span className="flex flex-wrap items-center gap-2">{children}</span>
  </label>;
}

export function AdvisorConnectors({ companyId, companyName, connectors, loadError, allowedClients, onChanged }: {
  companyId: string; companyName: string; connectors: AdvisorConnectorSettings | null; loadError: string; allowedClients: AdvisorConnectorClient[]; onChanged: () => Promise<void>;
}) {
  const [requestedHost, setRequestedHost] = useState<AdvisorConnectorClient>('CHATGPT');
  const [environment, setEnvironment] = useState<AdvisorEnvironment>('TEST');
  const [days, setDays] = useState<number>(7);
  const [consentFor, setConsentFor] = useState('');
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState('');
  const [grantedUntil, setGrantedUntil] = useState('');
  const setupHeadingReference = useRef<HTMLHeadingElement>(null);
  const consentReference = useRef<HTMLInputElement>(null);

  // A host without a pre-registered OAuth client cannot be chosen; fall back to the first available one.
  const host = connectors?.clients.includes(requestedHost) ? requestedHost : connectors?.clients[0] ?? requestedHost;
  const hostName = text.external.hosts[host];
  const currentChoice = `${host}:${environment}:${days}`;
  const hasConsent = consentFor === currentChoice;
  const hostAvailable = connectors?.clients.includes(host) ?? false;
  const hostAllowed = allowedClients.includes(host);
  const grantBlockedReason = !hostAvailable ? text.external.hostUnavailableReason(hostName) : !hostAllowed ? text.external.hostNotAllowedReason(hostName) : !hasConsent ? text.external.consentRequiredReason : '';
  const environmentName = text.external.environments[environment];

  // Changing any choice clears consent, because consent is stored for the exact host, environment and duration.
  function chooseScope(change: () => void) {
    change(); setConsentFor(''); setGrantedUntil('');
  }

  function grant() {
    setGranting(true); setError(''); setGrantedUntil('');
    void grantAdvisorConnector(companyId, host, environment, days)
      .then(async (result) => {
        await onChanged();
        setConsentFor('');
        setGrantedUntil(text.external.granted(new Date(result.expiresAt).toLocaleDateString('pl-PL')));
        window.requestAnimationFrame(() => setupHeadingReference.current?.focus());
      })
      .catch((failure: unknown) => setError(advisorErrorMessage(failure)))
      .finally(() => setGranting(false));
  }

  // Re-grant only prefills step 2 and asks for consent again; it never sends a request.
  function prefillGrant(client: AdvisorConnectorClient, grantEnvironment: AdvisorEnvironment) {
    setRequestedHost(client); setEnvironment(grantEnvironment); setConsentFor(''); setGrantedUntil('');
    window.requestAnimationFrame(() => consentReference.current?.focus());
  }

  return <section className="space-y-5">
    <Banner variant="accent" tone="info" className="space-y-1">
      <p>{text.external.hostOwnership(hostName)}</p>
      <p>{text.external.noSecretsCollected(hostName)}</p>
      <p>{text.external.subscriptionNotEmbedded(hostName)}</p>
    </Banner>
    {loadError && <p role="alert" className="text-sm text-error-ink">{loadError}</p>}
    {!connectors && !loadError && <div aria-hidden className="h-24 animate-pulse rounded-inset bg-surface-raised motion-reduce:animate-none" />}
    {connectors && !connectors.endpoint && <Banner variant="accent" tone="warning">{text.external.unavailable}</Banner>}
    {connectors?.endpoint && <>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-medium"><AdvisorStepEyebrow step={1} />{text.external.stepHost}</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {hostNames.map((entry) => {
            const available = connectors.clients.includes(entry);
            return <ConnectorChoice key={entry} name="advisor-host" value={entry} checked={host === entry} disabled={!available}
              onChange={() => chooseScope(() => setRequestedHost(entry))}>
              <span className="font-medium">{text.external.hosts[entry]}</span>
              {!available && <Badge variant="tag" tone="draft">{text.external.hostUnavailable}</Badge>}
              {available && !allowedClients.includes(entry) && <Badge variant="tag" tone="danger">{text.external.hostNotAllowed}</Badge>}
            </ConnectorChoice>;
          })}
        </div>
      </fieldset>

      <Surface tone="inset" className="space-y-4 p-4">
        <h3 className="font-medium"><AdvisorStepEyebrow step={2} />{text.external.stepScope}</h3>
        <p className="text-sm"><span className="text-muted">{text.external.scopeCompany}: </span>{text.external.currentCompany(companyName || text.external.unknownCompany)}</p>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{text.external.environment}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {environments.map((entry) => <ConnectorChoice key={entry} name="advisor-environment" value={entry} checked={environment === entry} disabled={granting}
              onChange={() => chooseScope(() => setEnvironment(entry))}><InvoiceEnvironmentChip environment={entry} /></ConnectorChoice>)}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">{text.external.expiry}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {durations.map((entry) => <ConnectorChoice key={entry} name="advisor-days" value={String(entry)} checked={days === entry} disabled={granting}
              onChange={() => chooseScope(() => setDays(entry))}>{text.external.expiryDays(entry)}</ConnectorChoice>)}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input ref={consentReference} type="checkbox" className="mt-1 size-5 shrink-0" checked={hasConsent} disabled={granting} onChange={(event) => setConsentFor(event.target.checked ? currentChoice : '')} />
          <span>{text.external.consent(hostName, companyName || text.external.unknownCompany, environmentName, days)}</span>
        </label>
        <Button loading={granting} disabled={grantBlockedReason !== ''} aria-describedby="advisor-grant-reason" onClick={grant} className="w-full md:w-auto">{text.external.grant}</Button>
        <p id="advisor-grant-reason" className="text-sm text-muted">{grantBlockedReason}</p>
        {error && <p role="alert" className="text-sm text-error-ink">{error}</p>}
        {grantedUntil && <Banner variant="accent" tone="success">{grantedUntil}</Banner>}
      </Surface>

      <AdvisorConnectorSetup host={host} endpoint={connectors.endpoint} headingReference={setupHeadingReference} />

      <section aria-labelledby="advisor-grants-title" className="space-y-3">
        <h3 id="advisor-grants-title" className="font-medium">{text.external.stepGrants}</h3>
        <AdvisorConnectorGrants companyId={companyId} grants={connectors.grants} onRegrant={prefillGrant} onChanged={onChanged} />
      </section>
    </>}
  </section>;
}
