'use client';

import type { ReactNode, Ref } from 'react';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { advisorSecondaryButtonClassName } from './AdvisorThread';

export interface AdvisorComposerSeed {
  kindLabel: string;
  label: string;
  subject: string;
  includeLabel: string;
  choice: 'include' | 'without' | null;
  onChoose: (choice: 'include' | 'without') => void;
}

interface AdvisorComposerProps {
  question: string;
  questionKind: 'records' | 'tax';
  period: string;
  includeRecords: boolean;
  busy: false | 'sending' | 'waiting';
  /** Reason line of the single active blocker. Removes consent and kind, disables the field. */
  blockerHint: string | null;
  untested: 'cloud' | 'ollama' | null;
  taxUnavailable: boolean;
  /** Content of the always-mounted live region (`#advisor-tax-note`). */
  note: ReactNode;
  seed: AdvisorComposerSeed | null;
  /** Consent is hidden after the user chose "without company data" for a seed. */
  hideConsent: boolean;
  placeholder: string;
  replyTo: string | null;
  sheet: boolean;
  textareaRef: Ref<HTMLTextAreaElement>;
  onQuestionChange: (value: string) => void;
  onQuestionKindChange: (kind: 'records' | 'tax') => void;
  onIncludeRecordsChange: (value: boolean) => void;
  onClearReplyTo: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const kindChevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%237F86A2' stroke-width='2.4'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;
const iconProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function AdvisorComposer({ question, questionKind, period, includeRecords, busy, blockerHint, untested, taxUnavailable, note, seed, hideConsent, placeholder, replyTo, sheet, textareaRef, onQuestionChange, onQuestionKindChange, onIncludeRecordsChange, onClearReplyTo, onSubmit, onCancel }: AdvisorComposerProps) {
  const seedBlocksSend = Boolean(seed && !seed.choice);
  const sendDisabled = Boolean(blockerHint) || seedBlocksSend || !question.trim();
  const untestedLine = untested && !busy && !blockerHint ? (untested === 'ollama' ? text.composer.untestedOllama : text.composer.untestedCloud) : null;
  const sendDescription = seedBlocksSend ? 'advisor-seed-hint' : untestedLine ? 'advisor-untested' : blockerHint ? 'advisor-blocker-hint' : undefined;
  const fieldDisabled = Boolean(busy || blockerHint);

  return <form aria-label={text.blocked.question} noValidate
    className={cn('flex flex-none flex-col gap-2 border-t border-outline bg-surface-panel px-4 pb-4 pt-3', sheet && 'pb-[calc(24px+env(safe-area-inset-bottom))]')}
    onSubmit={(event) => { event.preventDefault(); if (!sendDisabled && !busy) onSubmit(); }}>
    <div id="advisor-tax-note" role="status" aria-live="polite">{note}</div>
    {seed && !blockerHint && <fieldset disabled={Boolean(busy)} className="m-0 flex min-w-0 flex-col gap-0.5 rounded-inset border border-primary-border bg-surface-raised px-3 pb-2 pt-2.5">
      <legend className="float-left w-full pb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{seed.kindLabel}: <b className="font-medium tracking-[0.04em] text-foreground">{seed.label}</b></legend>
      {(['include', 'without'] as const).map((choice) => <label key={choice} className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px]">
        <input type="radio" name="advisor-seed" {...(choice === 'include' ? { 'data-dialog-initial-focus': '' } : {})} className="m-0 mt-px size-[18px] flex-none accent-[var(--primary)]" checked={seed.choice === choice} onChange={() => seed.onChoose(choice)} />
        <span>{choice === 'include' ? seed.includeLabel : text.composer.seed.without}
          <small className="block text-[11.5px] text-muted">{choice === 'include' ? text.composer.seed.includeDetail(period) : text.composer.seed.withoutDetail(seed.subject)}</small>
        </span>
      </label>)}
    </fieldset>}
    {!seed && !hideConsent && !blockerHint && <label className="flex min-h-11 cursor-pointer items-start gap-2.5 px-0.5 pt-2.5">
      <input type="checkbox" className="m-0 mt-px size-[18px] flex-none accent-[var(--primary)]" checked={includeRecords} disabled={Boolean(busy)} aria-describedby="advisor-consent-text" onChange={(event) => onIncludeRecordsChange(event.target.checked)} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[13px] font-medium">{text.composer.consentTitle(period)}</strong>
        <span id="advisor-consent-text" className="text-xs leading-[1.45] text-muted">{includeRecords ? text.composer.consentIncluded : text.composer.consentExcluded}</span>
      </span>
    </label>}
    <div className={cn('flex flex-col gap-2 rounded-inset border bg-surface-raised p-2.5 focus-within:border-primary focus-within:shadow-[0_0_0_1px_var(--primary)]', blockerHint ? 'border-outline-strong' : 'border-outline-control')}>
      {replyTo && <div className="flex items-start justify-between gap-1.5 rounded-chip border-l-[3px] border-l-primary bg-primary-soft py-1.5 pl-2.5 pr-1 text-xs leading-[1.45] text-foreground-secondary">
        <span><b className="block font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-primary">{text.composer.replyTo.chip}</b>{replyTo}</span>
        <button type="button" aria-label={text.composer.replyTo.remove} onClick={onClearReplyTo} className="-my-1.5 -mr-0.5 inline-grid size-11 flex-none place-items-center rounded-control text-foreground-secondary hover:bg-surface-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-5">
          <svg {...iconProps}><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>}
      <textarea id="advisor-question" ref={textareaRef} aria-label={replyTo ? text.composer.replyTo.label : text.blocked.question} maxLength={4000} disabled={fieldDisabled}
        placeholder={blockerHint ? text.blocked.placeholder : placeholder} value={question} aria-describedby={taxUnavailable ? 'advisor-tax-note' : undefined}
        onChange={(event) => onQuestionChange(event.target.value)}
        className="block h-[58px] w-full resize-none border-0 bg-transparent p-0 text-[13.5px] leading-normal text-foreground outline-none placeholder:text-muted placeholder:opacity-100 disabled:text-foreground-disabled disabled:placeholder:text-foreground-disabled" />
      {untestedLine && <p id="advisor-untested" className="m-0 flex items-start gap-2 text-xs leading-[1.45] text-foreground-secondary before:mt-[5px] before:size-[7px] before:flex-none before:rounded-[2px] before:bg-warning-ink before:content-['']">{untestedLine}</p>}
      <div className="flex items-center justify-between gap-2">
        {blockerHint ? <span /> : <select aria-label={text.questionKind} value={questionKind} disabled={fieldDisabled} aria-describedby={taxUnavailable ? 'advisor-tax-note' : undefined}
          onChange={(event) => onQuestionKindChange(event.target.value as 'records' | 'tax')}
          style={{ backgroundImage: kindChevron }}
          className="min-h-11 max-w-[190px] appearance-none rounded-control border border-outline-strong bg-surface-panel bg-[position:right_10px_center] bg-no-repeat pl-2.5 pr-[30px] text-[12.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-foreground-disabled">
          <option value="records">{text.records}</option>
          <option value="tax" disabled={taxUnavailable}>{text.tax}</option>
        </select>}
        {busy
          ? <Button variant="secondary" className={advisorSecondaryButtonClassName} onClick={onCancel}>{text.cancel}</Button>
          : <button type="submit" aria-disabled={sendDisabled || undefined} aria-describedby={sendDescription}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-[image:var(--primary-gradient)] px-4 text-[13px] font-semibold text-primary-ink hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-disabled:cursor-not-allowed aria-disabled:border aria-disabled:border-button-disabled-border aria-disabled:bg-button-disabled aria-disabled:bg-none aria-disabled:text-foreground-disabled aria-disabled:hover:brightness-100">{replyTo ? text.composer.replyTo.send : text.send}</button>}
      </div>
    </div>
    {seedBlocksSend && !blockerHint && <p id="advisor-seed-hint" className="m-0 text-[12.5px] leading-normal text-muted">{text.composer.seed.chooseHint}</p>}
    {busy && <p role="status" className="m-0 text-[12.5px] leading-normal text-muted">{busy === 'sending' ? text.composer.busyHintLoading : text.composer.busyHint}</p>}
    {blockerHint && <p id="advisor-blocker-hint" className="m-0 text-[12.5px] leading-normal text-muted">{blockerHint}</p>}
  </form>;
}
