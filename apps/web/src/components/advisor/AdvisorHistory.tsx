'use client';

import { useEffect, useRef, useState } from 'react';
import { advisorText as text } from '../../lib/advisor-translations';
import { deleteAdvisorConversation, listAdvisorConversations, readAdvisorSettings, advisorErrorMessage, type AdvisorConversationSummary } from '../../lib/advisor-api';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { NativeDialog } from '../atoms/NativeDialog';
import type { AdvisorHistoryViewProps } from './AdvisorConversation';
import { advisorNoteClassName, advisorSecondaryButtonClassName } from './AdvisorThread';

const dateFormatter = new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit' });

export function AdvisorHistory({ companyId, environment, layout, currentConversationId, onSelect, onNew, onDeleted }: AdvisorHistoryViewProps) {
  const [conversations, setConversations] = useState<AdvisorConversationSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<AdvisorConversationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listAdvisorConversations(companyId, environment, controller.signal)
      .then(setConversations)
      .catch((error: unknown) => { if (!controller.signal.aborted) { setLoadError(advisorErrorMessage(error)); setConversations([]); } });
    readAdvisorSettings(companyId, controller.signal).then((settings) => setRetentionDays(settings.retentionDays)).catch(() => undefined);
    return () => controller.abort();
  }, [companyId, environment]);

  const confirmDeletion = () => {
    if (!pendingDeletion) return;
    setDeleting(true);
    setDeleteFailed(false);
    deleteAdvisorConversation(companyId, environment, pendingDeletion.id)
      .then(() => {
        const deletedId = pendingDeletion.id;
        setConversations((current) => current?.filter((conversation) => conversation.id !== deletedId) ?? null);
        setPendingDeletion(null);
        onDeleted(deletedId);
      })
      .catch(() => setDeleteFailed(true))
      .finally(() => setDeleting(false));
  };

  const closeDialog = () => { if (!deleting) { setPendingDeletion(null); setDeleteFailed(false); } };
  const column = layout === 'column';
  const empty = conversations !== null && conversations.length === 0;

  return <div className={cn('flex min-h-0 flex-1 flex-col', column && 'rounded-card border border-outline bg-surface-panel')}>
    {column && <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 border-b border-outline pl-4 pr-2">
      <h2 className="text-sm font-semibold">{text.historyView.title}</h2>
      <button type="button" onClick={onNew} aria-label={text.historyView.newConversation} title={text.historyView.newConversation}
        className="inline-grid size-11 shrink-0 place-items-center rounded-control text-[22px] leading-none text-foreground-secondary transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">+</button>
    </div>}
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {conversations === null && <div aria-busy="true" className="flex flex-col gap-[18px] px-4 py-[18px]">
        {[0, 1, 2, 3].map((row) => <div key={row} className="flex flex-col gap-2"><span className="h-3 w-[88%] animate-pulse rounded bg-skeleton" /><span className="h-[9px] w-2/5 animate-pulse rounded bg-skeleton" /></div>)}
      </div>}
      {loadError && <p role="alert" className="px-4 py-6 text-sm text-danger-foreground">{loadError}</p>}
      {empty && !loadError && <div className="flex flex-col gap-2 px-4 py-6"><h3 className="text-sm font-semibold">{text.historyView.emptyTitle}</h3><p className="text-xs leading-normal text-muted">{text.historyView.emptyBody}</p></div>}
      {conversations && conversations.length > 0 && <ul className="m-0 list-none p-0">
        {conversations.map((conversation) => {
          const current = conversation.id === currentConversationId;
          return <li key={conversation.id} className={cn('flex items-center gap-1 border-b border-outline pl-4 pr-2', current && 'bg-primary-soft shadow-[inset_3px_0_0_var(--primary)]')}>
            <button type="button" onClick={() => onSelect(conversation.id)} aria-current={current ? 'true' : undefined}
              className="flex min-h-[60px] min-w-0 flex-1 flex-col justify-center gap-0.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <span className="line-clamp-2 text-[13.5px] leading-[1.4]">{conversation.title}</span>
              <span className="font-mono text-[10.5px] text-muted">{text.historyView.rowMeta(dateFormatter.format(new Date(conversation.createdAt)), text.providers[conversation.provider])}</span>
            </button>
            <button type="button" aria-label={text.historyView.deleteLabel(conversation.title)}
              onClick={(event) => { deleteTrigger.current = event.currentTarget; setDeleteFailed(false); setPendingDeletion(conversation); }}
              className="inline-grid size-11 shrink-0 place-items-center rounded-[9px] text-muted transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" /></svg>
            </button>
          </li>;
        })}
      </ul>}
      {retentionDays !== null && !loadError && conversations !== null && !empty && <p className={cn('px-4 py-3.5 text-xs leading-normal text-muted', column && 'mt-auto')}>{text.historyView.footer(environment, retentionDays)}</p>}
    </div>
    {!column && <div className="shrink-0 border-t border-outline p-4"><Button type="button" variant="secondary" className={cn('w-full', advisorSecondaryButtonClassName)} onClick={onNew}>{text.historyView.newConversation}</Button></div>}
    <NativeDialog open={pendingDeletion !== null} title={text.historyView.deleteDialog.title} layout="bare" className="max-w-[420px]! shadow-frame" onClose={closeDialog}>
      <div role="alertdialog" aria-label={text.historyView.deleteDialog.title} aria-describedby="advisor-delete-body" className="flex flex-col gap-3 p-5">
        <h3 className="m-0 text-[17px] font-semibold">{text.historyView.deleteDialog.title}</h3>
        {pendingDeletion && <div className="rounded-control bg-surface-raised px-3 py-2.5 text-[13px] text-foreground">{pendingDeletion.title}<span className="mt-0.5 block font-mono text-[10.5px] text-muted">{text.historyView.rowMeta(dateFormatter.format(new Date(pendingDeletion.createdAt)), text.providers[pendingDeletion.provider])}</span></div>}
        <p id="advisor-delete-body" className="m-0 text-[13px] leading-[1.55] text-foreground-secondary">{text.historyView.deleteDialog.body}</p>
        {deleteFailed && <p role="alert" className={cn(advisorNoteClassName, 'border-l-error-ink')}>{text.historyView.deleteDialog.error}</p>}
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" className={cn('max-sm:w-full', advisorSecondaryButtonClassName)} data-dialog-cancel onClick={closeDialog} disabled={deleting}>{text.historyView.deleteDialog.cancel}</Button>
          <Button type="button" variant="danger" className="border border-danger-border bg-danger-fill! text-[13px]! font-medium! max-sm:w-full" onClick={confirmDeletion} loading={deleting}>{text.historyView.deleteDialog.confirm}</Button>
        </div>
      </div>
    </NativeDialog>
  </div>;
}
