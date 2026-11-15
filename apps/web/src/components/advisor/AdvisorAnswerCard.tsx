'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import type { AdvisorAnswer } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';

const insetClassName = 'break-words rounded-inset bg-surface-raised border-l-[3px] text-secondary-ink';
const eyebrowClassName = 'font-mono text-[10px] uppercase tracking-[0.14em]';
const chipClassName = 'relative inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-chip border bg-secondary-surface px-2.5 font-mono text-[11px] text-foreground no-underline after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[\'\']';
const summaryClassName = 'flex min-h-11 cursor-pointer list-none items-center justify-between text-[13px] font-medium text-primary [&::-webkit-details-marker]:hidden [&_svg]:transition-transform group-open:[&_svg]:rotate-90';

function Icon({ children }: { children: ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-3.5 flex-none text-muted">{children}</svg>;
}

const documentIcon = <Icon><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 .5-.5Z" /><path d="M13.5 3.5V8H18" /></Icon>;
const bookIcon = <Icon><path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v12H8.5A3.5 3.5 0 0 1 5 16.5z" /><path d="M5 16.5A3.5 3.5 0 0 1 8.5 13H19" /></Icon>;

/** CLDR pl-PL grouping (4920,00 zł; 12 300,00 zł) in the answer's own currency. */
function formatAmount(amount: string | null, currency: string): string {
  const value = Number(amount);
  if (amount === null || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pl-PL', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

interface AdvisorAnswerCardProps {
  answer: AdvisorAnswer;
  fromHistory?: boolean;
  onFollowUp?: () => void;
}

export function AdvisorAnswerCard({ answer, fromHistory = false, onFollowUp }: AdvisorAnswerCardProps) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const declined = answer.status === 'declined';
  const warningTone = answer.status === 'insufficient_evidence';
  const expiredSource = answer.sources.find((source) => source.reviewExpiresAt < new Date().toISOString().slice(0, 10));
  const shortAnswerLabel = { answered: text.shortAnswer, insufficient_evidence: text.conversationStates.insufficientLabel, declined: text.conversationStates.declinedLabel, needs_clarification: text.conversationStates.clarificationLabel }[answer.status];
  const showChips = !declined && (answer.evidence.length > 0 || answer.sources.length > 0);

  function copyAnswer() {
    void navigator.clipboard.writeText(`${answer.shortAnswer}\n\n${answer.explanation}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => undefined);
  }

  return <article aria-label={text.conversationStates.answerLabel} className="flex flex-col gap-3 rounded-card border border-outline bg-surface-panel p-4">
    <div className="flex items-center justify-between gap-2">
      <p className={cn(eyebrowClassName, 'text-primary')}>{text.status[answer.status]}</p>
      {fromHistory && <span className="rounded-chip bg-draft px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-draft-ink">{text.conversationStates.fromHistory}</span>}
    </div>
    <div className={cn('flex flex-col gap-1.5 rounded-inset border p-3.5', answer.status === 'answered' && 'border-success-border bg-success', warningTone && 'border-warning-border bg-warning', !(answer.status === 'answered' || warningTone) && 'border-outline bg-surface-raised')}>
      <p className={cn(eyebrowClassName, answer.status === 'answered' ? 'text-success-ink' : warningTone ? 'text-warning-ink' : 'text-muted')}>{shortAnswerLabel}</p>
      <h3 className="text-base font-semibold leading-[1.4] tracking-[-0.01em]">{answer.shortAnswer}</h3>
    </div>
    {answer.disclaimer && <p role="note" className={cn(insetClassName, 'border-l-warning-ink px-3 py-2.5 text-xs leading-normal')}>
      <b className="mb-0.5 block font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-warning-ink">{text.answerCard.aiGenerated}</b>{answer.disclaimer}
    </p>}
    {declined && <h4 className="text-[13px] font-semibold">{text.declinedExplanation}</h4>}
    <p className="whitespace-pre-wrap text-[13px] leading-[1.55] text-foreground-secondary">{answer.explanation}</p>
    {answer.assumptions.length > 0 && <div><h4 className="text-[13px] font-semibold">{text.assumptions}</h4><ul className="list-disc pl-[18px] text-[13px] leading-[1.55] text-foreground-secondary">{answer.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {answer.questions.length > 0 && <div>{answer.status !== 'needs_clarification' && <h4 className="text-[13px] font-semibold">{text.questions}</h4>}<ul className="list-disc pl-[18px] text-[13px] leading-[1.55] text-foreground-secondary">{answer.questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {!declined && answer.calculations.map((calculation) => <div key={calculation.currency} className="space-y-2">
      <dl className="m-0 grid grid-cols-2 gap-2">
        {([['issuedGross', calculation.issuedGross], ['issuedVat', calculation.issuedVat], ['acceptedGross', calculation.acceptedGross], ['rejectedGross', calculation.rejectedGross]] as const).map(([label, amount]) => <div key={label} className="flex min-w-0 flex-col gap-1 rounded-inset bg-surface-raised px-[13px] py-3">
          <dt className="font-mono text-[10px] uppercase leading-[1.4] tracking-[0.1em] text-muted">{label === 'rejectedGross' ? text.answerCard.rejectedGross : text.answerCard.tiles[label]}</dt>
          <dd className={cn('m-0 whitespace-nowrap text-base font-semibold tabular-nums tracking-[-0.01em]', label === 'rejectedGross' && Number(amount) > 0 && 'text-warning-ink')}>{formatAmount(amount, calculation.currency)}</dd>
        </div>)}
      </dl>
      <p className="text-xs text-muted">{text.answerCard.tilesNote(answer.provenance.period, calculation.currency)}</p>
    </div>)}
    {answer.contractorBalance && <section aria-label={text.contractorBalance} className="space-y-2">
      <h4 className="text-[13px] font-semibold">{text.contractorBalance}: {answer.contractorBalance.name} · faktury wystawione do końca {answer.contractorBalance.period}</h4>
      {answer.contractorBalance.balances.map((balance) => <dl key={balance.currency} className="m-0 grid grid-cols-2 gap-2 rounded-inset bg-surface-raised p-3 text-sm">
        <div><dt className="text-xs text-muted">{text.contractorOutstanding}</dt><dd className="m-0 font-semibold tabular-nums">{formatAmount(balance.currentOutstanding, balance.currency)}</dd></div>
        <div><dt className="text-xs text-muted">{text.contractorPaid}</dt><dd className="m-0 font-semibold tabular-nums">{formatAmount(balance.recordedPayments, balance.currency)}</dd></div>
      </dl>)}
      <p className="text-xs text-muted">{text.contractorCaveat}</p>
    </section>}
    {showChips && <div className="flex flex-col gap-2">
      <span className={cn(eyebrowClassName, 'text-muted')}>{text.answerCard.citations}</span>
      <div className="flex flex-wrap gap-x-1.5 gap-y-3">
        {answer.evidence.slice(0, 1).map((record) => <Link key={`${record.kind}:${record.id}`} className={cn(chipClassName, 'border-outline-strong')} href={`/dashboard/${record.kind === 'outgoing' ? 'invoices' : 'incoming'}/${encodeURIComponent(record.id)}`}>{documentIcon}<span className="truncate">{record.title}</span></Link>)}
        {answer.evidence.length > 1 && <button type="button" className={cn(chipClassName, 'border-outline-strong')} onClick={() => setEvidenceOpen(true)}>{documentIcon}<span>{text.answerCard.moreDocuments(answer.evidence.length - 1)}</span></button>}
        {answer.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className={cn(chipClassName, 'border-primary-border')}>{bookIcon}<span className="truncate">{source.title}, {source.section} · {source.effectiveFrom.slice(0, 4)}</span></a>)}
      </div>
    </div>}
    {expiredSource && <p className={cn(insetClassName, 'border-l-warning-ink px-3 py-2.5 text-xs leading-normal')}>{text.conversationStates.sourceExpired(`${expiredSource.title}, ${expiredSource.section}`, new Date(expiredSource.reviewExpiresAt).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' }))}</p>}
    {!declined && answer.evidence.length > 0 && <details className="group border-t border-outline" open={evidenceOpen} onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}>
      <summary className={summaryClassName}>{text.answerCard.evidenceCount(answer.evidence.length)}<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 6 6 6-6 6" /></svg></summary>
      <ul className="m-0 list-none space-y-1.5 p-0 pb-2">{answer.evidence.map((record) => <li key={`${record.kind}:${record.id}`}><Link className="flex min-h-11 items-center justify-between gap-2.5 rounded-control bg-surface-raised px-3 text-[13px] text-primary no-underline" href={`/dashboard/${record.kind === 'outgoing' ? 'invoices' : 'incoming'}/${encodeURIComponent(record.id)}`}>
        <span>{record.title}</span><span className="font-mono text-xs tabular-nums text-foreground">{formatAmount(record.gross, record.currency)}</span>
      </Link></li>)}</ul>
    </details>}
    {!declined && answer.sources.length > 0 && <details className="group border-t border-outline">
      <summary className={summaryClassName}>{text.answerCard.sourcesCount(answer.sources.length)}<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 6 6 6-6 6" /></svg></summary>
      <ul className="m-0 list-none space-y-1.5 p-0 pb-2">{answer.sources.map((source) => <li key={source.id} className="flex flex-col gap-1 rounded-control bg-surface-raised p-3">
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-primary underline">{source.title} — {source.section}</a>
        <span className="font-mono text-[11px] text-muted">{text.answerCard.effectiveRange(`${source.effectiveFrom} – ${source.effectiveUntil}`)}</span>
        <span className="break-words font-mono text-[11px] text-muted">{text.sourceReviewedByAi(source.reviewedBy.split('+').map((model) => model.replace(/^ai:/, '')).join(' + '), source.reviewedAt)}</span>
        <blockquote className="m-0 mt-1 border-l-2 border-outline-strong pl-2.5 text-xs leading-normal text-foreground-secondary">{source.excerpt}</blockquote>
      </li>)}</ul>
    </details>}
    {answer.provenance.evidenceTruncated && <p className="text-xs text-muted">{text.truncated}</p>}
    {!declined && answer.disclaimer && <p className={cn(insetClassName, 'border-l-primary px-[13px] py-[11px] text-[12.5px] leading-normal')}>{text.answerCard.caveat}</p>}
    <p className="m-0 break-words border-t border-outline pt-2.5 font-mono text-[10.5px] leading-[1.6] text-muted">{text.providers[answer.provenance.provider]} · {answer.provenance.model} · {answer.provenance.environment} · {answer.provenance.period}<br />{new Date(answer.provenance.generatedAt).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })} · {answer.provenance.recordsIncluded ? text.answerCard.companyDataIncluded : text.answerCard.companyDataExcluded}</p>
    {answer.status === 'answered' && !fromHistory && <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copyAnswer} aria-live="polite" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-outline-control bg-secondary-surface px-4 text-[13px] font-medium text-secondary-ink hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-ink">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 flex-none"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg>{copied ? text.answerCard.copied : text.answerCard.copy}
      </button>
      {onFollowUp && <button type="button" onClick={onFollowUp} className="inline-flex min-h-11 items-center justify-center rounded-control bg-transparent px-2.5 text-[13px] font-medium text-primary hover:bg-secondary-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{text.answerCard.followUp}</button>}
    </div>}
  </article>;
}
