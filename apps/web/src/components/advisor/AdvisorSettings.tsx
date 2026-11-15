'use client';

import { useCallback, useEffect, useState } from 'react';
import { advisorErrorMessage, readAdvisorConnectors, readAdvisorSettings, type AdvisorConnectorSettings, type AdvisorProvider, type AdvisorSettings as Settings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { Banner } from '../molecules/Banner';
import { AdvisorConnectors } from './AdvisorConnectors';
import { AdvisorPolicyForm } from './AdvisorPolicyForm';
import { AdvisorProviderChoice } from './AdvisorProviderChoice';
import { AdvisorProviderConnection } from './AdvisorProviderConnection';
import { AdvisorReadinessSummary, type AdvisorReadinessRow } from './AdvisorReadinessSummary';

type ConnectionMode = 'embedded' | 'external';
// Every Settings visit starts in the embedded mode; switching modes is local to this view.

export function AdvisorSettings({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connectors, setConnectors] = useState<AdvisorConnectorSettings | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [connectorsError, setConnectorsError] = useState('');
  const [mode, setMode] = useState<ConnectionMode>('embedded');
  const [chosenProvider, setChosenProvider] = useState<AdvisorProvider | null>(null);

  // Both snapshots are fetched in parallel; a failing connectors request must not hide the provider settings.
  const load = useCallback(async (signal?: AbortSignal) => {
    await Promise.all([
      readAdvisorSettings(companyId, signal).then((snapshot) => { setSettings(snapshot); setSettingsError(''); }).catch((failure: unknown) => { if (!signal?.aborted) setSettingsError(advisorErrorMessage(failure)); }),
      readAdvisorConnectors(companyId, signal).then((snapshot) => { setConnectors(snapshot); setConnectorsError(''); }).catch((failure: unknown) => { if (!signal?.aborted) setConnectorsError(advisorErrorMessage(failure)); }),
    ]);
  }, [companyId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Until a card is chosen, the provider that already has a saved connection is shown.
  const provider = chosenProvider ?? settings?.connections[0]?.provider ?? 'OPENROUTER';
  const readiness = settings ? embeddedConnectionReadiness(settings, provider) : null;
  const savedConnection = settings?.connections.find((entry) => entry.provider === provider);
  const copy = text.settingsRedesign;
  const providerLabel = text.providers[provider];
  const viewer = settings ? !settings.canManageConnections : false;
  const grants = connectors?.grants ?? [];
  const currentGrants = grants.filter((grant) => grant.status === 'ACTIVE' || grant.status === 'WAITING');
  const waitingGrants = grants.filter((grant) => grant.status === 'WAITING');
  const expiredCount = grants.filter((grant) => grant.status === 'EXPIRED').length;
  const revokedCount = grants.filter((grant) => grant.status === 'REVOKED').length;
  const hasCurrentRead = currentGrants.some((grant) => grant.status === 'ACTIVE');

  const embeddedStatus = !settings || !readiness ? null
    : readiness.runtime === 'disabled' ? { tone: 'warn', label: copy.modeStatus.operatorOff }
      : readiness.policy === 'disabled' ? { tone: 'warn', label: copy.modeStatus.companyOff }
        : readiness.connection === 'tested' ? { tone: 'ok', label: copy.modeStatus.tested }
          : readiness.connection === 'savedNotTested' ? { tone: 'warn', label: copy.modeStatus.savedUntested }
            : { tone: 'none', label: copy.modeStatus.notConnected };
  const externalStatus = !connectors ? null
    : waitingGrants.length > 0 ? { tone: 'warn', label: copy.modeStatus.grantedNoRead }
      : hasCurrentRead ? { tone: 'ok', label: text.readiness.grantsActive(currentGrants.length) }
        : expiredCount + revokedCount > 0 ? { tone: 'none', label: copy.modeStatus.noAccess(expiredCount, revokedCount) }
          : { tone: 'none', label: copy.modeStatus.notConnected };
  const modeStatus = { embedded: embeddedStatus, external: externalStatus };

  const policyAllowed = readiness?.policy === 'allowed';
  const embeddedRows: AdvisorReadinessRow[] | null = !settings || !readiness ? null : [
    { label: text.readiness.policy, ...(policyAllowed ? { chip: text.readiness.policyAllowed, tone: 'success' as const, reason: copy.readinessReasons.providerAllowed(providerLabel) }
      : readiness.policy === 'denied' ? { chip: text.readiness.providerDenied, tone: 'warning' as const, reason: text.readiness.providerDeniedDescription(providerLabel) }
        : { chip: text.readiness.policyOff, tone: 'draft' as const, reason: settings.canManagePolicy ? text.readiness.policyAdminHint : text.readiness.policyDisabled }) },
    { label: text.readiness.server, ...(readiness.runtime === 'enabled' ? { chip: text.readiness.serverEnabled, tone: 'success' as const, reason: copy.readinessReasons.connectionConfigurable }
      : { chip: text.readiness.serverDisabled, tone: 'warning' as const, reason: text.operatorDisabled }) },
    { label: text.readiness.connection, ...(readiness.connection === 'tested' ? { chip: text.readiness.tested, tone: 'success' as const, reason: savedConnection?.testedAt ? new Date(savedConnection.testedAt).toLocaleString('pl-PL') : undefined }
      : readiness.connection === 'savedNotTested' ? { chip: text.readiness.savedNotTested, tone: 'warning' as const, reason: copy.readinessReasons.testOptional }
        : { chip: text.readiness.notConfigured, tone: 'draft' as const,
          reason: viewer ? copy.readinessReasons.viewerRole : readiness.runtime === 'disabled' ? copy.readinessReasons.saveUnavailable : copy.readinessReasons.saveKeyBelow }) },
  ];
  const allowedHosts = settings?.enabled ? settings.allowedConnectors : [];
  const externalRows: AdvisorReadinessRow[] | null = !connectors || !settings ? null : [
    { label: text.readiness.policy, ...(allowedHosts.length > 0 ? { chip: text.readiness.policyAllowed, tone: 'success' as const } : { chip: settings.enabled ? text.readiness.providerDenied : text.readiness.policyOff, tone: 'draft' as const }),
      reason: (['CHATGPT', 'CLAUDE'] as const).map((client) => copy.hostPolicyState(text.external.hosts[client], allowedHosts.includes(client))).join(' · ') },
    { label: text.readiness.connectorServer, ...(connectors.endpoint ? { chip: copy.readinessReasons.connectorAddressSet, tone: 'success' as const, reason: copy.readinessReasons.connectorPublicHttps }
      : { chip: text.readiness.connectorUnavailable, tone: 'warning' as const, reason: text.external.unavailable }) },
    { label: text.readiness.grants, ...(waitingGrants.length > 0 ? { chip: copy.readinessReasons.noReadYet, tone: 'warning' as const,
      reason: waitingGrants.map((grant) => `${text.external.hosts[grant.client]} · ${text.external.environments[grant.environment]} · ${text.external.validUntil(new Date(grant.expiresAt).toLocaleDateString('pl-PL')).toLowerCase()}`).join(', ') }
      : hasCurrentRead ? { chip: text.readiness.grantsActive(currentGrants.length), tone: 'success' as const }
        : { chip: copy.readinessReasons.noAccess, tone: 'draft' as const, reason: expiredCount + revokedCount > 0 ? copy.expiredRevoked(expiredCount, revokedCount) : undefined }) },
  ];

  return <section className="space-y-4">
    {settings?.canManagePolicy && <AdvisorPolicyForm companyId={companyId} settings={settings} onChanged={() => load()} />}
    <div role="group" aria-label={copy.modeGroup} className="grid grid-cols-2 gap-2.5">
      {(['embedded', 'external'] as const).map((entry) => <button key={entry} type="button" aria-pressed={mode === entry} onClick={() => setMode(entry)}
        className={cn('flex min-h-16 flex-col gap-[3px] rounded-inset border px-3.5 py-[11px] text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          mode === entry ? 'border-primary bg-[image:var(--nav-active)] shadow-[inset_0_0_0_1px_var(--primary)]' : 'border-outline-strong bg-surface-panel hover:bg-surface-raised')}>
        <strong className="text-[13.5px] font-semibold">{text.modes[entry]}</strong>
        {modeStatus[entry] && <span className={cn('text-xs', modeStatus[entry].tone === 'warn' ? 'text-warning-ink' : modeStatus[entry].tone === 'ok' ? 'text-success-ink' : 'text-muted')}>{modeStatus[entry].label}</span>}
      </button>)}
    </div>
    {settingsError && <div className="space-y-2"><p role="alert" className="text-sm text-error-ink">{settingsError}</p><Button variant="secondary" onClick={() => void load()}>{text.readiness.retry}</Button></div>}
    {!settings && !settingsError && <p role="status">{text.readiness.loadingSettings}</p>}
    {settings && <>
      <AdvisorReadinessSummary rows={mode === 'embedded' ? embeddedRows : externalRows} />
      {mode === 'embedded' && <p className="text-xs text-muted">{text.embedded.scope(companyName)}</p>}
      {viewer && <Banner variant="accent" tone="warning" role="status">{copy.viewerBanner}</Banner>}
    </>}
    {mode === 'embedded' && settings && <div className="space-y-6">
      <AdvisorProviderChoice settings={settings} provider={provider} onChange={setChosenProvider} />
      <AdvisorProviderConnection key={provider} companyId={companyId} settings={settings} provider={provider} onChanged={() => load()} />
    </div>}
    {mode === 'external' && settings && <AdvisorConnectors companyId={companyId} companyName={companyName} connectors={connectors} loadError={connectorsError} allowedClients={allowedHosts} canManageConnections={settings.canManageConnections} onChanged={() => load()} />}
  </section>;
}
