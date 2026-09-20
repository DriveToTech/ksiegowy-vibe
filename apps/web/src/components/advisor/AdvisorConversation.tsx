'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { advisorErrorMessage, advisorRequest, streamAdvisorAnswer, type AdvisorConversationDetail, type AdvisorConversationSummary, type AdvisorEnvironment, type AdvisorProvider, type AdvisorScope, type AdvisorSettings as Settings, type AdvisorTurn } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { Input } from '../atoms/Input';
import { AdvisorAnswerCard } from './AdvisorAnswerCard';
import { AdvisorSettings } from './AdvisorSettings';

export function AdvisorConversation({ companyId, environment, active, seed }: {
  companyId: string; environment: AdvisorEnvironment; active: boolean; seed: { question: string; documentId?: string; documentKind?: 'outgoing' | 'incoming'; period?: string; revision: number };
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [provider, setProvider] = useState<AdvisorProvider>('OPENROUTER');
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<AdvisorConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const [question, setQuestion] = useState(seed.question);
  const [seedRevision, setSeedRevision] = useState(seed.revision);
  const [period, setPeriod] = useState(seed.period ?? new Date().toISOString().slice(0, 7));
  const [questionKind, setQuestionKind] = useState<'records' | 'tax'>('records');
  const [includeRecords, setIncludeRecords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<string>(text.loading);
  const requestController = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const environmentHeaders = { 'x-ksef-environment': environment };
  const refreshSettings = useCallback(() => {
    const controller = new AbortController();
    void advisorRequest<Settings>(companyId, '/settings', { signal: controller.signal }).then((result) => {
      setSettings(result);
      setProvider((current) => result.connections.some((entry) => entry.provider === current) ? current : result.connections[0]?.provider ?? 'OPENROUTER');
    }).catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
    return () => controller.abort();
  }, [companyId]);

  useEffect(() => { if (active) return refreshSettings(); }, [active, refreshSettings]);
  if (seedRevision !== seed.revision) {
    setSeedRevision(seed.revision);
    if (seed.question) setQuestion(seed.question);
    if (seed.period) setPeriod(seed.period);
  }
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
      .then((result) => { if (!controller.signal.aborted) { setTurns(result.turns); setProvider(result.provider); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(advisorErrorMessage(failure)); });
  }

  async function sendQuestion() {
    if (busy || !question.trim()) return;
    const controller = new AbortController(); requestController.current = controller;
    setBusy(true); setError(''); setProgress(text.loading);
    const submittedQuestion = question.trim();
    const requestId = crypto.randomUUID();
    const scope: AdvisorScope = { questionKind, period, includeRecords,
      ...(seed.documentId && seed.documentKind && includeRecords ? { documentId: seed.documentId, documentKind: seed.documentKind } : {}) };
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

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-mono text-xs text-muted">{environment} · {period}</p><Button variant="ghost" onClick={() => setShowSettings(!showSettings)}>{text.settings}</Button></div>
    {showSettings && <AdvisorSettings companyId={companyId} onSaved={() => { refreshSettings(); setConversationId(null); setTurns([]); }} />}
    {error && <p role="alert" className="rounded-inset border border-error-ink bg-error p-3 text-sm text-error-ink">{error}</p>}
    {!settings && !error && <p role="status">{text.loading}</p>}
    {settings && (!settings.enabled || !settings.connections.length) && <div className="space-y-3 rounded-card bg-surface-raised p-4"><p className="text-sm">{settings.enabled ? text.errors.CONNECTION_REQUIRED : text.disabled}</p><Button onClick={() => setShowSettings(true)}>{text.settings}</Button></div>}
    {settings && <>
      <label className="block text-sm">{text.history}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3" value={conversationId ?? ''} disabled={busy} onChange={(event) => void loadConversation(event.target.value)}>
        <option value="">{text.newConversation}</option>{history.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
      </select></label>
      {conversationId && <Button variant="ghost" disabled={busy} onClick={() => { if (window.confirm(text.deleteConfirm)) void advisorRequest(companyId, `/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE', headers: environmentHeaders }).then(() => { setConversationId(null); setTurns([]); }).catch((failure: unknown) => setError(advisorErrorMessage(failure))); }}>{text.deleteConversation}</Button>}
      {!turns.length && <div className="space-y-3"><p className="text-sm text-muted">{text.intro}</p><Button variant="secondary" onClick={() => setQuestion(text.briefingQuestion)}>{text.briefing}</Button></div>}
      {turns.map((turn) => <div key={turn.id} className="space-y-3"><p className="ml-8 rounded-card bg-surface-raised p-3 text-sm">{turn.question}</p>{turn.answer ? <AdvisorAnswerCard answer={turn.answer} /> : <p className="text-sm text-muted">{turn.status === 'PENDING' ? text.loading : text.failed}</p>}</div>)}
      {!settings.reviewedSourceCount && <p className="rounded-inset bg-surface-raised p-3 text-xs text-muted">{text.sourceMissing}</p>}
      <form className="space-y-3 border-t border-outline pt-4" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">{text.provider}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-raised px-2" value={provider} disabled={busy || Boolean(conversationId)} onChange={(event) => setProvider(event.target.value as AdvisorProvider)}>
            {settings.connections.filter((entry) => settings.allowedProviders.includes(entry.provider)).map((entry) => <option key={entry.provider} value={entry.provider}>{text.providers[entry.provider]}</option>)}
          </select></label>
          <label className="text-sm">{text.period}<Input type="month" required value={period} onChange={(event) => setPeriod(event.target.value)} disabled={busy} /></label>
        </div>
        <label className="block text-sm">{text.question}<select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-raised px-3" value={questionKind} disabled={busy} onChange={(event) => setQuestionKind(event.target.value as 'records' | 'tax')}><option value="records">{text.records}</option><option value="tax">{text.tax}</option></select></label>
        {seed.documentId && <p className="break-all text-xs text-muted">{text.selectedDocument}: {seed.documentId}</p>}
        <label className="flex min-h-11 items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={includeRecords} disabled={busy} onChange={(event) => setIncludeRecords(event.target.checked)} />{text.consent}</label>
        <p className="text-xs text-muted">{includeRecords ? text.disclosure : text.generalDisclosure}</p>
        <label className="block text-sm">{text.question}<textarea className="mt-1 min-h-24 w-full resize-y rounded-control border border-outline-control bg-surface-raised p-3 text-base focus-visible:outline-primary" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={text.placeholder} maxLength={4000} required disabled={busy} /></label>
        <div className="flex gap-2"><Button type="submit" disabled={busy || !settings.enabled || !settings.allowedProviders.includes(provider) || !settings.connections.some((entry) => entry.provider === provider)}>{text.send}</Button>{busy && <Button variant="secondary" onClick={() => requestController.current?.abort()}>{text.cancel}</Button>}</div>
        {busy && <p role="status" className="text-sm text-muted">{progress}</p>}
      </form>
    </>}
    <p className="text-xs leading-relaxed text-muted">{text.privacy} {text.readOnly}</p>
  </div>;
}
