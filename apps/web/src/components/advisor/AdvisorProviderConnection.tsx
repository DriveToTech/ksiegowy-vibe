'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { advisorErrorCode, advisorErrorMessage, deleteAdvisorConnection, discoverAdvisorModels, saveAdvisorConnection, testAdvisorConnection, type AdvisorProvider, type AdvisorSettings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { NativeDialog } from '../atoms/NativeDialog';
import { Banner } from '../molecules/Banner';
import { FormField } from '../molecules/FormField';
import { advisorReadinessTitleIdentifier } from './AdvisorReadinessSummary';

// One operation at a time: the message always comes from the operation that produced it.
type ConnectionOperation = { name: 'discover' | 'save' | 'test' | 'disconnect'; phase: 'running' | 'succeeded' | 'failed'; message: string; code?: string } | null;

const discoverWaitMilliseconds = 10_000;

// Rendered with key={provider} by the container, so changing provider clears the key draft, catalog and status.
export function AdvisorProviderConnection({ companyId, settings, provider, onChanged }: {
  companyId: string; settings: AdvisorSettings; provider: AdvisorProvider; onChanged: () => Promise<void>;
}) {
  const [model, setModel] = useState<string | null>(null);
  const [credential, setCredential] = useState('');
  const [models, setModels] = useState<string[] | null>(null);
  const [operation, setOperation] = useState<ConnectionOperation>(null);
  const [waitingForRateLimit, setWaitingForRateLimit] = useState(false);
  const [dailyLimitReached, setDailyLimitReached] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const verifyHeading = useRef<HTMLHeadingElement>(null);
  const modelListIdentifier = useId();
  const blockerIdentifier = useId();
  const discoverHintIdentifier = useId();
  const testReasonIdentifier = useId();
  const connection = settings.connections.find((entry) => entry.provider === provider);
  const readiness = embeddedConnectionReadiness(settings, provider);
  const providerLabel = text.providers[provider];
  const isOllama = provider === 'OLLAMA';
  const busy = operation?.phase === 'running';
  const discoverCode = operation?.name === 'discover' && operation.phase === 'failed' ? operation.code : undefined;
  const ollamaNotConfigured = isOllama && (!settings.ollamaAvailable || discoverCode === 'OLLAMA_NOT_CONFIGURED');
  const ollamaNoModels = isOllama && discoverCode === 'OLLAMA_NO_MODELS';
  const modelValue = model ?? connection?.model ?? '';
  const needsCredential = !isOllama && !credential && !connection?.hasCredential;
  const adminHint = settings.canManagePolicy ? ` ${text.readiness.policyAdminHint}` : '';

  // Each blocker says what is wrong and who can resolve it; setup and manual model entry stay possible.
  const blockers = [
    ...(readiness.runtime === 'disabled' ? [text.operatorDisabled] : []),
    ...(readiness.policy === 'disabled' ? [`${text.readiness.policyDisabled}${adminHint}`] : []),
    ...(readiness.policy === 'denied' ? [`${text.readiness.providerDeniedDescription(providerLabel)}${adminHint}`] : []),
  ];
  const testBlockedReason = readiness.runtime === 'disabled' ? text.embedded.testBlockedRuntime : text.embedded.testBlockedDenied;
  const discoverBlocked = busy || waitingForRateLimit || dailyLimitReached || !readiness.canDiscover || (isOllama ? ollamaNotConfigured : needsCredential);
  const discoverLabel = busy && operation?.name === 'discover' ? text.embedded.fetchingModels
    : waitingForRateLimit ? text.embedded.waitMoment
      : operation?.name === 'discover' && operation.phase === 'failed' ? text.embedded.retryDiscover
        : isOllama ? text.embedded.fetchServerModels
          : connection && !credential ? text.embedded.refreshModels : text.embedded.fetchModels;

  // The preview route allows one request per user per 10 seconds, so the button stays disabled for that long.
  useEffect(() => {
    if (!waitingForRateLimit) return;
    const timer = setTimeout(() => setWaitingForRateLimit(false), discoverWaitMilliseconds);
    return () => clearTimeout(timer);
  }, [waitingForRateLimit]);

  // After a successful save focus moves to the verification step; after a disconnect it returns to the readiness summary.
  useEffect(() => {
    if (operation?.phase !== 'succeeded') return;
    if (operation.name === 'save') verifyHeading.current?.focus();
    if (operation.name === 'disconnect') document.getElementById(advisorReadinessTitleIdentifier)?.focus();
  }, [operation]);

  async function runOperation(name: NonNullable<ConnectionOperation>['name'], action: () => Promise<string>) {
    setOperation({ name, phase: 'running', message: '' });
    await action()
      .then((message) => setOperation({ name, phase: 'succeeded', message }))
      .catch((failure: unknown) => {
        const code = advisorErrorCode(failure);
        if (name === 'discover' && code === 'RATE_LIMITED') setWaitingForRateLimit(true);
        // Stays disabled until reload or provider change; the daily cap resets at UTC midnight and the message says to try tomorrow.
        if (name === 'discover' && code === 'DAILY_LIMIT_REACHED') setDailyLimitReached(true);
        const reason = advisorErrorMessage(failure);
        setOperation({ name, phase: 'failed', code, message: name === 'test' ? text.embedded.testFailed(reason) : reason });
      });
  }

  const keyRejected = discoverCode === 'PROVIDER_ERROR';
  const message = operation && operation.phase !== 'running' && !keyRejected
    ? <p role={operation.phase === 'failed' ? 'alert' : 'status'} className={operation.phase === 'failed' ? 'text-sm text-error-ink' : 'text-sm text-success-ink'}>{operation.message}</p>
    : null;
  const verifyTone = operation?.name === 'test' && operation.phase === 'running' ? 'primary' as const
    : operation?.name === 'test' && operation.phase === 'failed' ? 'danger' as const
      : connection?.testedAt ? 'success' as const : 'warning' as const;
  const verifyChip = operation?.name === 'test' && operation.phase === 'running' ? text.embedded.testRunningChip
    : operation?.name === 'test' && operation.phase === 'failed' ? text.embedded.testFailedChip
      : connection?.testedAt ? text.readiness.tested : text.readiness.savedNotTested;

  return <div className="space-y-8">
    <form className="max-w-[560px] space-y-4" onSubmit={(event) => {
      event.preventDefault();
      void runOperation('save', async () => {
        await saveAdvisorConnection(companyId, provider, { model: modelValue, ...(credential && !isOllama ? { credential } : {}) });
        await onChanged();
        setCredential('');
        return text.embedded.connectionSaved;
      });
    }}>
      <h3 className="text-sm font-semibold">{text.embedded.stepKeyAndModel}</h3>
      {blockers.length > 0 && <div id={blockerIdentifier} className="space-y-2">{blockers.map((blocker) => <Banner key={blocker} tone="warning" role="status">{blocker}</Banner>)}</div>}
      {isOllama
        ? <div className="space-y-2 rounded-card border border-outline bg-surface-raised p-4">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{text.embedded.ollamaEndpoint}</span>
            <Badge tone={ollamaNotConfigured ? 'draft' : 'success'}>{ollamaNotConfigured ? text.embedded.ollamaNotConfigured : text.embedded.ollamaConfigured}</Badge>
            {discoverCode === 'OLLAMA_UNREACHABLE' && <Badge tone="danger">{text.embedded.ollamaUnreachable}</Badge>}
            {ollamaNoModels && <Badge tone="warning">{text.embedded.ollamaNoModels}</Badge>}
          </p>
          <p className="text-sm text-muted">{ollamaNotConfigured ? text.embedded.ollamaNotConfiguredDescription : models?.length ? text.embedded.ollamaReachable : text.embedded.ollamaReachabilityUnknown}</p>
          {!ollamaNotConfigured && <p className="text-sm text-muted">{text.embedded.ollamaHint}</p>}
        </div>
        : <FormField label={text.embedded.credential(providerLabel)} hint={connection?.hasCredential ? text.embedded.credentialSaved : undefined} error={keyRejected ? operation?.message : undefined}>
          <Input type="password" autoComplete="off" spellCheck={false} autoCapitalize="none" value={credential} onChange={(event) => setCredential(event.target.value)}
            required={!connection?.hasCredential} disabled={busy} maxLength={4096} />
        </FormField>}
      {!ollamaNotConfigured && <>
        <FormField label={text.embedded.model} hint={`${models ? `${text.embedded.modelCount(models.length)}. ` : ''}${text.embedded.modelHint}`}>
          <Input required value={modelValue} onChange={(event) => setModel(event.target.value)} list={modelListIdentifier} maxLength={200} disabled={busy} className="font-mono" />
        </FormField>
        <datalist id={modelListIdentifier}>{(models ?? []).map((identifier) => <option key={identifier} value={identifier} />)}</datalist>
        <Button variant="secondary" className="w-full sm:w-auto" disabled={discoverBlocked} loading={busy && operation?.name === 'discover'} aria-describedby={readiness.canDiscover ? discoverHintIdentifier : blockerIdentifier}
          onClick={() => void runOperation('discover', async () => {
            const preview = await discoverAdvisorModels(companyId, provider, credential || undefined);
            setModels(preview.models);
            return preview.models.length === 0 && !isOllama ? text.embedded.catalogEmpty : text.embedded.modelCount(preview.models.length);
          })}>{discoverLabel}</Button>
        <p id={discoverHintIdentifier} className="text-sm text-muted">{needsCredential ? text.embedded.credentialNeeded : text.embedded.fetchModelsHint}</p>
        <Button type="submit" className="w-full sm:w-auto" disabled={busy || ollamaNoModels} loading={busy && operation?.name === 'save'}>{isOllama ? text.embedded.saveModel : text.embedded.save}</Button>
      </>}
      {operation?.name !== 'test' && message}
    </form>

    {connection && <section aria-labelledby="advisor-verify-title" className="max-w-[560px] space-y-3">
      <h3 id="advisor-verify-title" ref={verifyHeading} tabIndex={-1} className="text-sm font-semibold focus:outline-none">{text.embedded.stepVerify}</h3>
      <p className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={verifyTone}>{verifyChip}</Badge><span className="break-all font-mono">{connection.model}</span></p>
      {connection.testedAt && <p className="text-sm text-muted">
        {text.embedded.testedLine(providerLabel, connection.model, new Date(connection.testedAt).toLocaleString('pl-PL'))} {readiness.readyForQuestions ? text.embedded.readyForQuestions : text.embedded.testPassedNotReady(blockers.join(' '))}
      </p>}
      <p className="text-sm text-muted">{isOllama ? text.embedded.testBillingOllama : text.embedded.testBilling}</p>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Button variant="secondary" className="w-full sm:w-auto" disabled={busy || !readiness.canTest} loading={busy && operation?.name === 'test'} aria-describedby={readiness.canTest ? undefined : testReasonIdentifier}
            onClick={() => void runOperation('test', async () => {
              await testAdvisorConnection(companyId, provider);
              await onChanged();
              return text.embedded.testSucceeded;
            })}>{isOllama ? text.embedded.testOllama : text.embedded.test}</Button>
          {!readiness.canTest && <p id={testReasonIdentifier} className="text-sm text-muted">{testBlockedReason}</p>}
        </div>
        <Button variant="danger" className="w-full sm:w-auto" disabled={busy} onClick={() => setDisconnectOpen(true)}>{text.embedded.disconnect}</Button>
      </div>
      {operation?.name === 'test' && operation.phase === 'running' && <p role="status" className="text-sm text-muted">{text.embedded.testRunning}</p>}
      {operation?.name === 'test' && message}
    </section>}

    <NativeDialog open={disconnectOpen} title={text.embedded.disconnectTitle(providerLabel)} description={text.embedded.disconnectBody} onClose={() => setDisconnectOpen(false)}>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" data-dialog-cancel onClick={() => setDisconnectOpen(false)}>{text.embedded.cancel}</Button>
        <Button variant="danger" onClick={() => {
          setDisconnectOpen(false);
          void runOperation('disconnect', async () => {
            await deleteAdvisorConnection(companyId, provider);
            await onChanged();
            return text.embedded.disconnected(providerLabel);
          });
        }}>{text.embedded.disconnect}</Button>
      </div>
    </NativeDialog>
  </div>;
}
