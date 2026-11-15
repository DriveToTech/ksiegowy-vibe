'use client';

import { useState } from 'react';
import type { AdvisorEnvironment } from '../../lib/advisor-api';
import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';
import { Button } from '../atoms/Button';
import { AdvisorBriefingCard } from './AdvisorBriefingCard';
import { AdvisorConversation, type AdvisorConversationSeed } from './AdvisorConversation';
import { AdvisorHistory } from './AdvisorHistory';
import { advisorSecondaryButtonClassName } from './AdvisorThread';

/** Full-page advisor: at 1280+ history column (300px) beside the conversation card; below that a "Historia" button swaps them. */
export function AdvisorPageWorkspace({ companyId, environment }: { companyId: string; environment: AdvisorEnvironment }) {
  const [seed, setSeed] = useState<AdvisorConversationSeed>({ question: '', revision: 0 });
  const [openRequest, setOpenRequest] = useState<{ id: string | null; revision: number }>({ id: null, revision: 0 });
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const open = (id: string | null) => { setOpenRequest((previous) => ({ id, revision: previous.revision + 1 })); setHistoryVisible(false); };

  return <div className="flex h-full min-h-[560px] flex-col gap-4">
    <header className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">{text.briefingCard.pageEyebrow(environment)}</p>
        <h1 className="text-xl font-semibold leading-[1.3] tracking-[-0.02em] text-foreground sm:text-[25px]">{text.title}</h1>
      </div>
      <Button type="button" variant="secondary" className={cn('gap-2 xl:hidden', advisorSecondaryButtonClassName)} aria-pressed={historyVisible} onClick={() => setHistoryVisible((visible) => !visible)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-5 flex-none"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4.5h4.5" /><path d="M12 7.5V12l3 2" /></svg>
        {text.briefingCard.historyButton}
      </Button>
    </header>
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <div className={cn('min-h-0 flex-col xl:flex', historyVisible ? 'flex' : 'hidden')}>
        <AdvisorHistory companyId={companyId} environment={environment} layout="column" currentConversationId={currentConversationId}
          onSelect={open} onNew={() => open(null)} onDeleted={(id) => { if (id === currentConversationId) open(null); }} />
      </div>
      <div className={cn('min-h-0 flex-col overflow-hidden rounded-card border border-outline bg-surface-panel xl:flex', historyVisible ? 'hidden' : 'flex')}>
        <AdvisorConversation companyId={companyId} environment={environment} active variant="page" seed={seed}
          emptyHeader={<AdvisorBriefingCard onPrepare={(period) => { setSeed((previous) => ({ question: text.briefingQuestion, period, briefing: true, revision: previous.revision + 1 })); setHistoryVisible(false); }} />}
          openRequest={openRequest} onConversationChange={setCurrentConversationId} />
      </div>
    </div>
  </div>;
}
