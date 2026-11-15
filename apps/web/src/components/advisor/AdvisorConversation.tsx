'use client';

import { useCallback, useEffect, useReducer, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { advisorErrorCode, advisorErrorMessage, advisorRequest, readAdvisorSettings, streamAdvisorAnswer, type AdvisorConversationDetail, type AdvisorConversationSummary, type AdvisorEnvironment, type AdvisorProvider, type AdvisorScope, type AdvisorSettings as Settings, type AdvisorTurn } from '../../lib/advisor-api';
import { advisorConversationBlocker } from '../../lib/advisor-connection-status';
import { advisorConversationReducer, advisorErrorRecovery, advisorWaitProgress } from '../../lib/advisor-conversation-lifecycle';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { AdvisorComposer, type AdvisorComposerSeed } from './AdvisorComposer';
import { AdvisorPanelHeader, type AdvisorPlacement } from './AdvisorPanelHeader';
import { AdvisorThread, advisorNoteClassName } from './AdvisorThread';

export interface AdvisorConversationSeed {
  question: string; documentId?: string; documentKind?: 'outgoing' | 'incoming'; contractorId?: string; contractorName?: string; period?: string;
  /** Human-readable document number or contractor name shown in the context row and the seed fieldset. */
  reference?: string; briefing?: boolean; revision: number;
}

/** Props contract of the history view (same shape as `AdvisorHistory` props). */
export interface AdvisorHistoryViewProps {
  companyId: string;
  environment: AdvisorEnvironment;
  layout: 'panel' | 'column';
  currentConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNew: () => void;
  onDeleted: (conversationId: string) => void;
}

interface AdvisorConversationProps {
  companyId: string; environment: AdvisorEnvironment; active: boolean; seed: AdvisorConversationSeed;
  variant: AdvisorPlacement | 'page';
  /** Page variant: rendered as the first item of the empty conversation body (the period briefing card). */
  emptyHeader?: ReactNode;
  onClose?: () => void;
  onRequestInFlightChange?: (inFlight: boolean) => void;
  /** Page variant: the history column opens a conversation (`id`) or starts a new one (`null`) by bumping `revision`. */
  openRequest?: { id: string | null; revision: number };
  onConversationChange?: (conversationId: string | null) => void;
  /** Provided by the history feature (`AdvisorHistory`). The History button and the history view exist only when this is set. */
  HistoryView?: ComponentType<AdvisorHistoryViewProps>;
}

const readClock = () => Date.now();
const currentMonth = () => new Date().toISOString().slice(0, 7);
const textareaFocus = (element: HTMLTextAreaElement | null) => requestAnimationFrame(() => element?.focus());

export function AdvisorConversation({ companyId, environment, active, seed, variant, emptyHeader, onClose, onRequestInFlightChange, openRequest, onConversationChange, HistoryView }: AdvisorConversationProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsLoadFailed, setSettingsLoadFailed] = useState(false);
  const [provider, setProvider] = useState<AdvisorProvider>('OPENROUTER');
  const providerSelected = useRef(false);
  const [phase, dispatch] = useReducer(advisorConversationReducer, { phase: 'loading' });
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<AdvisorTurn[]>([]);
  const [historicalTurnIds, setHistoricalTurnIds] = useState<string[]>([]);
  const [view, setView] = useState<'conversation' | 'history'>('conversation');
  const [question, setQuestion] = useState(seed.question);
  const [seedRevision, setSeedRevision] = useState(seed.revision);
  const [seedChoice, setSeedChoice] = useState<'include' | 'without' | null>(null);
  const [period, setPeriod] = useState(seed.period ?? currentMonth());
  const [editingPeriod, setEditingPeriod] = useState(false);
  const [questionKind, setQuestionKind] = useState<'records' | 'tax'>('records');
  const [kindResetNotice, setKindResetNotice] = useState(false);
  const [includeRecords, setIncludeRecords] = useState(false);
  const [replyTo, setReplyTo] = useState<{ turnId: string; label: string } | null>(null);
  const [now, setNow] = useState(0);
  const requestController = useRef<AbortController | null>(null);
  const historyController = useRef<AbortController | null>(null);
  const watchdogFired = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const environmentHeaders = { 'x-ksef-environment': environment };

  const refreshSettings = useCallback(() => {
    const controller = new AbortController();
    void readAdvisorSettings(companyId, controller.signal, period).then((result) => {
      if (controller.signal.aborted) return;
      setSettings(result);
      setSettingsLoadFailed(false);
      if (!providerSelected.current) {
        providerSelected.current = true;
        setProvider(result.connections[0]?.provider ?? result.allowedProviders[0] ?? 'OPENROUTER');
      }
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (advisorErrorCode(failure) === 'ACCESS_DENIED') dispatch({ type: 'failed', code: 'ACCESS_DENIED', now: readClock() });
      else setSettingsLoadFailed(true);
    });
    return () => controller.abort();
  }, [companyId, period]);

  useEffect(() => { if (active) return refreshSettings(); }, [active, refreshSettings]);

  const { blocker, untested } = settings ? advisorConversationBlocker(settings, provider) : { blocker: null, untested: false };
  // Coverage is per period, not topic: a covered period can still fail with TAX_SOURCES_UNAVAILABLE on Send. Unknown coverage never blocks.
  const taxUnavailable = settings?.taxSourceCoverage?.period === period && settings.taxSourceCoverage.covered === false;
  const busy = phase.phase === 'sending' || phase.phase === 'waiting' ? phase.phase : false;
  const seedKind = seed.briefing ? 'briefing' : seed.documentId ? 'document' : seed.contractorId ? 'contractor' : null;
  const seedLabel = seed.reference ?? seed.contractorName ?? period;
  const seedActive = seedKind !== null && seedChoice !== 'without';
  const revoked = phase.phase === 'revoked';

  // Derived state is adjusted during render (react.dev "adjusting state on prop change"), not in effects.
  if (!taxUnavailable && kindResetNotice) setKindResetNotice(false);
  if (taxUnavailable && questionKind === 'tax') { setQuestionKind('records'); setKindResetNotice(true); }
  if (seedRevision !== seed.revision) {
    setSeedRevision(seed.revision);
    setSeedChoice(null);
    if (seed.question) setQuestion(seed.question);
    if (seed.period) setPeriod(seed.period);
    if (seedKind) { setConversationId(null); setTurns([]); setHistoricalTurnIds([]); setReplyTo(null); setIncludeRecords(false); setQuestionKind('records'); dispatch({ type: 'reset' }); }
  }
  // Revocation removes the thread, history and draft from state so none of it stays in the DOM.
  if (revoked && (turns.length || question || conversationId || view === 'history')) {
    setTurns([]); setHistoricalTurnIds([]); setQuestion(''); setConversationId(null); setReplyTo(null); setView('conversation');
  }

  useEffect(() => { if (settings) dispatch({ type: 'settingsLoaded', blocked: blocker !== null }); }, [settings, blocker]);
  useEffect(() => { onConversationChange?.(conversationId); }, [conversationId, onConversationChange]);
  useEffect(() => {
    if (!openRequest?.revision) return;
    if (openRequest.id) void loadConversation(openRequest.id); else startNewConversation();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a new request only
  }, [openRequest?.revision]);
  useEffect(() => { if (seedKind) requestController.current?.abort(); }, [seed.revision, seedKind]);
  useEffect(() => {
    if (!active) { requestController.current?.abort(); historyController.current?.abort(); }
    return () => { requestController.current?.abort(); historyController.current?.abort(); };
  }, [active]);
  useEffect(() => {
    onRequestInFlightChange?.(busy !== false);
    return () => onRequestInFlightChange?.(false);
  }, [busy, onRequestInFlightChange]);

  // One-second clock for the wait timer, the stuck-stream watchdog and the retry countdown.
  const clockNeeded = busy !== false || (phase.phase === 'failed' && Boolean(phase.retryAfterSeconds));
  useEffect(() => {
    if (!clockNeeded) return;
    const timer = setInterval(() => {
      setNow(readClock());
      if (phase.phase !== 'sending' && phase.phase !== 'waiting') return;
      if (!advisorWaitProgress(phase.startedAt, readClock()).watchdogExpired) return;
      watchdogFired.current = true;
      requestController.current?.abort();
    }, 1000);
    return () => clearInterval(timer);
  }, [clockNeeded, phase]);

  // Keeps the newest answer, alert or status in view with its top 64px below the body edge (artboard); empty and seed states stay put.
  useEffect(() => {
    const body = bodyRef.current;
    const latest = body && Array.from(body.querySelectorAll<HTMLElement>('article, [role="alert"], [role="status"]')).at(-1);
    if (!body || !latest || body.scrollHeight <= body.clientHeight) return;
    body.scrollTop = Math.max(0, latest.offsetTop - body.offsetTop - 64);
  }, [turns.length, phase.phase]);
  useEffect(() => { if (phase.phase === 'cancelled') textareaFocus(textareaRef.current); }, [phase.phase]);

  function startNewConversation(options?: { stayInHistory?: boolean }) {
    requestController.current?.abort(); historyController.current?.abort();
    setConversationId(null); setTurns([]); setHistoricalTurnIds([]); setReplyTo(null); setQuestion('');
    dispatch({ type: 'reset' });
    if (!options?.stayInHistory) setView('conversation');
  }

  async function loadConversation(identifier: string) {
    requestController.current?.abort(); historyController.current?.abort();
    setConversationId(identifier); setTurns([]); setHistoricalTurnIds([]); setReplyTo(null); setView('conversation');
    dispatch({ type: 'reset' });
    const controller = new AbortController(); historyController.current = controller;
    await advisorRequest<AdvisorConversationDetail>(companyId, `/conversations/${encodeURIComponent(identifier)}`, { headers: environmentHeaders, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setTurns(result.turns); setHistoricalTurnIds(result.turns.map((turn) => turn.id));
        providerSelected.current = true; setProvider(result.provider);
      })
      .catch((failure: unknown) => { if (!controller.signal.aborted) dispatch({ type: 'failed', code: advisorErrorCode(failure), now: readClock() }); });
  }

  async function sendQuestion() {
    const submittedQuestion = question.trim();
    if (!settings || blocker || busy || !submittedQuestion || (seedActive && !seedChoice)) return;
    const controller = new AbortController(); requestController.current = controller; watchdogFired.current = false;
    const requestId = crypto.randomUUID();
    const startedAt = readClock();
    const replyToTurnId = replyTo?.turnId;
    const recordsIncluded = seedKind ? seedChoice === 'include' : includeRecords;
    const scope: AdvisorScope = { questionKind, period, includeRecords: recordsIncluded,
      ...(seed.documentId && seed.documentKind && recordsIncluded ? { documentId: seed.documentId, documentKind: seed.documentKind } : {}),
      ...(seed.contractorId && recordsIncluded ? { contractorId: seed.contractorId } : {}) };
    setNow(startedAt); setQuestion(''); setKindResetNotice(false); setEditingPeriod(false);
    dispatch({ type: 'send', requestId, question: submittedQuestion, now: startedAt });

    await Promise.resolve().then(async () => {
      const conversation = conversationId ? { id: conversationId } : await advisorRequest<AdvisorConversationSummary>(companyId, '/conversations', {
        method: 'POST', headers: environmentHeaders, signal: controller.signal, body: JSON.stringify({ provider, title: submittedQuestion.slice(0, 120) }),
      });
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      setConversationId(conversation.id);
      const answer = await streamAdvisorAnswer(companyId, environment, conversation.id, { question: submittedQuestion, requestId, scope, ...(replyToTurnId ? { replyToTurnId } : {}) },
        controller.signal, () => dispatch({ type: 'statusReceived' }));
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const turn: AdvisorTurn = { id: requestId, question: submittedQuestion, status: 'COMPLETED', answer, replyToTurnId: replyToTurnId ?? null, createdAt: new Date().toISOString() };
      setTurns((current) => [...current, turn]);
      setReplyTo(null); setIncludeRecords(false);
      dispatch({ type: 'answered', turnId: requestId, status: answer.status });
      if (answer.status !== 'needs_clarification') return;
      // The reply target is the server turn id, which the stream does not carry. Without it the chip is simply not offered.
      await advisorRequest<AdvisorConversationDetail>(companyId, `/conversations/${encodeURIComponent(conversation.id)}`, { headers: environmentHeaders, signal: controller.signal })
        .then((detail) => {
          const target = detail.turns.at(-1);
          if (!target) return;
          setTurns(detail.turns);
          setReplyTo({ turnId: target.id, label: (answer.questions[0] ?? answer.shortAnswer).slice(0, 80) });
          textareaFocus(textareaRef.current);
        }).catch(() => undefined);
    }).catch((failure: unknown) => {
      setQuestion(submittedQuestion);
      if (advisorErrorCode(failure) === 'INVALID_REPLY') setReplyTo(null);
      if (controller.signal.aborted && !watchdogFired.current) { dispatch({ type: 'cancelled' }); return; }
      const code = watchdogFired.current ? 'REQUEST_INTERRUPTED' : advisorErrorCode(failure);
      const retryAfterSeconds = typeof failure === 'object' && failure !== null && 'retryAfterSeconds' in failure && typeof failure.retryAfterSeconds === 'number' ? failure.retryAfterSeconds : undefined;
      setNow(readClock());
      dispatch({ type: 'failed', code, retryAfterSeconds, now: readClock() });
      if (advisorErrorRecovery(code).recovery === 'refreshSettings') refreshSettings();
    });
  }

  const providerName = text.providers[provider];
  const blockerHint = revoked ? text.conversationStates.accessRevoked.hint
    : blocker === 'provider' || blocker === 'connection' ? text.blocked[blocker](providerName).hint
    : blocker ? text.blocked[blocker].hint : null;
  const failedCode = phase.phase === 'failed' ? phase.code : null;
  const composerNote = failedCode && advisorErrorRecovery(failedCode).recovery === 'composerNote'
    ? failedCode === 'TAX_SOURCES_UNAVAILABLE' ? <p className={cn(advisorNoteClassName, 'border-l-warning-ink')}>{text.composer.sourceMissing(period)} <strong className="font-semibold text-foreground">{text.composer.sourceMissingActions}</strong></p>
      : failedCode === 'RECORDS_UNAVAILABLE' ? <p className={cn(advisorNoteClassName, 'border-l-warning-ink')}>{text.composer.recordsUnavailable(period)} <button type="button" onClick={() => setEditingPeriod(true)} className="inline-flex min-h-11 items-center px-1 align-middle text-[12.5px] font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text.composer.changeMonth}</button></p>
      : <p className={cn(advisorNoteClassName, 'border-l-warning-ink')}>{advisorErrorMessage({ code: failedCode })}</p>
    : null;
  const note = <>
    {taxUnavailable && <p className={cn(advisorNoteClassName, 'border-l-warning-ink')}>{text.taxUnavailableForPeriod}{kindResetNotice && <> <strong className="font-semibold text-foreground">{text.taxKindReset}</strong></>}</p>}
    {seedKind === 'contractor' && seedActive && <p className={cn(advisorNoteClassName, 'border-l-primary')}>{text.composer.seed.contractorNote(period)}</p>}
    {composerNote}
  </>;

  const seedFieldset: AdvisorComposerSeed | null = !seedKind || seedChoice === 'without' ? null : {
    kindLabel: seedKind === 'document' ? text.composer.seed.selectedDocument : seedKind === 'contractor' ? text.composer.seed.contractorBalance : text.composer.seed.periodBriefing,
    label: seedLabel,
    subject: text.composer.seed[seedKind === 'document' ? 'subjectDocument' : seedKind === 'contractor' ? 'subjectContractor' : 'subjectBriefing'],
    includeLabel: text.composer.seed[seedKind === 'document' ? 'includeDocument' : seedKind === 'contractor' ? 'includeContractor' : 'includeBriefing'](period),
    choice: seedChoice,
    onChoose: (choice) => {
      setSeedChoice(choice);
      if (choice === 'include') return;
      // Declining company data drops the seeded question so nothing about the document is sent by accident.
      setQuestion(''); setIncludeRecords(false); textareaFocus(textareaRef.current);
    },
  };
  const contextReference = seedActive ? seed.reference ?? seed.contractorName : undefined;
  const staticContext = Boolean(blocker) || revoked || view === 'history';
  const sheet = variant === 'sheet';
  const pageColumn = variant === 'page' ? 'w-full max-w-[760px] self-center' : undefined;

  return <div className="flex min-h-0 flex-1 flex-col">
    {variant !== 'page' && onClose && <AdvisorPanelHeader placement={variant} view={view} historyAvailable={Boolean(HistoryView) && !revoked} onOpenHistory={() => setView('history')} onBack={() => setView('conversation')} onClose={onClose} />}
    <div className={cn('flex flex-none flex-wrap items-center gap-x-2 border-b border-outline', staticContext ? 'min-h-[38px] px-4 py-2' : 'min-h-11 pl-4 pr-2')}>
      <p className="m-0 flex min-w-0 flex-1 flex-wrap items-center gap-x-[7px] gap-y-1 font-mono text-[11px] leading-normal text-muted">
        <span>{providerName}</span><span aria-hidden="true">·</span>
        <span className={environment === 'TEST' ? 'text-warning-ink' : undefined}>{environment}</span><span aria-hidden="true">·</span>
        <span>{period}</span>
        {contextReference && <><span aria-hidden="true">·</span><span className="text-foreground">{contextReference}</span></>}
      </p>
      {!staticContext && <button type="button" aria-expanded={editingPeriod && !busy} aria-controls="advisor-context-fields" onClick={() => setEditingPeriod((editing) => !editing)}
        className="inline-flex min-h-11 items-center rounded-control px-2.5 text-[12.5px] font-medium text-primary hover:bg-secondary-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text.contextChange}</button>}
      <div id="advisor-context-fields" hidden={staticContext || !editingPeriod || Boolean(busy)} className="basis-full pb-1 pr-2">
        <label className="flex min-h-11 items-center gap-2 text-[13px]">{text.period}
          <input type="month" value={period} onChange={(event) => { if (!event.target.value) return; setPeriod(event.target.value); setSeedChoice(null); }}
            className="min-h-11 rounded-control border border-outline-control bg-surface-panel px-2 font-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" />
        </label>
      </div>
    </div>
    {view === 'history' && HistoryView
      ? <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <HistoryView companyId={companyId} environment={environment} layout="panel" currentConversationId={conversationId}
          onSelect={(identifier) => void loadConversation(identifier)} onNew={() => startNewConversation()}
          onDeleted={(identifier) => { if (identifier === conversationId) startNewConversation({ stayInHistory: true }); }} />
      </div>
      : <>
        <div ref={bodyRef} className={cn('flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto p-4', pageColumn)}>
          <AdvisorThread phase={phase} turns={turns} historicalTurnIds={historicalTurnIds} provider={provider} blocker={revoked ? null : blocker} settingsLoadFailed={settingsLoadFailed}
            emptyHeader={emptyHeader} seedIntro={seedActive && !turns.length ? seedKind : null} seedWithoutReference={seedKind && seedChoice === 'without' && !turns.length ? seedLabel : null}
            elapsedSeconds={phase.phase === 'sending' || phase.phase === 'waiting' ? advisorWaitProgress(phase.startedAt, now).elapsedSeconds : 0} now={now}
            historyAvailable={Boolean(HistoryView)}
            onPreset={(preset) => { setQuestion(preset); textareaFocus(textareaRef.current); }}
            onFollowUp={() => textareaFocus(textareaRef.current)} onRetry={() => void sendQuestion()}
            onNewConversation={() => startNewConversation()} onOpenHistory={() => setView('history')}
            onAskAboutRecords={() => { setQuestionKind('records'); textareaFocus(textareaRef.current); }} onChangeMonth={() => setEditingPeriod(true)} />
        </div>
        <div className={cn('flex-none', pageColumn)}><AdvisorComposer question={question} questionKind={questionKind} period={period} includeRecords={includeRecords} busy={busy ? (busy === 'sending' ? 'sending' : 'waiting') : false}
          blockerHint={blockerHint} untested={untested ? (provider === 'OLLAMA' ? 'ollama' : 'cloud') : null} taxUnavailable={taxUnavailable} note={note}
          seed={seedFieldset} hideConsent={seedKind !== null} placeholder={seedChoice === 'without' ? text.composer.generalPlaceholder : text.placeholder}
          replyTo={replyTo?.label ?? null} sheet={sheet} textareaRef={textareaRef}
          onQuestionChange={setQuestion} onQuestionKindChange={(kind) => { setQuestionKind(kind); setKindResetNotice(false); }} onIncludeRecordsChange={setIncludeRecords}
          onClearReplyTo={() => setReplyTo(null)} onSubmit={() => void sendQuestion()} onCancel={() => requestController.current?.abort()} /></div>
      </>}
  </div>;
}
