'use client';

import { advisorText as text } from '../../lib/advisor-translations';
import { cn } from '../../lib/cn';

export type AdvisorPlacement = 'dock' | 'drawer' | 'sheet';

const iconButton = 'inline-grid size-11 shrink-0 place-items-center rounded-[9px] text-foreground-secondary transition hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-5';
const iconProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const advisorMark = <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded-[5px] bg-[image:var(--primary-gradient)]" />;

interface AdvisorPanelHeaderProps {
  placement: AdvisorPlacement;
  view: 'conversation' | 'history';
  historyAvailable: boolean;
  onOpenHistory: () => void;
  onBack: () => void;
  onClose: () => void;
}

export function AdvisorPanelHeader({ placement, view, historyAvailable, onOpenHistory, onBack, onClose }: AdvisorPanelHeaderProps) {
  const sheet = placement === 'sheet';
  const titleClassName = cn('flex min-w-0 items-center gap-2.5 font-semibold', sheet ? 'text-base' : 'text-lg');
  return <header className={cn('flex shrink-0 items-center justify-between gap-2 border-b border-outline pl-4 pr-2', sheet ? 'min-h-14' : 'min-h-[60px]')}>
    {view === 'history'
      ? <h2 className={titleClassName}>
        <button type="button" onClick={onBack} aria-label={text.historyView.back} title={text.historyView.back} className={cn(iconButton, '-ml-3')}><svg {...iconProps}><path d="M15 6l-6 6 6 6" /></svg></button>
        {text.historyView.title}
      </h2>
      : placement === 'dock'
        ? <h2 className={titleClassName}>{advisorMark}{text.title}</h2>
        : <p aria-hidden="true" className={titleClassName}>{advisorMark}{text.title}</p>}
    <div className="flex shrink-0 items-center gap-1">
      {view === 'conversation' && historyAvailable && <button type="button" onClick={onOpenHistory} aria-label={text.history} title={text.history} className={iconButton}>
        <svg {...iconProps}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3 4v4.5h4.5" /><path d="M12 7.5V12l3 2" /></svg>
      </button>}
      {view === 'conversation' && !sheet && <a href="/dashboard/advisor" aria-label={text.fullPage} title={text.fullPage} className={iconButton}>
        <svg {...iconProps}><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" /></svg>
      </a>}
      <button id="advisor-close" type="button" onClick={onClose} data-dialog-cancel aria-label={text.close} title={text.close} className={iconButton}>
        <svg {...iconProps}><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </div>
  </header>;
}
