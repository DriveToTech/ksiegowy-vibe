'use client';

import { useEffect, useState, type RefObject } from 'react';
import type { AdvisorConnectorClient } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { Surface } from '../atoms/Surface';
import { FormField } from '../molecules/FormField';
import { AdvisorStepEyebrow } from './AdvisorStepEyebrow';

type Verification = keyof typeof text.external.verification;
const verificationTone = { verified: 'success', partial: 'warning', unverified: 'draft' } as const;
const addressFieldId = 'advisor-connector-address';
const hostAddresses: Record<AdvisorConnectorClient, string> = { CHATGPT: 'https://chatgpt.com', CLAUDE: 'https://claude.ai/new' };

function VerificationBadge({ verification }: { verification: Verification }) {
  return <Badge variant="tag" tone={verificationTone[verification]}>{text.external.verification[verification]}</Badge>;
}

// Step 3: the public connector address and the per-host steps. No client ID or callback URL is shown; those are operator configuration.
export function AdvisorConnectorSetup({ host, endpoint, headingReference }: {
  host: AdvisorConnectorClient; endpoint: string; headingReference: RefObject<HTMLHeadingElement | null>;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const hostName = text.external.hosts[host];

  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = window.setTimeout(() => setCopyState('idle'), 2000);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  function copyAddress() {
    void navigator.clipboard.writeText(endpoint)
      .then(() => setCopyState('copied'))
      .catch(() => {
        const field = document.getElementById(addressFieldId);
        if (field instanceof HTMLInputElement) field.select();
        setCopyState('failed');
      });
  }

  return <section aria-labelledby="advisor-connector-setup-title" className="space-y-4">
    <h3 id="advisor-connector-setup-title" ref={headingReference} tabIndex={-1} className="font-medium"><AdvisorStepEyebrow step={3} />{text.external.stepAddConnector(hostName)}</h3>
    <div className="flex flex-col gap-2 md:flex-row md:items-end">
      <FormField label={text.external.connectorAddress} className="md:flex-1">
        <Input id={addressFieldId} readOnly value={endpoint} className="break-all font-mono" onFocus={(event) => event.target.select()} />
      </FormField>
      <Button variant="secondary" onClick={copyAddress}>{copyState === 'copied' ? text.external.copied : text.external.copyAddress}</Button>
    </div>
    <p role="status" className={copyState === 'idle' ? 'sr-only' : 'text-sm text-muted'}>
      {copyState === 'copied' ? text.external.copiedAnnouncement : copyState === 'failed' ? text.external.copyFallback : ''}
    </p>
    <Surface tone="inset" className="space-y-3 p-4">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        {text.external.hostSteps[host].map((step) => <li key={step.text}>{step.text} <VerificationBadge verification={step.verification} /></li>)}
      </ol>
      <p className="text-sm">{text.external.webOnlySetup.text} <VerificationBadge verification={text.external.webOnlySetup.verification} /></p>
      <p className="text-sm">{text.external.sameAccountNotice.text} <VerificationBadge verification={text.external.sameAccountNotice.verification} /></p>
    </Surface>
    <details className="rounded-inset bg-surface-raised px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{text.external.accountRestrictions}</summary>
      <ul className="list-disc space-y-2 pb-4 pl-5 text-sm">
        {text.external.hostRestrictions[host].map((restriction) => <li key={restriction.text}>{restriction.text} <VerificationBadge verification={restriction.verification} /></li>)}
      </ul>
    </details>
    <details className="rounded-inset bg-surface-raised px-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{text.external.selfHostedHttps}</summary>
      <p className="pb-4 text-sm">{text.external.selfHostedHttpsBody(hostName)} <VerificationBadge verification="verified" /></p>
    </details>
    <Button variant="secondary" href={hostAddresses[host]} target="_blank" rel="noopener noreferrer" className="w-full md:w-auto">
      {text.external.openHost[host]}<span className="sr-only"> {text.external.opensNewTab}</span>
    </Button>
  </section>;
}
