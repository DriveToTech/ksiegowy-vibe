'use client';

import Link from 'next/link';
import type { AdvisorAnswer } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';

export function AdvisorAnswerCard({ answer }: { answer: AdvisorAnswer }) {
  return <article className="space-y-4 rounded-card border border-outline border-l-[3px] border-l-primary bg-surface-panel p-4">
    <p className="font-mono text-xs uppercase tracking-wide text-primary">{text.status[answer.status]}</p>
    <h3 className="text-lg font-semibold leading-snug">{answer.shortAnswer}</h3>
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-secondary">{answer.explanation}</p>
    {answer.assumptions.length > 0 && <div><h4 className="text-sm font-semibold">{text.assumptions}</h4><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{answer.assumptions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {answer.questions.length > 0 && <div><h4 className="text-sm font-semibold">{text.questions}</h4><ul className="list-disc space-y-1 pl-5 text-sm">{answer.questions.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    {answer.calculations.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">{text.calculations}</summary>
      <p className="mb-3 text-xs text-muted">{text.calculationNote}</p>
      {answer.calculations.map((calculation) => <dl key={calculation.currency} className="mb-3 space-y-2 rounded-inset bg-surface-raised p-3 text-sm">
        {([['issuedGross', calculation.issuedGross], ['issuedVat', calculation.issuedVat], ['acceptedGross', calculation.acceptedGross]] as const).map(([label, amount]) => <div key={label} className="flex flex-wrap justify-between gap-2"><dt>{text[label]}</dt><dd className="font-mono tabular-nums">{amount} {calculation.currency}</dd></div>)}
      </dl>)}
    </details>}
    {answer.evidence.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">{text.evidence} ({answer.evidence.length})</summary>
      <ul className="space-y-2">{answer.evidence.map((record) => <li key={`${record.kind}:${record.id}`}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-control bg-surface-raised p-3 text-sm text-primary" href={`/dashboard/${record.kind === 'outgoing' ? 'invoices' : 'incoming'}/${encodeURIComponent(record.id)}`}>
        <span>{record.title}</span><span className="font-mono tabular-nums">{record.gross ?? '—'} {record.currency}</span>
      </Link></li>)}</ul>
    </details>}
    {answer.sources.length > 0 && <details><summary className="flex min-h-11 cursor-pointer items-center font-medium text-primary">{text.sources}</summary>
      <ul className="space-y-3 text-sm">{answer.sources.map((source) => <li key={source.id} className="space-y-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.title} — {source.section}</a><p className="text-xs text-muted">{source.effectiveFrom} – {source.effectiveUntil} · {source.reviewedAt}</p><blockquote className="border-l border-outline pl-3 text-muted">{source.excerpt}</blockquote></li>)}</ul>
    </details>}
    {answer.provenance.evidenceTruncated && <p className="text-xs text-muted">{text.truncated}</p>}
    <p className="break-words font-mono text-[11px] text-muted">{text.providers[answer.provenance.provider]} · {answer.provenance.model} · {answer.provenance.environment} · {answer.provenance.period}<br />{new Date(answer.provenance.generatedAt).toLocaleString('pl-PL')}</p>
  </article>;
}
