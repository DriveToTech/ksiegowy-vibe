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
