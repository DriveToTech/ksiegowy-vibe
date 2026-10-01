'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { advisorErrorMessage, readAdvisorConnectors, readAdvisorSettings, type AdvisorConnectorSettings, type AdvisorProvider, type AdvisorSettings as Settings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { AdvisorConnectors } from './AdvisorConnectors';
import { AdvisorPolicyForm } from './AdvisorPolicyForm';
import { AdvisorProviderChoice } from './AdvisorProviderChoice';
import { AdvisorProviderConnection } from './AdvisorProviderConnection';
import { AdvisorReadinessSummary, type AdvisorReadinessRow } from './AdvisorReadinessSummary';

type ConnectionMode = 'embedded' | 'external';
const modeStorageKey = 'advisor-connection-mode';

// The last chosen mode is the only thing kept in localStorage; storage can be blocked, so a module variable backs it.
const modeListeners = new Set<() => void>();
let selectedMode: ConnectionMode | null = null;

function readMode(): ConnectionMode {
  if (selectedMode) return selectedMode;
  try {
    const stored = window.localStorage.getItem(modeStorageKey);
    if (stored === 'embedded' || stored === 'external') selectedMode = stored;
  } catch { /* the default mode stays */ }
  return selectedMode ?? 'embedded';
}

function selectMode(next: ConnectionMode) {
  selectedMode = next;
  try { window.localStorage.setItem(modeStorageKey, next); } catch { /* not persisted */ }
  modeListeners.forEach((listener) => listener());
}

function subscribeToMode(listener: () => void) {
  modeListeners.add(listener);
  return () => { modeListeners.delete(listener); };
}

export function AdvisorSettings({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connectors, setConnectors] = useState<AdvisorConnectorSettings | null>(null);
  const [settingsError, setSettingsError] = useState('');
  const [connectorsError, setConnectorsError] = useState('');
  const mode = useSyncExternalStore(subscribeToMode, readMode, () => 'embedded' as const);
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
  const embeddedRows: AdvisorReadinessRow[] | null = !settings || !readiness ? null : [
    { label: text.readiness.policy, ...(readiness.policy === 'allowed' ? { chip: text.readiness.policyAllowed, tone: 'success' as const }
      : { chip: readiness.policy === 'denied' ? text.readiness.providerDenied : text.readiness.policyOff, tone: 'warning' as const,
        reason: readiness.policy === 'denied' ? text.readiness.providerDeniedDescription(text.providers[provider]) : text.readiness.policyDisabled }) },
    { label: text.readiness.server, ...(readiness.runtime === 'enabled' ? { chip: text.readiness.serverEnabled, tone: 'success' as const }
      : { chip: text.readiness.serverDisabled, tone: 'warning' as const, reason: text.operatorDisabled }) },
    { label: text.readiness.connection, ...(readiness.connection === 'tested' ? { chip: text.readiness.tested, tone: 'success' as const }
      : readiness.connection === 'savedNotTested' ? { chip: text.readiness.savedNotTested, tone: 'primary' as const }
        : { chip: text.readiness.notConfigured, tone: 'draft' as const }),
      ...(savedConnection ? { reason: `${text.providers[provider]} · ${savedConnection.model}` } : {}) },
  ];
  const externalRows: AdvisorReadinessRow[] | null = !connectors ? null : [
    { label: text.readiness.connectorServer, ...(connectors.endpoint ? { chip: text.readiness.connectorAvailable, tone: 'success' as const }
      : { chip: text.readiness.connectorUnavailable, tone: 'warning' as const, reason: text.external.unavailable }) },
    { label: text.readiness.grants, chip: text.readiness.grantsActive(connectors.grants.filter((grant) => grant.status === 'ACTIVE' || grant.status === 'WAITING').length), tone: 'draft' },
  ];

  return <section className="space-y-5 rounded-card border border-outline bg-surface-panel p-4">
    <h2 className="text-lg font-semibold">{text.settings}</h2>
    <div role="group" aria-label={text.settings} className="grid gap-3 md:grid-cols-2">
      {(['embedded', 'external'] as const).map((entry) => <button key={entry} type="button" aria-pressed={mode === entry} onClick={() => selectMode(entry)}
        className={cn('min-h-11 rounded-card border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          mode === entry ? 'border-primary bg-surface-raised' : 'border-outline bg-surface-panel hover:bg-surface-raised')}>
        <span className="block font-medium">{text.modes[entry]}</span>
        <span className="mt-1 block text-sm text-muted">{text.modes[`${entry}Description`]}</span>
      </button>)}
    </div>
    {settingsError && <div className="space-y-2"><p role="alert" className="text-sm text-error-ink">{settingsError}</p><Button variant="secondary" onClick={() => void load()}>{text.readiness.retry}</Button></div>}
    {!settings && !settingsError && <p role="status">{text.readiness.loadingSettings}</p>}
    {settings?.canManagePolicy && <AdvisorPolicyForm companyId={companyId} settings={settings} onChanged={() => load()} />}
    {mode === 'embedded' && settings && <>
      <AdvisorReadinessSummary rows={embeddedRows} />
      <AdvisorProviderChoice settings={settings} companyName={companyName} provider={provider} onChange={setChosenProvider} />
      <AdvisorProviderConnection key={provider} companyId={companyId} settings={settings} provider={provider} onChanged={() => load()} />
    </>}
    {mode === 'external' && settings && <>
      <AdvisorReadinessSummary rows={externalRows} />
      <AdvisorConnectors companyId={companyId} companyName={companyName} connectors={connectors} loadError={connectorsError} allowedClients={settings.enabled ? settings.allowedConnectors : []} onChanged={() => load()} />
    </>}
  </section>;
}
