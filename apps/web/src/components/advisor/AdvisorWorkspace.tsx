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
  seed: { question: string; documentId?: string; documentKind?: 'outgoing' | 'incoming'; period?: string; revision: number };
  show: (question?: string, period?: string) => void; close: () => void;
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
  const show = (question = '', period?: string) => {
    focusedBeforeOpen.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const documentMatch = pathname.match(/^\/dashboard\/(invoices|incoming)\/([^/]+)$/);
    setSeed((previous) => ({ question, revision: previous.revision + 1, ...(period ? { period } : {}),
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

export function AdvisorTrigger({ mobile = false, explain = false, period, question }: { mobile?: boolean; explain?: boolean; period?: string; question?: string }) {
  const advisor = useContext(AdvisorContext);
  if (!advisor) return null;
  return <button type="button" aria-label={explain ? text.explain : text.open} aria-expanded={advisor.open} onClick={() => advisor.show(question ?? (explain ? text.explainQuestion : ''), period)}
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
  const contents = <><div ref={closeButton} className="flex flex-wrap justify-end"><Button variant="ghost" href="/dashboard/advisor">{text.fullPage}</Button><Button variant="ghost" onClick={advisor.close}>{text.close}</Button></div><AdvisorConversation companyId={advisor.companyId} environment={advisor.environment} active={advisor.open} seed={advisor.seed} /></>;
  if (wide) return <aside data-advisor-docked={advisor.open ? '' : undefined} hidden={!advisor.open} aria-label={text.title} className="min-h-0 overflow-y-auto border-l border-primary/30 bg-chrome p-4"><h2 className="text-lg font-semibold">{text.title}</h2>{contents}</aside>;
  return <NativeDialog open={advisor.open} title={text.title} bottomSheet onClose={advisor.close} className="mt-auto mb-0 max-h-[90dvh] w-full max-w-xl rounded-b-none">{contents}</NativeDialog>;
}
