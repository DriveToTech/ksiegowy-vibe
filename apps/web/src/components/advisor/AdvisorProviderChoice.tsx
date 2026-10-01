import type { AdvisorProvider, AdvisorSettings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Badge } from '../atoms/Badge';
import { Banner } from '../molecules/Banner';

const primaryProviders: AdvisorProvider[] = ['OPENROUTER', 'OLLAMA'];
const otherProviders: AdvisorProvider[] = ['OPENAI', 'ANTHROPIC'];

function ProviderCard({ settings, provider, selected, onChange }: { settings: AdvisorSettings; provider: AdvisorProvider; selected: boolean; onChange: (provider: AdvisorProvider) => void }) {
  const readiness = embeddedConnectionReadiness(settings, provider);
  const details = text.embedded.providerDetails[provider];
  return <label className={cn('flex min-h-11 cursor-pointer gap-3 rounded-card border p-4 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
    selected ? 'border-primary bg-surface-raised' : 'border-outline bg-surface-panel hover:bg-surface-raised')}>
    <input type="radio" name="advisor-provider" value={provider} checked={selected} onChange={() => onChange(provider)} className="mt-1 size-4 shrink-0 accent-[var(--primary)]" />
    <span className="min-w-0 space-y-1">
      <span className="block font-medium">{text.providers[provider]}</span>
      <span className="block text-sm text-muted">{details.location}</span>
      <span className="block text-sm text-muted">{details.billing}</span>
      <span className="flex flex-wrap gap-2 pt-1">
        {provider === 'OLLAMA' && <Badge tone={settings.ollamaAvailable ? 'success' : 'draft'}>{settings.ollamaAvailable ? text.embedded.ollamaConfigured : text.embedded.ollamaNotConfigured}</Badge>}
        {readiness.policy !== 'disabled' && <Badge tone={readiness.policy === 'allowed' ? 'success' : 'danger'}>{readiness.policy === 'allowed' ? text.embedded.providerAllowed : text.embedded.providerDenied}</Badge>}
        {readiness.connection !== 'notConfigured' && <Badge tone={readiness.connection === 'tested' ? 'success' : 'warning'}>{readiness.connection === 'tested' ? text.embedded.providerTested : text.embedded.providerSaved}</Badge>}
      </span>
    </span>
  </label>;
}

// Step 1: radio cards in one native group; OpenAI and Anthropic stay collapsed unless one of them is selected or already saved.
export function AdvisorProviderChoice({ settings, companyName, provider, onChange }: { settings: AdvisorSettings; companyName: string; provider: AdvisorProvider; onChange: (provider: AdvisorProvider) => void }) {
  const otherProviderInUse = otherProviders.some((entry) => entry === provider || settings.connections.some((connection) => connection.provider === entry));
  return <fieldset className="space-y-3">
    <legend className="card-title text-sm font-semibold">{text.embedded.stepProvider}</legend>
    <p className="text-sm text-muted">{text.embedded.scope(companyName)}</p>
    <div className="grid gap-4 md:grid-cols-2">
      {primaryProviders.map((entry) => <ProviderCard key={entry} settings={settings} provider={entry} selected={provider === entry} onChange={onChange} />)}
    </div>
    <details open={otherProviderInUse} className="space-y-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text.embedded.otherProviders}</summary>
      <div className="grid gap-4 md:grid-cols-2">
        {otherProviders.map((entry) => <ProviderCard key={entry} settings={settings} provider={entry} selected={provider === entry} onChange={onChange} />)}
      </div>
    </details>
    <Banner tone="info">{text.embedded.billingDisclosure}</Banner>
  </fieldset>;
}
