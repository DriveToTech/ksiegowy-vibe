'use client';

import { useState } from 'react';
import { advisorErrorMessage, saveAdvisorPolicy, type AdvisorProvider, type AdvisorSettings } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';

type PolicyOperation = { phase: 'running' | 'succeeded' | 'failed'; message: string } | null;

export function AdvisorPolicyForm({ companyId, settings, onChanged }: { companyId: string; settings: AdvisorSettings; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [operation, setOperation] = useState<PolicyOperation>(null);

  async function savePolicy() {
    setOperation({ phase: 'running', message: '' });
    await saveAdvisorPolicy(companyId, { enabled: draft.enabled, allowedProviders: draft.allowedProviders, allowedConnectors: draft.allowedConnectors, retentionDays: draft.retentionDays })
      .then(onChanged)
      .then(() => setOperation({ phase: 'succeeded', message: text.policy.saved }))
      .catch((failure: unknown) => setOperation({ phase: 'failed', message: advisorErrorMessage(failure) }));
  }

  return <fieldset disabled={operation?.phase === 'running'} className="space-y-3 border-b border-outline pb-4">
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />{text.policy.enable}</label>
    <legend className="pt-3 text-sm font-medium">{text.policy.allowed}</legend>
    {Object.entries(text.providers).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.allowedProviders.includes(value as AdvisorProvider)} onChange={(event) => setDraft({ ...draft,
        allowedProviders: event.target.checked ? [...draft.allowedProviders, value as AdvisorProvider] : draft.allowedProviders.filter((entry) => entry !== value) })} />{label}
    </label>)}
    <p className="text-sm font-medium">{text.policy.allowedHosts}</p>
    <p className="text-xs text-muted">{text.policy.allowedHostsDescription}</p>
    {(['CHATGPT', 'CLAUDE'] as const).map((client) => <label key={client} className="flex min-h-11 items-center gap-2 text-sm">
      <input type="checkbox" checked={draft.allowedConnectors.includes(client)} onChange={(event) => setDraft({ ...draft,
        allowedConnectors: event.target.checked ? [...draft.allowedConnectors, client] : draft.allowedConnectors.filter((entry) => entry !== client) })} />{client === 'CHATGPT' ? 'ChatGPT' : 'Claude'}
    </label>)}
    <label className="block text-sm">{text.policy.retention}<Input type="number" min={1} max={30} value={draft.retentionDays} onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })} /></label>
    <Button variant="secondary" onClick={() => void savePolicy()}>{text.policy.savePolicy}</Button>
    {operation?.phase === 'failed' && <p role="alert" className="text-sm text-error-ink">{operation.message}</p>}
    {operation?.phase === 'succeeded' && <p role="status" className="text-sm text-success-ink">{operation.message}</p>}
  </fieldset>;
}
