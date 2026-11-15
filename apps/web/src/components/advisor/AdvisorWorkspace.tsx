'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { NativeDialog } from '../atoms/NativeDialog';
import type { AdvisorPlacement } from './AdvisorPanelHeader';
import { AdvisorHistory } from './AdvisorHistory';
import { AdvisorConversation, type AdvisorConversationSeed } from './AdvisorConversation';

interface AdvisorState {
  companyId: string; environment: AdvisorEnvironment; open: boolean;
  seed: AdvisorConversationSeed;
  /** True while the conversation waits for an answer; Explain buttons use it to explain why they are paused. */
  requestInFlight: boolean; setRequestInFlight: (inFlight: boolean) => void;
  show: (request?: AdvisorShowRequest) => void; close: () => void;
}
export type AdvisorShowRequest = Partial<Omit<AdvisorConversationSeed, 'revision'>>;
const AdvisorContext = createContext<AdvisorState | null>(null);

export function AdvisorWorkspace({ companyId, environment, children }: { companyId: string | null; environment: AdvisorEnvironment | null; children: ReactNode }) {
  if (!companyId || !environment) return children;
  return <ActiveAdvisorWorkspace key={`${companyId}:${environment}`} companyId={companyId} environment={environment}>{children}</ActiveAdvisorWorkspace>;
}

function ActiveAdvisorWorkspace({ companyId, environment, children }: { companyId: string; environment: AdvisorEnvironment; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [previousPath, setPreviousPath] = useState(pathname);
  const [seed, setSeed] = useState<AdvisorState['seed']>({ question: '', revision: 0 });
  const [requestInFlight, setRequestInFlight] = useState(false);
  const focusedBeforeOpen = useRef<HTMLElement | null>(null);
  const show = ({ question = '', period, contractorId, contractorName, reference, briefing }: AdvisorShowRequest = {}) => {
    if (pathname === '/dashboard/advisor') { document.getElementById('advisor-question')?.focus(); return; }
    focusedBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const documentMatch = pathname.match(/^\/dashboard\/(invoices|incoming)\/([^/]+)$/);
    setSeed((previous) => ({ question, revision: previous.revision + 1, ...(period ? { period } : {}),
      ...(contractorId ? { contractorId, contractorName } : {}), ...(reference ? { reference } : {}), ...(briefing ? { briefing } : {}),
      ...(documentMatch && documentMatch[2] !== 'new' ? { documentId: decodeURIComponent(documentMatch[2]), documentKind: documentMatch[1] === 'invoices' ? 'outgoing' as const : 'incoming' as const } : {}) }));
    setOpen(true);
  };
  const close = () => { setOpen(false); focusedBeforeOpen.current?.focus(); };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (open) close(); else show();
      // A nested dialog (delete confirmation) is still open while its own Escape is handled natively; leave the panel open.
      } else if (event.key === 'Escape' && open && !event.defaultPrevented && !document.querySelector('dialog[open]:not(#advisor-panel)')) close();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  if (previousPath !== pathname) { setPreviousPath(pathname); setOpen(false); }
  return <AdvisorContext.Provider value={{ companyId, environment, open, seed, requestInFlight, setRequestInFlight, show, close }}>{children}</AdvisorContext.Provider>;
}

export const useAdvisorWorkspace = () => useContext(AdvisorContext);

export const advisorMark = (size: string) => <span aria-hidden="true" className={`inline-block shrink-0 bg-[image:var(--primary-gradient)] ${size}`} />;

export function AdvisorTrigger({ mobile = false, explain = false, briefing = false, period, question, contractorId, contractorName }: {
  mobile?: boolean; explain?: boolean; briefing?: boolean; period?: string; question?: string; contractorId?: string; contractorName?: string;
}) {
  const advisor = useContext(AdvisorContext);
  const pathname = usePathname();
  if (!advisor) return null;
  const onAdvisorPage = pathname === '/dashboard/advisor';
  const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';
  const className = briefing
    ? 'inline-flex h-10 shrink-0 items-center rounded-control bg-secondary-surface px-[17px] text-sm font-medium text-secondary-ink transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary-ink'
    : explain
    ? `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-[var(--nav-active-border)] bg-[image:var(--nav-active)] px-3.5 text-[13px] font-medium text-foreground ${focusRing}`
    : mobile
      ? `inline-flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 text-[11.5px] font-semibold text-primary ${focusRing}`
      : `inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-[var(--nav-active-border)] bg-[image:var(--nav-active)] px-3.5 text-[13px] font-medium text-foreground aria-expanded:border-primary aria-expanded:shadow-[inset_0_0_0_1px_var(--primary)] ${focusRing}`;
  return <button type="button" aria-label={briefing ? text.briefing : explain ? text.explain : text.open} aria-expanded={advisor.open} aria-controls="advisor-panel" aria-current={onAdvisorPage && !explain ? 'page' : undefined}
    onClick={() => advisor.show({ question: question ?? (explain ? text.explainQuestion : ''), period, contractorId, contractorName, briefing })} className={className}>
    {!briefing && advisorMark(mobile ? 'size-[18px] rounded-md' : 'size-[13px] rounded-[4px]')}
    <span>{briefing ? text.briefing : explain ? text.explain : text.title}</span>
    {!mobile && !explain && !briefing && <kbd aria-hidden="true" className="font-mono text-[11px] font-normal text-muted">⌘J</kbd>}
  </button>;
}

export function AdvisorPanel() {
  const advisor = useContext(AdvisorContext);
  const pathname = usePathname();
  const [placement, setPlacement] = useState<AdvisorPlacement>('sheet');
  useEffect(() => {
    const dockQuery = window.matchMedia('(min-width: 1280px)');
    const drawerQuery = window.matchMedia('(min-width: 768px)');
    const update = () => setPlacement(dockQuery.matches ? 'dock' : drawerQuery.matches ? 'drawer' : 'sheet');
    update();
    dockQuery.addEventListener('change', update);
    drawerQuery.addEventListener('change', update);
    return () => { dockQuery.removeEventListener('change', update); drawerQuery.removeEventListener('change', update); };
  }, []);
  useEffect(() => { if (advisor?.open && placement === 'dock') document.getElementById('advisor-close')?.focus(); }, [advisor?.open, placement]);
  // The full page owns the single advisor DOM (one #advisor-question); the dock never mounts there.
  if (!advisor || pathname === '/dashboard/advisor') return null;
  const isSheet = placement === 'sheet';
  const conversation = <AdvisorConversation companyId={advisor.companyId} environment={advisor.environment} active={advisor.open} seed={advisor.seed}
    variant={placement} onClose={advisor.close} onRequestInFlightChange={advisor.setRequestInFlight} HistoryView={AdvisorHistory} />;
  if (placement === 'dock') return <aside id="advisor-panel" data-advisor-docked={advisor.open ? '' : undefined} hidden={!advisor.open} aria-label={text.title} className={`min-h-0 flex-col border-l border-outline-strong bg-surface-panel ${advisor.open ? 'flex' : '!hidden'}`}>
    {conversation}
  </aside>;
  return <NativeDialog id="advisor-panel" open={advisor.open} title={text.title} layout="bare" onClose={advisor.close}
    {...(isSheet ? { sheet: 'always' as const } : { placement: 'side' as const })}
    className={isSheet
      ? 'h-[min(90dvh,760px)] !max-w-none overflow-hidden open:flex open:flex-col'
      : 'open:flex open:flex-col'}>
    {conversation}
  </NativeDialog>;
}
