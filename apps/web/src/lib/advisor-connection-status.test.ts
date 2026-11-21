import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { AdvisorConnectionSummary, AdvisorSettings } from './advisor-api';
import { advisorConversationBlocker, embeddedConnectionReadiness } from './advisor-connection-status';

describe('embeddedConnectionReadiness()', () => {
  it('reports a disabled company policy', () => {
    const settings = Builder<AdvisorSettings>().enabled(false).operatorEnabled(true).allowedProviders(['OPENROUTER']).connections([]).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toMatchObject({ policy: 'disabled', runtime: 'enabled', canDiscover: false, canTest: false });
  });

  it('reports a denied provider while the runtime is enabled', () => {
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders(['OPENAI']).connections([]).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toMatchObject({ policy: 'denied', runtime: 'enabled', canDiscover: false });
  });

  it('reports a disabled runtime separately from the policy', () => {
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(false).allowedProviders(['OPENROUTER']).connections([]).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toMatchObject({ policy: 'allowed', runtime: 'disabled', canDiscover: false });
  });

  it('reports a saved connection that was not tested', () => {
    const connection = Builder<AdvisorConnectionSummary>().provider('OPENROUTER').testedAt(null).build();
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders(['OPENROUTER']).connections([connection]).ollamaAvailable(false).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toEqual({
      policy: 'allowed', runtime: 'enabled', connection: 'savedNotTested', ollamaConfigured: false,
      canDiscover: true, canTest: true, readyForQuestions: false,
    });
  });

  it('reports a tested connection as ready for questions', () => {
    const connection = Builder<AdvisorConnectionSummary>().provider('OPENROUTER').testedAt('2026-10-01T10:00:00.000Z').build();
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders(['OPENROUTER']).connections([connection]).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toMatchObject({ connection: 'tested', canTest: true, readyForQuestions: true });
  });

  it('blocks a tested connection when the policy no longer allows the provider', () => {
    const connection = Builder<AdvisorConnectionSummary>().provider('OPENROUTER').testedAt('2026-10-01T10:00:00.000Z').build();
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders([]).connections([connection]).build();

    expect(embeddedConnectionReadiness(settings, 'OPENROUTER')).toMatchObject({ connection: 'tested', canTest: false, readyForQuestions: false });
  });

  it('reports whether Ollama is configured by the operator', () => {
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders(['OLLAMA']).connections([]).ollamaAvailable(false).build();

    expect(embeddedConnectionReadiness(settings, 'OLLAMA')).toMatchObject({ connection: 'notConfigured', ollamaConfigured: false });
  });
});

describe('advisorConversationBlocker()', () => {
  const base = () => Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).allowedProviders(['OPENAI']).canManageConnections(true).connections([]);

  it('applies precedence operator, company, provider, viewer, connection', () => {
    expect(advisorConversationBlocker(base().operatorEnabled(false).enabled(false).build(), 'OPENAI').blocker).toBe('operator');
    expect(advisorConversationBlocker(base().enabled(false).allowedProviders([]).build(), 'OPENAI').blocker).toBe('company');
    expect(advisorConversationBlocker(base().canManageConnections(false).build(), 'OPENROUTER').blocker).toBe('provider');
    expect(advisorConversationBlocker(base().canManageConnections(false).build(), 'OPENAI').blocker).toBe('viewer');
    expect(advisorConversationBlocker(base().build(), 'OPENAI').blocker).toBe('connection');
  });

  it('lets a viewer with an existing connection chat and flags an untested one', () => {
    const connection = Builder<AdvisorConnectionSummary>().provider('OPENAI').testedAt(null).build();
    const settings = base().canManageConnections(false).connections([connection]).build();

    expect(advisorConversationBlocker(settings, 'OPENAI')).toEqual({ blocker: null, untested: true });
  });
});
