'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import type { AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { Button } from '../atoms/Button';
import { NativeDialog } from '../atoms/NativeDialog';
import { AdvisorConversation } from './AdvisorConversation';

interface AdvisorState {
  companyId: string; environment: AdvisorEnvironment; open: boolean;
  seed: { question: string; documentId?: string; documentKind?: 'outgoing' | 'incoming'; contractorId?: string; contractorName?: string; period?: string; revision: number };
  show: (question?: string, period?: string, contractorId?: string, contractorName?: string) => void; close: () => void;
}
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
  const focusedBeforeOpen = useRef<HTMLElement | null>(null);
  const show = (question = '', period?: string, contractorId?: string, contractorName?: string) => {
    focusedBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const documentMatch = pathname.match(/^\/dashboard\/(invoices|incoming)\/([^/]+)$/);
    setSeed((previous) => ({ question, revision: previous.revision + 1, ...(period ? { period } : {}),
      ...(contractorId ? { contractorId, contractorName } : {}),
      ...(documentMatch && documentMatch[2] !== 'new' ? { documentId: decodeURIComponent(documentMatch[2]), documentKind: documentMatch[1] === 'invoices' ? 'outgoing' as const : 'incoming' as const } : {}) }));
    setOpen(true);
  };
  const close = () => { setOpen(false); focusedBeforeOpen.current?.focus(); };
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'j') {
        event.preventDefault();
        if (open) close(); else show();
      } else if (event.key === 'Escape' && open) close();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  if (previousPath !== pathname) { setPreviousPath(pathname); setOpen(false); }
  return <AdvisorContext.Provider value={{ companyId, environment, open, seed, show, close }}>{children}</AdvisorContext.Provider>;
}

export function AdvisorTrigger({ mobile = false, explain = false, period, question, contractorId, contractorName }: {
  mobile?: boolean; explain?: boolean; period?: string; question?: string; contractorId?: string; contractorName?: string;
}) {
  const advisor = useContext(AdvisorContext);
  if (!advisor) return null;
  return <button type="button" aria-label={explain ? text.explain : text.open} aria-expanded={advisor.open} onClick={() => advisor.show(question ?? (explain ? text.explainQuestion : ''), period, contractorId, contractorName)}
    className={mobile ? 'flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-[image:var(--primary-gradient)] text-primary-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary' : 'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control border border-primary/30 bg-surface-raised px-3 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'}>
    <span aria-hidden="true">✦</span>{!mobile && <span>{explain ? text.explain : text.title}</span>}
  </button>;
}

export function AdvisorPanel() {
  const advisor = useContext(AdvisorContext);
  const [wide, setWide] = useState(false);
  const closeButton = useRef<HTMLDivElement>(null);
  useEffect(() => { const query = window.matchMedia('(min-width: 1280px)'); const update = () => setWide(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  useEffect(() => { if (advisor?.open && wide) closeButton.current?.querySelector('button')?.focus(); }, [advisor?.open, wide]);
  if (!advisor) return null;
  const actions = <div ref={closeButton} className="flex shrink-0 items-center justify-end gap-1">
    <Button variant="ghost" href="/dashboard/advisor" aria-label={text.fullPage} title={text.fullPage} className="!size-11 !p-0 text-xl"><span aria-hidden="true">↗</span></Button>
    <Button variant="ghost" onClick={advisor.close} data-dialog-cancel aria-label={text.close} title={text.close} className="!size-11 !p-0 text-2xl"><span aria-hidden="true">×</span></Button>
  </div>;
  const conversation = <AdvisorConversation companyId={advisor.companyId} environment={advisor.environment} active={advisor.open} seed={advisor.seed} />;
  if (wide) return <aside data-advisor-docked={advisor.open ? '' : undefined} hidden={!advisor.open} aria-label={text.title} className={`min-h-0 flex-col border-l border-outline-strong bg-surface-panel ${advisor.open ? 'flex' : '!hidden'}`}>
    <header className="flex min-h-[60px] shrink-0 items-center justify-between border-b border-outline px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="size-[26px] shrink-0 rounded-[8px] bg-[image:var(--primary-gradient)]" />
        <h2 className="text-lg font-semibold leading-tight">{text.title}</h2>
      </div>
      {actions}
    </header>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{conversation}</div>
  </aside>;
  return <NativeDialog open={advisor.open} title={text.title} sheet="always" onClose={advisor.close}
    className="h-[90dvh] max-h-[760px] max-w-xl overflow-hidden [&>div]:!flex [&>div]:!h-full [&>div]:!min-h-0 [&>div]:!flex-col [&>div]:!gap-0 [&>div]:!p-0 [&>div>*]:!mb-0 [&>div>div:nth-child(1)]:!mt-2.5 [&>div>div:nth-child(1)]:shrink-0 [&>div>div:nth-child(2)]:!flex [&>div>div:nth-child(2)]:min-h-14 [&>div>div:nth-child(2)]:shrink-0 [&>div>div:nth-child(2)]:items-center [&>div>div:nth-child(2)]:border-b [&>div>div:nth-child(2)]:border-outline [&>div>div:nth-child(2)]:pl-4 [&>div>div:nth-child(2)]:pr-28 [&>div>div:nth-child(2)>h2]:!text-base">
    <div className="absolute right-3 top-4">{actions}</div>
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{conversation}</div>
  </NativeDialog>;
}
