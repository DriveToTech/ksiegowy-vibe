'use client';

import { useState } from 'react';
import { advisorErrorMessage, saveAdvisorPolicy, type AdvisorConnectorClient, type AdvisorProvider, type AdvisorSettings } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { AdvisorCheckbox, AdvisorSwitch } from './AdvisorSettingsControls';

type PolicyOperation = { phase: 'running' | 'succeeded' | 'failed'; message: string } | null;

const rowClassName = 'flex items-start justify-between gap-4 border-t border-outline py-3 first:border-t-0 first:pt-0';
const hostNames: Record<AdvisorConnectorClient, string> = { CHATGPT: 'ChatGPT', CLAUDE: 'Claude' };

// Company switch is its own row; provider and host choices stay disabled while it is off, so a half-configured policy cannot be saved.
export function AdvisorPolicyForm({ companyId, settings, onChanged }: { companyId: string; settings: AdvisorSettings; onChanged: () => Promise<void> }) {
  const [draft, setDraft] = useState(settings);
  const [operation, setOperation] = useState<PolicyOperation>(null);
  const copy = text.settingsRedesign;

  async function savePolicy() {
    setOperation({ phase: 'running', message: '' });
    await saveAdvisorPolicy(companyId, { enabled: draft.enabled, allowedProviders: draft.allowedProviders, allowedConnectors: draft.allowedConnectors, retentionDays: draft.retentionDays })
      .then(onChanged)
      .then(() => setOperation({ phase: 'succeeded', message: text.policy.saved }))
      .catch((failure: unknown) => setOperation({ phase: 'failed', message: advisorErrorMessage(failure) }));
  }

  return <section aria-labelledby="advisor-policy-title" className="space-y-4 rounded-card border border-outline bg-surface-panel p-4">
    <div className="flex items-center justify-between gap-3">
      <h3 id="advisor-policy-title" className="text-sm font-semibold">{copy.policyTitle}</h3>
      <Badge variant="tag" tone="primary">{copy.administratorOnly}</Badge>
    </div>
    <fieldset disabled={operation?.phase === 'running'} className="min-w-0">
      <div className={rowClassName}>
        <div className="min-w-0 space-y-0.5">
          <strong className="text-[13.5px] font-medium">{copy.companySwitch}</strong>
          <p className="text-xs text-muted">{copy.companySwitchDescription}</p>
        </div>
        <AdvisorSwitch checked={draft.enabled} label={copy.companySwitch} stateLabel={draft.enabled ? copy.switchOn : copy.switchOff} onChange={(enabled) => setDraft({ ...draft, enabled })} />
      </div>
      <div role="group" aria-labelledby="advisor-policy-providers" className={rowClassName}>
        <div className="min-w-0 flex-1 space-y-1">
          <strong id="advisor-policy-providers" className="text-[13.5px] font-medium">{copy.allowedProviders}</strong>
          <div className="flex flex-wrap gap-x-5">
            {(['OPENROUTER', 'OLLAMA', 'OPENAI', 'ANTHROPIC'] as const satisfies readonly AdvisorProvider[]).map((value) => <AdvisorCheckbox key={value} disabled={!draft.enabled} checked={draft.allowedProviders.includes(value)}
              onChange={(checked) => setDraft({ ...draft, allowedProviders: checked ? [...draft.allowedProviders, value] : draft.allowedProviders.filter((entry) => entry !== value) })}>{text.providers[value]}</AdvisorCheckbox>)}
          </div>
        </div>
      </div>
      <div role="group" aria-labelledby="advisor-policy-hosts" className={rowClassName}>
        <div className="min-w-0 flex-1 space-y-1">
          <strong id="advisor-policy-hosts" className="text-[13.5px] font-medium">{copy.externalHosts}</strong>
          <div className="flex flex-wrap gap-x-5">
            {(['CHATGPT', 'CLAUDE'] as const).map((client) => <AdvisorCheckbox key={client} disabled={!draft.enabled} checked={draft.allowedConnectors.includes(client)}
              onChange={(checked) => setDraft({ ...draft, allowedConnectors: checked ? [...draft.allowedConnectors, client] : draft.allowedConnectors.filter((entry) => entry !== client) })}>{hostNames[client]}</AdvisorCheckbox>)}
          </div>
        </div>
      </div>
      <div className={rowClassName}>
        <div className="min-w-0 flex-1 space-y-2">
          <strong className="text-[13.5px] font-medium">{copy.retentionTitle}</strong>
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative block w-32"><span className="sr-only">{copy.retentionLabel}</span>
              <Input type="number" min={1} max={30} value={draft.retentionDays} className="h-11 text-[13px] [appearance:textfield]" onChange={(event) => setDraft({ ...draft, retentionDays: Number(event.target.value) })} />
              <span aria-hidden="true" className="pointer-events-none absolute left-[calc(0.75rem+2ch+0.4rem)] top-1/2 -translate-y-1/2 text-[13px] text-foreground-secondary">{copy.retentionUnit}</span>
            </label>
            <p className="min-w-52 flex-1 text-xs text-muted">{copy.retentionDescription}</p>
          </div>
        </div>
      </div>
      <Button onClick={() => void savePolicy()} loading={operation?.phase === 'running'}>{text.policy.savePolicy}</Button>
    </fieldset>
    {operation?.phase === 'failed' && <p role="alert" className="text-sm text-error-ink">{operation.message}</p>}
    {operation?.phase === 'succeeded' && <p role="status" className="text-sm text-success-ink">{operation.message}</p>}
  </section>;
}
