'use client';

import { useEffect, useId, useState } from 'react';
import { advisorErrorMessage, advisorRequest, type AdvisorProvider, type AdvisorSettings as Settings } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { AdvisorConnectors } from './AdvisorConnectors';

export function AdvisorSettings({ companyId, onSaved }: { companyId: string; onSaved?: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<AdvisorProvider>('OPENROUTER');
  const [model, setModel] = useState<string | null>(null);
  const modelListIdentifier = useId();
  const [credential, setCredential] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const connection = settings?.connections.find((entry) => entry.provider === provider);

  useEffect(() => {
    const controller = new AbortController();
    void advisorRequest<Settings>(companyId, '/settings', { signal: controller.signal }).then(setSettings)
      .catch((failure) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
    return () => controller.abort();
  }, [companyId]);

  async function perform(operation: () => Promise<unknown>) {
    setBusy(true); setError(''); setMessage('');
    await operation().then(async () => {
      setSettings(await advisorRequest<Settings>(companyId, '/settings'));
      setCredential(''); setMessage(text.saved); onSaved?.();
    }).catch((failure: unknown) => setError(advisorErrorMessage(failure))).finally(() => setBusy(false));
  }

  return <section className="space-y-5 rounded-card border border-outline bg-surface-panel p-4">
    <h2 className="text-lg font-semibold">{text.settings}</h2>
    {error && <p role="alert" className="text-sm text-error-ink">{error}</p>}
    {message && <p role="status" className="text-sm text-success-ink">{message}</p>}
    {!settings && !error && <p role="status">{text.loading}</p>}
    {settings?.canManagePolicy && <fieldset disabled={busy} className="space-y-3 border-b border-outline pb-4">
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} />{text.enable}</label>
      <legend className="pt-3 text-sm font-medium">{text.allowed}</legend>
      {Object.entries(text.providers).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.allowedProviders.includes(value as AdvisorProvider)} onChange={(event) => setSettings({ ...settings,
          allowedProviders: event.target.checked ? [...settings.allowedProviders, value as AdvisorProvider] : settings.allowedProviders.filter((entry) => entry !== value) })} />{label}
      </label>)}
      <p className="text-sm font-medium">{text.connectorsAllowed}</p>
      {(['CHATGPT', 'CLAUDE'] as const).map((client) => <label key={client} className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={settings.allowedConnectors.includes(client)} onChange={(event) => setSettings({ ...settings,
          allowedConnectors: event.target.checked ? [...settings.allowedConnectors, client] : settings.allowedConnectors.filter((entry) => entry !== client) })} />{client === 'CHATGPT' ? 'ChatGPT' : 'Claude'}
      </label>)}
      <label className="block text-sm">{text.retention}<Input type="number" min={1} max={30} value={settings.retentionDays} onChange={(event) => setSettings({ ...settings, retentionDays: Number(event.target.value) })} /></label>
      <Button variant="secondary" onClick={() => void perform(() => advisorRequest(companyId, '/policy', { method: 'PATCH', body: JSON.stringify({ enabled: settings.enabled, allowedProviders: settings.allowedProviders, allowedConnectors: settings.allowedConnectors, retentionDays: settings.retentionDays }) }))}>{text.savePolicy}</Button>
    </fieldset>}
    {settings && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void perform(() => advisorRequest(companyId, `/connections/${provider}`, { method: 'PUT', body: JSON.stringify({ model: model ?? connection?.model ?? '', ...(credential ? { credential } : {}) }) })); }}>
      <p className="text-sm text-muted">{text.apiBilling}</p>
      <label className="block text-sm">{text.provider}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3" value={provider} disabled={busy} onChange={(event) => { setProvider(event.target.value as AdvisorProvider); setModel(null); setCredential(''); setModels([]); }}>
        {Object.entries(text.providers).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="block text-sm">{text.model}<Input required value={model ?? connection?.model ?? ''} onChange={(event) => setModel(event.target.value)} list={modelListIdentifier} maxLength={200} disabled={busy} /></label>
      <datalist id={modelListIdentifier}>{models.map((identifier) => <option key={identifier} value={identifier} />)}</datalist>
      <p className="text-xs text-muted">{text.modelHint}</p>
      {provider !== 'OLLAMA' && <label className="block text-sm">{text.credential}<Input type="password" autoComplete="off" value={credential} onChange={(event) => setCredential(event.target.value)} placeholder={connection?.hasCredential ? text.credentialSaved : ''} disabled={busy} maxLength={4096} /></label>}
      {provider === 'OLLAMA' && <p className="text-sm text-muted">{text.ollama}</p>}
      <Button type="submit" disabled={busy}>{text.save}</Button>
      {connection && <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy || !settings.operatorEnabled} onClick={() => void perform(() => advisorRequest(companyId, `/connections/${provider}/test`, { method: 'POST' }))}>{text.test}</Button>
        <Button variant="ghost" disabled={busy || !settings.operatorEnabled} onClick={() => void perform(async () => { const result = await advisorRequest<{ models: string[] }>(companyId, `/connections/${provider}/models`); setModels(result.models); })}>{text.models}</Button>
        <Button variant="danger" disabled={busy} onClick={() => void perform(() => advisorRequest(companyId, `/connections/${provider}`, { method: 'DELETE' }))}>{text.disconnect}</Button>
      </div>}
      {connection?.testedAt && <p className="text-sm text-success-ink">{text.tested}: {new Date(connection.testedAt).toLocaleString('pl-PL')}</p>}
      <p className="text-xs text-muted">{text.testBilling}</p>
    </form>}
    {settings && <AdvisorConnectors companyId={companyId} allowedClients={settings.enabled ? settings.allowedConnectors : []} />}
  </section>;
}
