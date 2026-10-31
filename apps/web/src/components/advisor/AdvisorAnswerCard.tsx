'use client';

import Link from 'next/link';
import type { AdvisorAnswer } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';

const summaryClassName = 'flex min-h-11 cursor-pointer items-center gap-2 font-medium text-primary before:inline-block before:size-2 before:-rotate-45 before:border-b-2 before:border-r-2 before:transition-transform group-open:before:rotate-45';

export function AdvisorAnswerCard({ answer }: { answer: AdvisorAnswer }) {
  return <article className="space-y-4 rounded-card border border-outline border-l-[3px] border-l-primary bg-surface-panel p-4">
    <p className="font-mono text-xs uppercase tracking-wide text-primary">{text.status[answer.status]}</p>
    <div className={cn('space-y-1 rounded-inset border p-4', answer.status === 'answered' ? 'border-success-ink/30 bg-success' : 'border-outline bg-surface-raised')}>
      <p className={cn('font-mono text-[10px] uppercase tracking-[0.08em]', answer.status === 'answered' ? 'text-success-ink' : 'text-muted')}>{text.shortAnswer}</p>
      <h3 className="text-lg font-semibold leading-snug">{answer.shortAnswer}</h3>
    </div>
    {answer.disclaimer && <p role="note" className="break-words rounded-inset border-l-[3px] border-l-warning-ink bg-surface-raised px-3 py-2 text-xs leading-normal text-foreground-secondary">{answer.disclaimer}</p>}
    {answer.status === 'declined' && <h4 className="text-sm font-semibold">{text.declinedExplanation}</h4>}
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-secondary">{answer.explanation}</p>
    {answer.assumptions.length > 0 && <div><h4 className="text-sm font-semibold">{text.assumptions}</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{answer.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {answer.questions.length > 0 && <div><h4 className="text-sm font-semibold">{text.questions}</h4><ul className="list-disc space-y-1 pl-5 text-sm">{answer.questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {answer.calculations.length > 0 && <details open className="group"><summary className={summaryClassName}>{text.calculations}</summary>
      <p className="mb-3 text-xs text-muted">{text.calculationNote}</p>
      {answer.calculations.map((calculation) => <dl key={calculation.currency} className="mb-3 grid gap-2 sm:grid-cols-3">
        {([['issuedGross', calculation.issuedGross], ['issuedVat', calculation.issuedVat], ['acceptedGross', calculation.acceptedGross]] as const).map(([label, amount]) => <div key={label} className="space-y-1 rounded-inset border border-outline bg-surface-raised p-3">
          <dt className="text-xs text-muted">{text[label]}</dt><dd className="font-mono text-base font-semibold tabular-nums">{amount} {calculation.currency}</dd>
        </div>)}
      </dl>)}
    </details>}
    {answer.contractorBalance && <section aria-label={text.contractorBalance} className="space-y-2">
      <h4 className="text-sm font-semibold">{text.contractorBalance}: {answer.contractorBalance.name} · faktury wystawione do końca {answer.contractorBalance.period}</h4>
      {answer.contractorBalance.balances.map((balance) => <dl key={balance.currency} className="grid grid-cols-2 gap-2 rounded-inset bg-surface-raised p-3 text-sm">
        <div><dt>{text.contractorOutstanding}</dt><dd className="font-mono tabular-nums">{balance.currentOutstanding} {balance.currency}</dd></div>
        <div><dt>{text.contractorPaid}</dt><dd className="font-mono tabular-nums">{balance.recordedPayments} {balance.currency}</dd></div>
      </dl>)}
      <p className="text-xs text-muted">{text.contractorCaveat}</p>
    </section>}
    {answer.evidence.length > 0 && <details className="group"><summary className={summaryClassName}>{text.evidence} ({answer.evidence.length})</summary>
      <ul className="space-y-2">{answer.evidence.map((record) => <li key={`${record.kind}:${record.id}`}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-control bg-surface-raised p-3 text-sm text-primary" href={`/dashboard/${record.kind === 'outgoing' ? 'invoices' : 'incoming'}/${encodeURIComponent(record.id)}`}>
        <span>{record.title}</span><span className="font-mono tabular-nums">{record.gross ?? '—'} {record.currency}</span>
      </Link></li>)}</ul>
    </details>}
    {answer.sources.length > 0 && <details className="group"><summary className={summaryClassName}>{text.sources}</summary>
      <ul className="space-y-3 text-sm">{answer.sources.map((source) => <li key={source.id} className="space-y-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title} — {source.section}</a><p className="text-xs text-muted">{source.effectiveFrom} – {source.effectiveUntil}</p><p className="break-words text-xs text-muted">{text.sourceReviewedByAi(source.reviewedBy.split('+').map((model) => model.replace(/^ai:/, '')).join(' + '), source.reviewedAt)}</p><blockquote className="border-l border-outline pl-3 text-muted">{source.excerpt}</blockquote></li>)}</ul>
    </details>}
    {answer.provenance.evidenceTruncated && <p className="text-xs text-muted">{text.truncated}</p>}
    <p className="break-words font-mono text-[11px] text-muted">{text.providers[answer.provenance.provider]} · {answer.provenance.model} · {answer.provenance.environment} · {answer.provenance.period}<br />{new Date(answer.provenance.generatedAt).toLocaleString('pl-PL')}</p>
  </article>;
}
