'use client';

import { useEffect, useId, useState } from 'react';
import { ApiClientError, lookupCompanyByNip } from '../../lib/api-client';
import type { Contractor } from '../../lib/api-types';
import { cn } from '../../lib/cn';
import { formatDateTime } from '../../lib/format';
import { t } from '../../lib/translations';
import { Select } from '../atoms/Select';
import { Surface } from '../atoms/Surface';

type WhiteListOutcome =
  | { kind: 'verified' | 'exempt' | 'noVat' | 'notFound'; checkedAt: string }
  | { kind: 'invalid' }
  | { kind: 'error'; rateLimited: boolean };

type WhiteListState = WhiteListOutcome | { kind: 'hidden' | 'noNip' | 'checking' };

const chipTone = {
  neutral: 'border-neutral-status-ink/30 bg-neutral-status text-neutral-status-ink',
  success: 'border-success-ink/30 bg-success text-success-ink',
  warning: 'border-warning-ink/30 bg-warning text-warning-ink',
  error: 'border-error-ink/30 bg-error text-error-ink',
};

const chipShape = 'items-center rounded-control border px-[13px] font-mono text-[11px] uppercase tracking-[0.08em] whitespace-nowrap';

interface InvoiceBuyerSectionProps {
  contractors: Contractor[];
  contractorId: string;
  onContractorChange: (contractorId: string) => void;
  /** Reports the only blocking outcome: the buyer NIP fails the checksum. */
  onBuyerNipInvalid: (invalid: boolean) => void;
}

export function InvoiceBuyerSection({ contractors, contractorId, onContractorChange, onBuyerNipInvalid }: InvoiceBuyerSectionProps) {
  const statusId = useId();
  const invalidMessageId = useId();
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState<{ nip: string; attempt: number; outcome: WhiteListOutcome } | null>(null);

  const selectedContractor = contractors.find((contractor) => contractor.id === contractorId) ?? null;
  const buyerNip = selectedContractor?.nip?.trim() || null;

  // The result is stored with the NIP and attempt it belongs to, so a late response for a previous buyer is ignored.
  useEffect(() => {
    if (!buyerNip) return;
    let ignore = false;
    lookupCompanyByNip(buyerNip)
      .then((result): WhiteListOutcome => ({
        kind: result.vatStatus === 'ACTIVE' ? 'verified' : result.vatStatus === 'EXEMPT' ? 'exempt' : 'noVat',
        checkedAt: result.checkedAt,
      }))
      .catch((error: unknown): WhiteListOutcome => {
        const statusCode = error instanceof ApiClientError ? error.statusCode : null;
        if (statusCode === 400) return { kind: 'invalid' };
        if (statusCode === 404) return { kind: 'notFound', checkedAt: new Date().toISOString() };
        return { kind: 'error', rateLimited: statusCode === 429 };
      })
      .then((outcome) => {
        if (!ignore) setLookup({ nip: buyerNip, attempt, outcome });
      });
    return () => {
      ignore = true;
    };
  }, [buyerNip, attempt]);

  let state: WhiteListState = { kind: 'checking' };
  if (!selectedContractor) state = { kind: 'hidden' };
  else if (!buyerNip) state = { kind: 'noNip' };
  else if (lookup?.nip === buyerNip && lookup.attempt === attempt) state = lookup.outcome;

  const invalid = state.kind === 'invalid';
  useEffect(() => {
    onBuyerNipInvalid(invalid);
  }, [invalid, onBuyerNipInvalid]);

  const whiteList = t.newInvoice.whiteList;
  // Label and tone of the visible chip, and the sentence read out by the live region ('' = stay silent).
  let label = '';
  let tone: keyof typeof chipTone = 'neutral';
  let announcement = '';
  let hint = '';
  let checkedAt = '';
  switch (state.kind) {
    case 'checking':
      label = whiteList.labelChecking;
      break;
    case 'noNip':
      label = whiteList.labelNoNip;
      tone = 'warning';
      announcement = whiteList.announceNoNip;
      hint = whiteList.hintNoNip;
      break;
    case 'verified':
      checkedAt = formatDateTime(state.checkedAt);
      label = whiteList.labelVerified;
      tone = 'success';
      announcement = whiteList.announceVerified(checkedAt);
      break;
    case 'exempt':
      checkedAt = formatDateTime(state.checkedAt);
      label = whiteList.labelExempt;
      tone = 'warning';
      announcement = whiteList.announceExempt(checkedAt);
      break;
    case 'noVat':
      checkedAt = formatDateTime(state.checkedAt);
      label = whiteList.labelNoVat;
      tone = 'warning';
      announcement = whiteList.announceNoVat(checkedAt);
      break;
    case 'notFound':
      checkedAt = formatDateTime(state.checkedAt);
      label = whiteList.labelNotFound;
      tone = 'error';
      announcement = whiteList.announceNotFound(checkedAt);
      break;
    case 'invalid':
      label = whiteList.labelInvalid;
      tone = 'error';
      break;
    case 'error':
      announcement = state.rateLimited ? whiteList.announceRateLimited : whiteList.announceError;
      hint = state.rateLimited ? whiteList.hintRateLimited : whiteList.hintError;
      break;
    case 'hidden':
      break;
  }

  const showChip = label !== '';
  const address = [selectedContractor?.addressLine1, selectedContractor?.addressLine2].filter(Boolean).join(', ');

  return (
    <Surface tone="panel" className="flex flex-col gap-[11px] px-[18px] py-4">
      <label htmlFor="contractorId" className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
        {t.newInvoice.buyerSectionEyebrow}
      </label>
      <Select
        id="contractorId"
        value={contractorId}
        onChange={(event) => onContractorChange(event.target.value)}
        required
        className="md:h-11 md:px-[13px] md:text-[13.5px] md:font-normal"
      >
        <option value="">{t.newInvoice.contractorPlaceholder}</option>
        {contractors.map((contractor) => (
          <option key={contractor.id} value={contractor.id}>
            {contractor.name}
          </option>
        ))}
      </Select>

      <div className="flex flex-wrap items-stretch gap-2.5">
        <div
          className={cn(
            'flex min-h-12 min-w-[11rem] flex-1 items-center gap-2 rounded-control border px-[13px] font-mono text-base text-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary md:min-h-11 md:text-[13px]',
            invalid ? 'border-error-ink/50 bg-error-ink/[0.08]' : 'border-outline bg-foreground/[0.03]',
          )}
        >
          <span aria-hidden="true">{t.newInvoice.buyerNipPrefix}</span>
          <label htmlFor="buyerNip" className="sr-only">{t.newInvoice.buyerNipLabel}</label>
          <input
            id="buyerNip"
            readOnly
            value={buyerNip ?? '—'}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${statusId} ${invalidMessageId}` : statusId}
            className="min-w-0 flex-1 self-stretch bg-transparent font-mono text-base outline-none md:text-[13px]"
          />
        </div>

        {/* Always mounted so that later results are announced. The visible label is aria-hidden, the sentence is for screen readers. */}
        <div
          id={statusId}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={state.kind === 'checking'}
          className={showChip ? cn('flex', chipShape, chipTone[tone]) : 'sr-only'}
        >
          <span aria-hidden="true">{label}</span>
          <span className="sr-only">{announcement}</span>
        </div>
        {state.kind === 'error' ? (
          <button
            type="button"
            aria-label={whiteList.retryAriaLabel}
            onClick={() => setAttempt((previous) => previous + 1)}
            className={cn('flex min-h-12 min-w-11 md:min-h-11 md:text-[13px]', chipShape, chipTone.warning, 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary')}
          >
            {whiteList.labelRetry}
          </button>
        ) : null}
      </div>

      {invalid ? (
        <p id={invalidMessageId} role="alert" className="font-mono text-[11px] text-error-ink">
          {whiteList.invalidMessage}
        </p>
      ) : null}
      {hint ? <p className="text-[12px] leading-[1.45] text-warning-ink">{hint}</p> : null}
      {address ? <p className="text-[12.5px] leading-[1.45] text-muted">{address}</p> : null}
      {checkedAt ? <p className="font-mono text-[11px] text-muted">{whiteList.checkedAt(checkedAt)}</p> : null}
    </Surface>
  );
}
