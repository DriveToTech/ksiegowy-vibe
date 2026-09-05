'use client';

import { useState, type ReactNode } from 'react';
import { cn } from '../../../lib/cn';
import { t } from '../../../lib/translations';

type SectionId = 'company' | 'ksef' | 'numbering' | 'products' | 'team' | 'backup';

const SECTION_ORDER: SectionId[] = ['company', 'ksef', 'numbering', 'products', 'team', 'backup'];

interface SettingsWorkspaceProps {
  sections: Partial<Record<SectionId, ReactNode>>;
}

export function SettingsWorkspace({ sections }: SettingsWorkspaceProps) {
  const available = SECTION_ORDER.filter((id) => sections[id] !== undefined);
  const [active, setActive] = useState<SectionId | null>(null);
  const effectiveActive = active !== null && available.includes(active) ? active : available[0];

  if (!effectiveActive) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start">
      <nav className="flex gap-1 overflow-x-auto rounded-control border border-outline bg-surface-panel p-1.5 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0">
        <p className="hidden px-2.5 pb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted lg:block">
          {t.settings.sectionsEyebrow}
        </p>
        {available.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            aria-current={id === effectiveActive ? 'true' : undefined}
            className={cn(
              'shrink-0 rounded-control px-3 py-2 text-left text-[13px] transition',
              id === effectiveActive ? 'bg-foreground/5 text-foreground' : 'text-muted hover:text-foreground-secondary',
            )}
          >
            {t.settings.sections[id]}
          </button>
        ))}
      </nav>

      <div className="min-w-0 space-y-6">{sections[effectiveActive]}</div>
    </div>
  );
}
