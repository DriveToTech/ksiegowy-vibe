'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advisorErrorMessage, advisorRequest, streamAdvisorAnswer, type AdvisorConversationDetail, type AdvisorConversationSummary, type AdvisorEnvironment, type AdvisorProvider, type AdvisorScope, type AdvisorSettings as Settings, type AdvisorTurn } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { AdvisorAnswerCard } from './AdvisorAnswerCard';

const settingsLink = '/dashboard/settings?section=advisor';

export function AdvisorConversation({ companyId, environment, active, seed }: {
  companyId: string; environment: AdvisorEnvironment; active: boolean; seed: { question: string; documentId?: string; documentKind?: 'outgoing' | 'incoming'; contractorId?: string; contractorName?: string; period?: string; revision: number };
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<AdvisorProvider>('OPENROUTER');
  const providerSelected = useRef(false);
  const [history, setHistory] = useState<AdvisorConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const [question, setQuestion] = useState(seed.question);
  const [seedRevision, setSeedRevision] = useState(seed.revision);
  const [period, setPeriod] = useState(seed.period ?? new Date().toISOString().slice(0, 7));
  const [questionKind, setQuestionKind] = useState<'records' | 'tax'>('records');
  const [includeRecords, setIncludeRecords] = useState(false);
  const [changingContext, setChangingContext] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<string>(text.loading);
  const requestController = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const environmentHeaders = { 'x-ksef-environment': environment };
  const refreshSettings = useCallback(() => {
    const controller = new AbortController();
    void advisorRequest<Settings>(companyId, '/settings', { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      setSettings(result);
      if (!providerSelected.current) {
        providerSelected.current = true;
        setProvider(result.connections[0]?.provider ?? 'OPENROUTER');
      }
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
    return () => controller.abort();
  }, [companyId]);

  useEffect(() => { if (active) return refreshSettings(); }, [active, refreshSettings]);
  useEffect(() => {
    if (seedRevision === seed.revision) return;
    setSeedRevision(seed.revision);
    if (seed.question) setQuestion(seed.question);
    if (seed.period) setPeriod(seed.period);
    if (seed.contractorId || seed.documentId) {
      requestController.current?.abort();
      setConversationId(null); setTurns([]); setIncludeRecords(false); setQuestionKind('records');
    }
  }, [seed, seedRevision]);
  useEffect(() => {
    if (!active) { requestController.current?.abort(); historyController.current?.abort(); }
    return () => { requestController.current?.abort(); historyController.current?.abort(); };
  }, [active]);
  useEffect(() => {
    if (!active || !settings?.enabled || !settings.operatorEnabled) return;
    const controller = new AbortController();
    void advisorRequest<AdvisorConversationSummary[]>(companyId, '/conversations', { headers: { 'x-ksef-environment': environment }, signal: controller.signal }).then(setHistory)
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
    return () => controller.abort();
  }, [active, companyId, environment, conversationId, settings?.enabled, settings?.operatorEnabled]);

  async function loadConversation(identifier: string) {
    requestController.current?.abort(); historyController.current?.abort();
    setConversationId(identifier || null); setTurns([]); setError('');
    if (!identifier) return;
    const controller = new AbortController(); historyController.current = controller;
    await advisorRequest<AdvisorConversationDetail>(companyId, `/conversations/${encodeURIComponent(identifier)}`, { headers: environmentHeaders, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setTurns(result.turns); providerSelected.current = true; setProvider(result.provider); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
  }

  const blocked = !settings ? null : !settings.operatorEnabled ? text.blocked.operator
    : !settings.enabled ? text.blocked.company
    : !settings.allowedProviders.includes(provider) ? text.blocked.provider(text.providers[provider])
    : !settings.connections.some((entry) => entry.provider === provider) ? text.blocked.connection(text.providers[provider]) : null;

  async function sendQuestion() {
    if (busy || blocked || !settings || !question.trim()) return;
    const controller = new AbortController(); requestController.current = controller;
    setBusy(true); setError(''); setProgress(text.loading);
    const submittedQuestion = question.trim();
    const requestId = crypto.randomUUID();
    const scope: AdvisorScope = { questionKind, period, includeRecords,
      ...(seed.documentId && seed.documentKind && includeRecords ? { documentId: seed.documentId, documentKind: seed.documentKind } : {}),
      ...(seed.contractorId && includeRecords ? { contractorId: seed.contractorId } : {}) };
    await Promise.resolve().then(async () => {
      const conversation = conversationId ? { id: conversationId } : await advisorRequest<AdvisorConversationSummary>(companyId, '/conversations', {
        method: 'POST', headers: environmentHeaders, signal: controller.signal, body: JSON.stringify({ provider, title: submittedQuestion.slice(0, 120) }),
      });
      if (controller.signal.aborted) return;
      setConversationId(conversation.id);
      const answer = await streamAdvisorAnswer(companyId, environment, conversation.id, { question: submittedQuestion, requestId, scope }, controller.signal, () => setProgress(text.working));
      if (controller.signal.aborted) return;
      setTurns((current) => [...current, { id: requestId, question: submittedQuestion, status: 'COMPLETED', answer, createdAt: new Date().toISOString() }]);
      setQuestion('');
    }).catch((failure: unknown) => setError(controller.signal.aborted ? text.cancelled : advisorErrorMessage(failure))).finally(() => setBusy(false));
  }

  return <div className={blocked ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}>
    <div className={blocked ? 'flex shrink-0 items-center justify-between gap-2 border-b border-outline px-4 py-2' : 'flex items-center justify-between gap-2'}>
      <p className="min-w-0 break-words font-mono text-[11px] uppercase tracking-[0.08em] text-muted">{text.context}: {text.providers[provider]} · {environment} · {period}</p>
      <Button variant="ghost" aria-expanded={changingContext} aria-controls="advisor-context-fields" onClick={() => setChangingContext((current) => !current)}>{text.change}</Button>
    </div>
    {seed.contractorId && <p className="text-sm text-foreground-secondary">{text.contractorBalance}: {seed.contractorName ?? seed.contractorId} · faktury wystawione do końca {period}</p>}
    {settings && <div id="advisor-context-fields" hidden={!changingContext} className={blocked ? 'shrink-0 space-y-3 border-b border-outline bg-surface-raised p-4' : 'space-y-3 rounded-card border border-outline bg-surface-raised p-4'}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">{text.provider}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-panel px-2" value={provider} disabled={busy || Boolean(conversationId)} onChange={(event) => { providerSelected.current = true; setProvider(event.target.value as AdvisorProvider); }}>
          {Object.entries(text.providers).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select></label>
        <label className="text-sm">{text.period}<Input type="month" required value={period} onChange={(event) => setPeriod(event.target.value)} disabled={busy} /></label>
      </div>
      <label className="block text-sm">{text.questionKind}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-panel px-3" value={questionKind} disabled={busy} onChange={(event) => setQuestionKind(event.target.value as 'records' | 'tax')}><option value="records">{text.records}</option><option value="tax">{text.tax}</option></select></label>
      <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1 size-4 accent-[var(--primary)]" type="checkbox" checked={includeRecords} disabled={busy} onChange={(event) => setIncludeRecords(event.target.checked)} />{text.consent}</label>
      {seed.documentId && <p className="break-all text-xs text-muted">{text.selectedDocument}: {seed.documentId}</p>}
      {seed.contractorId && <p className="break-words text-xs text-muted">{text.contractorBalance}: {seed.contractorName ?? seed.contractorId}</p>}
      <Button variant="ghost" href={settingsLink}>{text.settings}</Button>
      {blocked && <><Button variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)}>{text.history}</Button>
        {historyOpen && <label className="block text-sm">{text.history}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-panel px-3" value={conversationId ?? ''} disabled={busy} onChange={(event) => void loadConversation(event.target.value)}>
          <option value="">{text.newConversation}</option>{history.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
        </select></label>}</>}
    </div>}
    {blocked && <div className="min-h-0 flex-1 overflow-y-auto">
      <section aria-labelledby="advisor-blocker-reason" className="m-4 rounded-card border border-outline border-l-[3px] border-l-warning-ink bg-surface-raised p-4">
        <h3 id="advisor-blocker-reason" className="break-words text-sm font-semibold leading-[1.45]">{blocked.reason}</h3>
        <p className="mb-3.5 mt-1.5 text-sm leading-normal text-foreground-secondary">{blocked.owner}</p>
        <a href={settingsLink} className="flex min-h-11 items-center justify-between gap-2.5 rounded-control border border-outline-control bg-surface-panel px-3 py-2 text-[13px] font-semibold text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          <span className="min-w-0 break-words">{text.blocked.settings}</span><span aria-hidden="true">→</span>
        </a>
      </section>
    </div>}
    {blocked && <div className="shrink-0 border-t border-outline bg-surface-panel p-4 max-sm:pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div className="space-y-2 rounded-card border border-outline-strong bg-surface-raised p-2.5">
        <textarea aria-label={text.blocked.question} rows={2} className="block h-[58px] w-full resize-none border-0 bg-transparent p-0 text-[13px] leading-normal text-foreground-disabled placeholder:text-foreground-disabled" placeholder={text.blocked.placeholder} disabled />
        <div className="flex justify-end"><Button variant="secondary" disabled className="border border-outline-strong bg-surface-panel px-4 text-foreground-disabled">{text.send}</Button></div>
      </div>
      <p id="advisor-blocker-hint" className="mt-2 text-[13px] leading-normal text-muted">{blocked.hint}</p>
    </div>}
    {!blocked && <>
    {error && <p role="alert" className="rounded-inset border border-error-ink bg-error p-3 text-sm text-error-ink">{error}</p>}
    {!settings && !error && <p role="status">{text.loading}</p>}
    {settings && <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)}>{text.history}</Button>
        {conversationId && <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(text.deleteConfirm)) void advisorRequest(companyId, `/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE', headers: environmentHeaders }).then(() => { setConversationId(null); setTurns([]); }).catch((failure: unknown) => setError(advisorErrorMessage(failure))); }}>{text.deleteConversation}</Button>}
      </div>
      {historyOpen && <label id="advisor-history" className="block text-sm">{text.history}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3" value={conversationId ?? ''} disabled={busy} onChange={(event) => void loadConversation(event.target.value)}>
        <option value="">{text.newConversation}</option>{history.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select></label>}
      {!turns.length && <div className="space-y-3"><p className="text-sm text-muted">{text.intro}</p><Button variant="secondary" onClick={() => setQuestion(text.briefingQuestion)}>{text.briefing}</Button></div>}
      {turns.map((turn) => <div key={turn.id} className="space-y-3"><p className="ml-8 rounded-card bg-surface-raised p-3 text-sm">{turn.question}</p>{turn.answer ? <AdvisorAnswerCard answer={turn.answer} /> : <p className="text-sm text-muted">{turn.status === 'PENDING' ? text.loading : text.failed}</p>}</div>)}
      {!settings.reviewedSourceCount && <p className="rounded-inset bg-surface-raised p-3 text-xs text-muted">{text.sourceMissing}</p>}
    </>}
    <p className="text-xs leading-relaxed text-muted">{text.privacy} {text.readOnly}</p>
    {settings && <form className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-outline bg-surface-panel px-4 pb-4 pt-3" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}>
      <p className="text-xs text-muted">{includeRecords ? text.disclosure : text.generalDisclosure}</p>
      <label className="sr-only" htmlFor="advisor-question">{text.question}</label>
      <div className="flex items-end gap-2">
        <textarea id="advisor-question" rows={2} className="min-h-12 w-full resize-none rounded-control border border-outline-control bg-surface-raised p-3 text-base focus-visible:outline-primary" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={text.placeholder} maxLength={4000} required disabled={busy} />
        <Button type="submit" disabled={busy}>{text.send}</Button>
        {busy && <Button variant="secondary" onClick={() => requestController.current?.abort()}>{text.cancel}</Button>}
      </div>
      {busy && <p role="status" className="text-sm text-muted">{progress}</p>}
    </form>}
    </>}
  </div>;
}
