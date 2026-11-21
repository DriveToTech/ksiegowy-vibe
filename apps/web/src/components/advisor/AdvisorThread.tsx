'use client';

import type { ReactNode } from 'react';
import type { AdvisorProvider, AdvisorTurn } from '../../lib/advisor-api';
import { advisorErrorMessage } from '../../lib/advisor-api';
import type { AdvisorConversationBlocker } from '../../lib/advisor-connection-status';
import { advisorErrorRecovery, advisorRetryRemainingSeconds, type AdvisorConversationPhase } from '../../lib/advisor-conversation-lifecycle';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { AdvisorAnswerCard } from './AdvisorAnswerCard';

const settingsLink = '/dashboard/settings?section=advisor';
const cardClassName = 'rounded-inset border border-outline border-l-[3px] bg-surface-raised p-4';
export const advisorNoteClassName = 'm-0 rounded-inset border-l-[3px] bg-surface-raised px-3 py-2.5 text-[12.5px] leading-normal text-foreground-secondary';
/** Secondary buttons inside the advisor are 13/500 with a control border; scoped here so other pages keep the shared Button look. */
export const advisorSecondaryButtonClassName = 'border border-outline-control text-[13px]! font-medium!';
const fineClassName = 'm-0 text-xs leading-normal text-muted';
const settingsActionClassName = 'flex min-h-11 flex-1 items-center justify-between gap-2.5 rounded-control border border-outline-control bg-surface-panel px-3 py-2 text-[13px] font-semibold text-primary no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export interface AdvisorThreadProps {
  phase: AdvisorConversationPhase;
  turns: AdvisorTurn[];
  historicalTurnIds: string[];
  provider: AdvisorProvider;
  blocker: AdvisorConversationBlocker | null;
  settingsLoadFailed: boolean;
  /** Empty-state header (period briefing card on the full page), shown before the intro. */
  emptyHeader?: ReactNode;
  seedIntro: 'document' | 'contractor' | 'briefing' | null;
  /** Reference of a seed the user declined to attach; shows the "without company data" notice. */
  seedWithoutReference: string | null;
  /** Elapsed seconds of the current request, driven by the orchestrator's one-second clock. */
  elapsedSeconds: number;
  now: number;
  historyAvailable: boolean;
  onPreset: (question: string) => void;
  onFollowUp: () => void;
  onRetry: () => void;
  onNewConversation: () => void;
  onOpenHistory: () => void;
  onAskAboutRecords: () => void;
  onChangeMonth: () => void;
}

function formatClock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

const chevron = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 flex-none text-muted"><path d="M9 6l6 6-6 6" /></svg>;

const formatTime = (timestamp: number | string) => new Date(timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

function Bubble({ question, time }: { question: string; time?: string }) {
  return <>
    <p className="m-0 max-w-[86%] self-end break-words rounded-[12px_12px_4px_12px] border border-outline bg-surface-raised px-[13px] py-2.5 text-[13.5px] leading-normal">{question}</p>
    {time && <span className="-mt-2 self-end font-mono text-[10.5px] text-muted">{text.conversationStates.you(time)}</span>}
  </>;
}

function ErrorCard({ title, body, children, identifier }: { title: string; body?: string; children?: ReactNode; identifier: string }) {
  return <section role="alert" aria-labelledby={identifier} className={cn(cardClassName, 'border-l-error-ink')}>
    <h3 id={identifier} className="m-0 break-words text-sm font-semibold leading-[1.45]">{title}</h3>
    {body && <p className="mb-0 mt-1.5 text-[13.5px] leading-normal text-foreground-secondary">{body}</p>}
    {children && <div className="mt-3.5 flex flex-wrap items-center gap-2">{children}</div>}
  </section>;
}

export function AdvisorThread(props: AdvisorThreadProps) {
  const { phase, turns, provider, blocker } = props;
  const providerName = text.providers[provider];

  if (blocker) {
    const reason = blocker === 'provider' || blocker === 'connection' ? text.blocked[blocker](providerName) : text.blocked[blocker];
    return <section aria-labelledby="advisor-blocker-reason" className={cn(cardClassName, 'border-l-warning-ink')}>
      <h3 id="advisor-blocker-reason" className="m-0 break-words text-sm font-semibold leading-[1.45]">{reason.reason}</h3>
      <p className="mb-3.5 mt-1.5 text-[13.5px] leading-normal text-foreground-secondary">{reason.owner}</p>
      <a href={settingsLink} className={settingsActionClassName}><span className="min-w-0 break-words">{text.blocked.settings}</span><span aria-hidden="true">→</span></a>
    </section>;
  }
  if (phase.phase === 'revoked') {
    const revoked = text.conversationStates.accessRevoked;
    return <ErrorCard identifier="advisor-revoked" title={revoked.title} body={revoked.body}><a href="/dashboard" className={settingsActionClassName}><span>{revoked.action}</span><span aria-hidden="true">→</span></a></ErrorCard>;
  }
  if (props.settingsLoadFailed) {
    return <ErrorCard identifier="advisor-load-failed" title={text.conversationStates.loadFailed.title} body={text.conversationStates.loadFailed.body} />;
  }
  if (phase.phase === 'loading') return <p role="status" className="m-0 text-[13.5px] text-muted">{text.loading}</p>;

  const lastTurn = turns.at(-1);
  const hasActiveRequest = phase.phase === 'sending' || phase.phase === 'waiting';
  const showEmpty = !turns.length && !hasActiveRequest && phase.phase !== 'cancelled' && phase.phase !== 'failed';

  return <>
    {showEmpty && <EmptyThread {...props} />}
    {turns.map((turn) => <div key={turn.id} className="flex flex-col gap-3.5">
      <Bubble question={turn.question} time={formatTime(turn.createdAt)} />
      {turn.answer
        ? <AdvisorAnswerCard answer={turn.answer} fromHistory={props.historicalTurnIds.includes(turn.id)} onFollowUp={props.onFollowUp} />
        : <p className={cn(advisorNoteClassName, 'border-l-warning-ink')}>{turn.status === 'PENDING' ? text.errors.REQUEST_IN_PROGRESS : text.failed}</p>}
      {turn === lastTurn && turn.answer?.status === 'insufficient_evidence' && <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className={advisorSecondaryButtonClassName} onClick={props.onAskAboutRecords}>{text.conversationStates.insufficientActions.askRecords}</Button>
        <Button variant="ghost" onClick={props.onChangeMonth}>{text.conversationStates.insufficientActions.changeMonth}</Button>
      </div>}
    </div>)}
    {phase.phase === 'sending' && <>
      <Bubble question={phase.question} time={formatTime(phase.startedAt)} />
      <div aria-busy="true" aria-label={text.conversationStates.loadingLabel} className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-4">
        <span className="block h-2.5 w-[30%] rounded-md bg-skeleton" /><span className="block h-14 rounded-inset bg-skeleton" />
        <span className="block h-3 w-[92%] rounded-md bg-skeleton" /><span className="block h-3 w-[78%] rounded-md bg-skeleton" />
        <div className="grid grid-cols-2 gap-2"><span className="block h-14 rounded-inset bg-skeleton" /><span className="block h-14 rounded-inset bg-skeleton" /></div>
      </div>
    </>}
    {phase.phase === 'waiting' && <>
      <Bubble question={phase.question} time={formatTime(phase.startedAt)} />
      <div role="status" aria-live="polite" className="flex flex-col gap-2.5 rounded-inset border border-outline bg-surface-raised p-3.5">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span aria-hidden="true" className="size-2 flex-none rounded-full bg-primary shadow-[0_0_0_4px_var(--primary-soft)] motion-safe:animate-pulse" />
          <span>{text.conversationStates.waiting}</span>
          <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] text-muted">{text.conversationStates.elapsed(formatClock(Math.min(props.elapsedSeconds, 60)), formatClock(60))}</span>
        </div>
        <div className="h-[3px] overflow-hidden rounded-full bg-outline-strong"><i className="block h-full rounded-full bg-[image:var(--brand-gradient)] motion-safe:transition-[width]" style={{ width: `${Math.min(100, (props.elapsedSeconds / 60) * 100)}%` }} /></div>
        <p className={fineClassName}>{text.conversationStates.waitingNote}</p>
      </div>
    </>}
    {phase.phase === 'cancelled' && <>
      <Bubble question={phase.question} time={formatTime(phase.startedAt)} />
      <p role="status" className={cn(advisorNoteClassName, 'border-l-warning-ink')}><strong className="font-semibold text-foreground">{text.conversationStates.cancelledTitle}</strong> {text.conversationStates.cancelledBody}</p>
    </>}
    {phase.phase === 'failed' && <>
      <Bubble question={phase.question} time={formatTime(phase.startedAt)} />
      <FailureCard {...props} failed={phase} />
    </>}
  </>;
}

function EmptyThread({ emptyHeader, seedIntro, seedWithoutReference, onPreset }: AdvisorThreadProps) {
  if (seedWithoutReference) return <p role="status" className={cn(advisorNoteClassName, 'border-l-primary')}>{text.composer.seed.withoutNotice(seedWithoutReference)}</p>;
  if (seedIntro) return <p className="m-0 text-[13.5px] leading-[1.55] text-foreground-secondary">{text.composer.seed[`${seedIntro}Ready`]}</p>;
  if (emptyHeader) return <>
    {emptyHeader}
    <p className="m-0 text-[13.5px] leading-[1.55] text-foreground-secondary">{text.briefingCard.pageIntro}</p>
  </>;
  const { presets } = text.conversationStates;
  return <>
    <p className="m-0 text-[13.5px] leading-[1.55] text-foreground-secondary">{text.intro}</p>
    <div className="flex flex-col gap-2">
      {[{ title: presets.summary.title, description: presets.summary.description, question: text.briefingQuestion }, { title: presets.review, question: presets.review }, { title: presets.rejected, question: presets.rejected }].map((preset) => <button key={preset.title} type="button" onClick={() => onPreset(preset.question)}
        className="flex min-h-11 items-center justify-between gap-2.5 rounded-inset border border-outline bg-surface-raised px-3 py-2.5 text-left text-[13px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <span>{preset.title}{'description' in preset && <small className="block text-xs text-muted">{preset.description}</small>}</span>{chevron}
      </button>)}
    </div>
    <p className={fineClassName}>{text.conversationStates.presetsHint}</p>
    <p className={cn(fineClassName, 'mt-auto')}>{text.conversationStates.privacyAndReadOnly}</p>
  </>;
}

function FailureCard(props: AdvisorThreadProps & { failed: Extract<AdvisorConversationPhase, { phase: 'failed' }> }) {
  const { failed } = props;
  const { recovery, retryable } = advisorErrorRecovery(failed.code);
  const providerName = text.providers[props.provider];
  const cards = text.errorCards;
  // Notes in the composer live region replace the card; the draft and month are kept.
  if (recovery === 'composerNote') return null;

  const copy = failed.code === 'PROVIDER_INVALID_CREDENTIALS' || failed.code === 'PROVIDER_ERROR'
    ? { title: failed.code === 'PROVIDER_ERROR' ? advisorErrorMessage({ code: failed.code }) : cards.PROVIDER_INVALID_CREDENTIALS.title(providerName), body: cards.PROVIDER_INVALID_CREDENTIALS.body }
    : failed.code === 'PROVIDER_QUOTA_EXCEEDED' ? { title: cards.PROVIDER_QUOTA_EXCEEDED.title, body: cards.PROVIDER_QUOTA_EXCEEDED.body(providerName) }
    : failed.code === 'RATE_LIMITED' ? cards.RATE_LIMITED
    : failed.code === 'INVALID_ANSWER' || failed.code === 'INVALID_CITATION' ? cards.malformed
    : retryable ? { title: failed.code === 'PROVIDER_UNAVAILABLE' ? cards.PROVIDER_UNAVAILABLE.title : advisorErrorMessage({ code: failed.code }), body: cards.PROVIDER_UNAVAILABLE.body }
    : { title: advisorErrorMessage({ code: failed.code }), body: undefined };
  const remainingSeconds = advisorRetryRemainingSeconds(failed, props.now);

  return <ErrorCard identifier="advisor-error-title" title={copy.title} body={copy.body}>
    {retryable && <>
      <Button variant="secondary" className={advisorSecondaryButtonClassName} aria-disabled={remainingSeconds > 0 || undefined} disabled={remainingSeconds > 0} onClick={props.onRetry}>{cards.retry}</Button>
      {remainingSeconds > 0 && <span className="text-xs text-muted">{cards.retryAfter(remainingSeconds)}</span>}
    </>}
    {recovery === 'settings' && <a href={settingsLink} className={settingsActionClassName}><span>{cards.openSettings}</span><span aria-hidden="true">→</span></a>}
    {recovery === 'billing' && <Button variant="ghost" href={settingsLink}>{cards.settingsLink}</Button>}
    {recovery === 'newConversation' && <>
      <Button variant="secondary" className={advisorSecondaryButtonClassName} onClick={props.onNewConversation}>{text.newConversation}</Button>
      {failed.code === 'HISTORY_LIMIT' && props.historyAvailable && <Button variant="ghost" onClick={props.onOpenHistory}>{text.history}</Button>}
    </>}
  </ErrorCard>;
}
