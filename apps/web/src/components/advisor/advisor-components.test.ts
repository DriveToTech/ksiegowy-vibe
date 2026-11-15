import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { AdvisorConnectorSettings, AdvisorSettings } from '../../lib/advisor-api';
import { AdvisorConnectors } from './AdvisorConnectors';
import { AdvisorProviderConnection } from './AdvisorProviderConnection';
import { AdvisorQuestionKindChoice } from './AdvisorQuestionKindChoice';
import { AdvisorPolicyForm } from './AdvisorPolicyForm';
import { AdvisorProviderChoice } from './AdvisorProviderChoice';
import { AdvisorReadinessSummary } from './AdvisorReadinessSummary';

describe('AdvisorReadinessSummary()', () => {
  it('announces loading and then displays each readiness reason and state', () => {
    const loading = renderToStaticMarkup(createElement(AdvisorReadinessSummary, { rows: null }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('aria-hidden="true"');
    expect(loading).not.toContain('Administrator musi zezwolić');

    const ready = renderToStaticMarkup(createElement(AdvisorReadinessSummary, { rows: [
      { label: 'Zgoda firmy', chip: 'Niedozwolony', tone: 'danger', reason: 'Administrator musi zezwolić na model.' },
      { label: 'Serwer', chip: 'Włączony', tone: 'success' },
    ] }));
    expect(ready).toContain('aria-busy="false"');
    expect(ready).toContain('Administrator musi zezwolić na model.');
    expect(ready).toContain('Niedozwolony');
    expect(ready).toContain('Włączony');
    expect(ready).not.toContain('aria-hidden="true"');
  });
});

describe('AdvisorProviderChoice()', () => {
  it('keeps saved alternate providers visible and shows denied, tested and operator statuses', () => {
    const settings = Builder<AdvisorSettings>().canManageConnections(true).enabled(true).operatorEnabled(true).ollamaAvailable(false)
      .allowedProviders(['OPENROUTER']).connections([
        { provider: 'ANTHROPIC', model: 'claude-model', hasCredential: true, testedAt: '2026-09-01T00:00:00.000Z' },
      ]).build();
    const markup = renderToStaticMarkup(createElement(AdvisorProviderChoice, {
      settings, provider: 'OPENROUTER', onChange: () => undefined,
    }));
    expect(markup).toMatch(/<input[^>]+checked=""[^>]+value="OPENROUTER"/);
    expect(markup).toContain('<details open=""');
    expect(markup).toContain('Brak serwera');
    expect(markup).toContain('Niedozwolony');
    expect(markup).toContain('Przetestowane');
    expect(markup).toContain('Inni dostawcy API (OpenAI API, Anthropic API)');
  });
});

describe('AdvisorQuestionKindChoice()', () => {
  it('disables tax with a linked reason when the period has no reviewed sources, keeping records selectable', () => {
    const markup = renderToStaticMarkup(createElement(AdvisorQuestionKindChoice, { value: 'records', taxUnavailable: true, disabled: false, onChange: () => undefined }));
    expect(markup).toContain('aria-describedby="advisor-tax-unavailable"');
    expect(markup).toContain('<option value="tax" disabled="">');
    expect(markup).toContain('<option value="records" selected="">');
    expect(markup).toContain('id="advisor-tax-unavailable"');
    expect(markup).toContain('Skonsultuj się z księgowym');
  });

  it('keeps tax selectable without a reason when coverage is available or unknown', () => {
    const markup = renderToStaticMarkup(createElement(AdvisorQuestionKindChoice, { value: 'tax', taxUnavailable: false, disabled: false, onChange: () => undefined }));
    expect(markup).not.toContain('aria-describedby');
    expect(markup).not.toContain('<option value="tax" disabled');
    expect(markup).not.toContain('advisor-tax-unavailable');
  });
});

describe('AdvisorProviderConnection()', () => {
  it('explains the role requirement, disables saving inputs and keeps disconnect enabled for a viewer', () => {
    const settings = Builder<AdvisorSettings>().canManageConnections(false).canManagePolicy(false).enabled(true).operatorEnabled(true).ollamaAvailable(false)
      .allowedProviders(['OPENAI']).connections([{ provider: 'OPENAI', model: 'saved-model', hasCredential: true, testedAt: null }]).build();
    const markup = renderToStaticMarkup(createElement(AdvisorProviderConnection, { companyId: 'company', settings, provider: 'OPENAI', onChanged: async () => undefined }));
    expect(markup).toContain('Twoja rola nie pozwala zapisać połączenia');
    expect(markup).toContain('<fieldset disabled=""');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Zapisz połączenie<\/button>/);
    expect(markup).toMatch(/<button[^>]*class="[^"]*"[^>]*>Odłącz<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Odłącz<\/button>/);
  });
});

describe('AdvisorPolicyForm()', () => {
  it('renders the company switch as its own row and disables provider and host choices while it is off', () => {
    const settings = Builder<AdvisorSettings>().canManagePolicy(true).enabled(false).allowedProviders([]).allowedConnectors([]).retentionDays(30).build();
    const markup = renderToStaticMarkup(createElement(AdvisorPolicyForm, { companyId: 'company', settings, onChanged: async () => undefined }));
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="false"');
    expect(markup.indexOf('Doradca dla tej firmy')).toBeLessThan(markup.indexOf('Dozwoleni dostawcy'));
    expect(markup.match(/type="checkbox"[^>]*disabled=""/g)).toHaveLength(6);
  });
});

describe('AdvisorConnectors()', () => {
  it('blocks granting with the role reason, hides re-grant and keeps revoke enabled for a viewer', () => {
    const connectors = Builder<AdvisorConnectorSettings>().endpoint('https://api.example.com/advisor/mcp').clients(['CHATGPT']).grants([
      { client: 'CHATGPT', environment: 'TEST', status: 'ACTIVE', expiresAt: '2099-01-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null },
      { client: 'CHATGPT', environment: 'PRODUCTION', status: 'EXPIRED', expiresAt: '2026-01-01T00:00:00.000Z', lastUsedAt: null, revokedAt: null },
    ]).build();
    const markup = renderToStaticMarkup(createElement(AdvisorConnectors, { companyId: 'company', companyName: 'Example', connectors, loadError: '', allowedClients: ['CHATGPT'], canManageConnections: false, onChanged: async () => undefined }));
    expect(markup).toContain('id="advisor-grant-reason" class="text-xs text-muted">Tylko administrator lub księgowy');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Zezwól na odczyt<\/button>/);
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>Cofnij zgodę<\/button>/);
    expect(markup).toContain('Cofnij zgodę');
    expect(markup).not.toContain('Zezwól ponownie');
  });
});
