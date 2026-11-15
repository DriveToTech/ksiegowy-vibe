'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { advisorErrorCode, advisorErrorMessage, deleteAdvisorConnection, discoverAdvisorModels, saveAdvisorConnection, testAdvisorConnection, type AdvisorProvider, type AdvisorSettings } from '../../lib/advisor-api';
import { embeddedConnectionReadiness } from '../../lib/advisor-connection-status';
import { advisorText as text } from '../../lib/advisor-translations';
import { Badge } from '../atoms/Badge';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { NativeDialog } from '../atoms/NativeDialog';
import { FormField } from '../molecules/FormField';
import { advisorReadinessTitleIdentifier } from './AdvisorReadinessSummary';
import { AdvisorNote } from './AdvisorSettingsControls';
import { AdvisorStepEyebrow } from './AdvisorStepEyebrow';

// One operation at a time: the message always comes from the operation that produced it.
type ConnectionOperation = { name: 'discover' | 'save' | 'test' | 'disconnect'; phase: 'running' | 'succeeded' | 'failed'; message: string; code?: string } | null;

const discoverWaitMilliseconds = 10_000;

// Rendered with key={provider} by the container, so changing provider clears the key draft, catalog and status.
const fieldLabelClassName = 'text-xs! font-normal! text-foreground-secondary!';

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

  // One action blocker beside Save, highest priority only: operator, company, then the viewer role. A denied provider only explains itself; saving stays possible.
  const copy = text.settingsRedesign;
  const canManage = settings.canManageConnections;
  const lockReason = readiness.runtime === 'disabled' ? copy.operatorBlocker
    : readiness.policy === 'disabled' ? (settings.canManagePolicy ? copy.companyBlockerAdministrator : copy.companyBlocker)
      : !canManage ? copy.readinessReasons.viewerRole : '';
  const locked = lockReason !== '';
  const deniedNote = readiness.policy === 'denied' ? `${text.readiness.providerDeniedDescription(providerLabel)}${adminHint}` : '';
  const blockerText = lockReason || deniedNote;
  const testBlockedReason = readiness.runtime === 'disabled' ? text.embedded.testBlockedRuntime : text.embedded.testBlockedDenied;
  const discoverBlocked = busy || waitingForRateLimit || dailyLimitReached || locked || !readiness.canDiscover || (isOllama ? ollamaNotConfigured : needsCredential);
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

  const keyRejected = discoverCode === 'PROVIDER_ERROR' || discoverCode === 'PROVIDER_INVALID_CREDENTIALS';
  const testKeyRejected = operation?.name === 'test' && operation.phase === 'failed' && (operation.code === 'PROVIDER_ERROR' || operation.code === 'PROVIDER_INVALID_CREDENTIALS');
  const message = operation && operation.phase !== 'running' && !keyRejected
    ? <p role={operation.phase === 'failed' ? 'alert' : 'status'} className={operation.phase === 'failed' ? 'text-sm text-error-ink' : 'text-sm text-success-ink'}>{testKeyRejected ? copy.verifyFailedKey : operation.message}</p>
    : null;
  const testing = operation?.name === 'test' && operation.phase === 'running';
  const testFailed = operation?.name === 'test' && operation.phase === 'failed';
  const verifyTone = testing ? 'primary' as const : testFailed ? 'danger' as const
    : !connection ? 'draft' as const : connection.testedAt ? 'success' as const : 'warning' as const;
  const verifyChip = testing ? text.embedded.testRunningChip : testFailed ? text.embedded.testFailedChip
    : !connection ? text.readiness.notConfigured : connection.testedAt ? text.readiness.tested : text.readiness.savedNotTested;
  const verifyDescription = !connection ? copy.verifyNone
    : testing ? copy.readinessReasons.testRunning
      : connection.testedAt ? copy.verifyTested(providerLabel, connection.model, new Date(connection.testedAt).toLocaleString('pl-PL'))
        : `${providerLabel} · ${connection.model}`;

  return <div className="space-y-8">
    <form className="max-w-[560px] space-y-3" aria-describedby={locked ? blockerIdentifier : undefined} onSubmit={(event) => {
      event.preventDefault();
      if (locked) return;
      void runOperation('save', async () => {
        await saveAdvisorConnection(companyId, provider, { model: modelValue, ...(credential && !isOllama ? { credential } : {}) });
        await onChanged();
        setCredential('');
        return text.embedded.connectionSaved;
      });
    }}>
      <h3 className="flex items-center text-sm font-semibold"><AdvisorStepEyebrow step={2} />{text.embedded.stepKeyAndModel}</h3>
      <fieldset disabled={locked} className="min-w-0 space-y-3">
      {isOllama
        ? <div className="space-y-2 rounded-inset border border-outline bg-surface-raised p-3.5">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{text.embedded.ollamaEndpoint}</span>
            <Badge variant="tag" tone={ollamaNotConfigured ? 'draft' : 'success'}>{ollamaNotConfigured ? text.embedded.ollamaNotConfigured : text.embedded.ollamaConfigured}</Badge>
            {discoverCode === 'OLLAMA_UNREACHABLE' && <Badge variant="tag" tone="danger">{text.embedded.ollamaUnreachable}</Badge>}
            {ollamaNoModels && <Badge variant="tag" tone="warning">{text.embedded.ollamaNoModels}</Badge>}
          </p>
          <p className="text-xs text-muted">{ollamaNotConfigured ? text.embedded.ollamaNotConfiguredDescription : models?.length ? text.embedded.ollamaReachable : text.embedded.ollamaReachabilityUnknown}</p>
          {!ollamaNotConfigured && <p className="text-xs text-muted">{text.embedded.ollamaHint}</p>}
        </div>
        : <FormField label={text.embedded.credential(providerLabel)} labelClassName={fieldLabelClassName} hint={connection?.hasCredential ? text.embedded.credentialSaved : copy.keyHelpEntry} error={keyRejected ? operation?.message : undefined}>
          <Input type="password" className="h-11 text-[13px]" autoComplete="off" spellCheck={false} autoCapitalize="none" value={credential} onChange={(event) => setCredential(event.target.value)}
            placeholder={connection?.hasCredential ? copy.keyReplacePlaceholder : copy.keyPlaceholder}
            required={!connection?.hasCredential} disabled={busy} maxLength={4096} />
        </FormField>}
      {!ollamaNotConfigured && <>
        <div className="flex flex-wrap items-end gap-2">
          <FormField label={text.embedded.model} labelClassName={fieldLabelClassName} className="min-w-[260px] flex-1">
            <Input required value={modelValue} onChange={(event) => setModel(event.target.value)} list={modelListIdentifier} maxLength={200} disabled={busy} className="h-11 font-mono text-[13px]" />
          </FormField>
          <Button variant="secondary" className="w-full sm:w-auto" disabled={discoverBlocked} loading={busy && operation?.name === 'discover'}
            aria-describedby={locked || !readiness.canDiscover ? blockerIdentifier : discoverHintIdentifier}
            onClick={() => {
              void runOperation('discover', async () => {
                const preview = await discoverAdvisorModels(companyId, provider, credential || undefined);
                setModels(preview.models);
                return preview.models.length === 0 && !isOllama ? text.embedded.catalogEmpty : text.embedded.modelCount(preview.models.length);
              });
            }}>{discoverLabel}</Button>
        </div>
        <p className="text-xs text-muted">{models ? `${text.embedded.modelCount(models.length)}. ` : ''}{text.embedded.modelHint}</p>
        <datalist id={modelListIdentifier}>{(models ?? []).map((identifier) => <option key={identifier} value={identifier} />)}</datalist>
      </>}
      </fieldset>
      {!ollamaNotConfigured && <>
        <p id={discoverHintIdentifier} className="text-xs text-muted">{needsCredential ? text.embedded.credentialNeeded : text.embedded.fetchModelsHint}</p>
        {blockerText && <AdvisorNote id={blockerIdentifier} role="status">{blockerText}</AdvisorNote>}
        <div><Button type="submit" variant={locked ? 'secondary' : 'primary'} className="w-full sm:w-auto" disabled={busy || ollamaNoModels || locked} aria-describedby={locked ? blockerIdentifier : undefined} loading={busy && operation?.name === 'save'}>{isOllama ? text.embedded.saveModel : text.embedded.save}</Button></div>
      </>}
      {operation?.name !== 'test' && message}
    </form>

    <section aria-labelledby="advisor-verify-title" className="max-w-[560px] space-y-3">
      <h3 id="advisor-verify-title" ref={verifyHeading} tabIndex={-1} className="flex items-center text-sm font-semibold focus:outline-none"><AdvisorStepEyebrow step={3} />{text.embedded.stepVerify}</h3>
      <div className="flex flex-wrap items-center gap-2.5"><Badge variant="tag" tone={verifyTone}>{verifyChip}</Badge><span className="break-words text-[12.5px] text-foreground-secondary">{verifyDescription}</span></div>
      {connection?.testedAt && !testing && <p className="text-xs text-muted">{copy.testScope} {readiness.readyForQuestions ? text.embedded.readyForQuestions : text.embedded.testPassedNotReady(lockReason || deniedNote || copy.operatorBlocker)}</p>}
      {connection && <>
        {!readiness.canTest && <AdvisorNote id={testReasonIdentifier}>{testBlockedReason}</AdvisorNote>}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <Button variant="secondary" className="w-full sm:w-auto" disabled={busy || !readiness.canTest} loading={testing} aria-describedby={readiness.canTest ? undefined : testReasonIdentifier}
            onClick={() => void runOperation('test', async () => {
              await testAdvisorConnection(companyId, provider);
              await onChanged();
              return text.embedded.testSucceeded;
            })}>{testing ? copy.testing : isOllama ? text.embedded.testOllama : connection.testedAt ? copy.retest : text.embedded.test}</Button>
          <Button variant="danger" className="w-full sm:ml-auto sm:w-auto" disabled={busy} onClick={() => setDisconnectOpen(true)}>{text.embedded.disconnect}</Button>
        </div>
        <p className="text-xs text-muted">{isOllama ? text.embedded.testBillingOllama : text.embedded.testBilling}</p>
        {operation?.name === 'test' && message}
      </>}
    </section>

    <NativeDialog sheet="mobile" open={disconnectOpen} title={text.embedded.disconnectTitle(providerLabel)} description={text.embedded.disconnectBody} onClose={() => setDisconnectOpen(false)}>
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
