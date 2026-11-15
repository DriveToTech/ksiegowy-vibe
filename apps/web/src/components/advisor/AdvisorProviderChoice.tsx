import type { AdvisorProvider, AdvisorSettings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { AdvisorStepEyebrow } from './AdvisorStepEyebrow';
import { Badge } from '../atoms/Badge';
import { Banner } from '../molecules/Banner';

const primaryProviders: AdvisorProvider[] = ['OPENROUTER', 'OLLAMA'];
const otherProviders: AdvisorProvider[] = ['OPENAI', 'ANTHROPIC'];

function ProviderCard({ settings, provider, selected, onChange }: { settings: AdvisorSettings; provider: AdvisorProvider; selected: boolean; onChange: (provider: AdvisorProvider) => void }) {
  const readiness = embeddedConnectionReadiness(settings, provider);
  const details = text.embedded.providerDetails[provider];
  return <label className={cn('flex min-h-11 cursor-pointer gap-2.5 rounded-inset border bg-surface-raised px-3.5 py-3 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
    selected ? 'border-primary shadow-[inset_0_0_0_1px_var(--primary)]' : 'border-outline-strong')}>
    <input type="radio" name="advisor-provider" value={provider} checked={selected} onChange={() => onChange(provider)} className="mt-0.5 size-[18px] shrink-0 accent-[var(--primary)]" />
    <span className="flex min-w-0 flex-col gap-[3px]">
      <span className="block text-[13.5px] font-semibold">{text.providers[provider]}</span>
      <span className="block text-xs leading-[1.45] text-muted">{details.location}</span>
      <span className="block text-xs leading-[1.45] text-muted">{details.billing}</span>
      <span className="mt-1 flex flex-wrap gap-1.5">
        {provider === 'OLLAMA' && <Badge variant="tag" tone={settings.ollamaAvailable ? 'success' : 'draft'}>{settings.ollamaAvailable ? text.embedded.ollamaConfigured : text.embedded.ollamaNotConfigured}</Badge>}
        {readiness.policy !== 'disabled' && <Badge variant="tag" tone={readiness.policy === 'allowed' ? 'success' : 'danger'}>{readiness.policy === 'allowed' ? text.embedded.providerAllowed : text.embedded.providerDenied}</Badge>}
        {readiness.connection !== 'notConfigured' && <Badge variant="tag" tone={readiness.connection === 'tested' ? 'success' : 'warning'}>{readiness.connection === 'tested' ? text.embedded.providerTested : text.embedded.providerSaved}</Badge>}
      </span>
    </span>
  </label>;
}

// Step 1: radio cards in one native group; OpenAI and Anthropic stay collapsed unless one of them is selected or already saved.
export function AdvisorProviderChoice({ settings, provider, onChange }: { settings: AdvisorSettings; provider: AdvisorProvider; onChange: (provider: AdvisorProvider) => void }) {
  const otherProviderInUse = otherProviders.some((entry) => entry === provider || settings.connections.some((connection) => connection.provider === entry));
  return <fieldset className="space-y-3">
    <legend className="mb-3 flex items-center text-sm font-semibold"><AdvisorStepEyebrow step={1} />{text.embedded.stepProvider}</legend>
    <div className="grid gap-2.5 md:grid-cols-2">
      {primaryProviders.map((entry) => <ProviderCard key={entry} settings={settings} provider={entry} selected={provider === entry} onChange={onChange} />)}
    </div>
    <details open={otherProviderInUse} className="group space-y-3">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium before:inline-block before:size-2 before:-rotate-45 before:border-b-2 before:border-r-2 before:transition-transform group-open:before:rotate-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text.settingsRedesign.otherProviders(otherProviders.map((entry) => text.providers[entry]).join(', '))}</summary>
      <div className="grid gap-2.5 md:grid-cols-2">
        {otherProviders.map((entry) => <ProviderCard key={entry} settings={settings} provider={entry} selected={provider === entry} onChange={onChange} />)}
      </div>
    </details>
    <Banner variant="accent" tone="info" className="text-[12.5px]">{text.embedded.billingDisclosure}</Banner>
  </fieldset>;
}
