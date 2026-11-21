import type { AdvisorProvider, AdvisorSettings } from './advisor-api';

export interface EmbeddedConnectionReadiness {
  policy: 'disabled' | 'denied' | 'allowed';
  runtime: 'enabled' | 'disabled';
  connection: 'notConfigured' | 'savedNotTested' | 'tested';
  ollamaConfigured: boolean;
  canDiscover: boolean;
  canTest: boolean;
  readyForQuestions: boolean;
}

export function embeddedConnectionReadiness(settings: AdvisorSettings, provider: AdvisorProvider): EmbeddedConnectionReadiness {
  const policy = !settings.enabled ? 'disabled' : settings.allowedProviders.includes(provider) ? 'allowed' : 'denied';
  const runtime = settings.operatorEnabled ? 'enabled' : 'disabled';
  const saved = settings.connections.find((entry) => entry.provider === provider);
  const connection = !saved ? 'notConfigured' : saved.testedAt ? 'tested' : 'savedNotTested';
  const canDiscover = runtime === 'enabled' && policy === 'allowed';
  return {
    policy, runtime, connection,
    ollamaConfigured: settings.ollamaAvailable,
    canDiscover,
    canTest: canDiscover && connection !== 'notConfigured',
    readyForQuestions: canDiscover && connection === 'tested',
  };
}

export type AdvisorConversationBlocker = 'operator' | 'company' | 'provider' | 'viewer' | 'connection';

/** Precedence: operator, company, provider, viewer (cannot save a connection, so none will appear), connection. */
export function advisorConversationBlocker(settings: AdvisorSettings, provider: AdvisorProvider): { blocker: AdvisorConversationBlocker | null; untested: boolean } {
  const saved = settings.connections.find((entry) => entry.provider === provider);
  const blocker = !settings.operatorEnabled ? 'operator'
    : !settings.enabled ? 'company'
    : !settings.allowedProviders.includes(provider) ? 'provider'
    : !saved && !settings.canManageConnections ? 'viewer'
    : !saved ? 'connection'
    : null;
  return { blocker, untested: blocker === null && !saved?.testedAt };
}
