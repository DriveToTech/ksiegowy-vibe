import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { AdvisorAnswer, AdvisorSettings } from '../../lib/advisor-api';
import { AdvisorAnswerCard } from './AdvisorAnswerCard';
import { AdvisorQuestionKindChoice } from './AdvisorQuestionKindChoice';
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
    const settings = Builder<AdvisorSettings>().enabled(true).operatorEnabled(true).ollamaAvailable(false)
      .allowedProviders(['OPENROUTER']).connections([
        { provider: 'ANTHROPIC', model: 'claude-model', hasCredential: true, testedAt: '2026-09-01T00:00:00.000Z' },
      ]).build();
    const markup = renderToStaticMarkup(createElement(AdvisorProviderChoice, {
      settings, companyName: 'Example company', provider: 'OPENROUTER', onChange: () => undefined,
    }));
    expect(markup).toMatch(/<input[^>]+checked=""[^>]+value="OPENROUTER"/);
    expect(markup).toContain('<details open=""');
    expect(markup).toContain('Brak serwera');
    expect(markup).toContain('Niedozwolony');
    expect(markup).toContain('Przetestowane');
    expect(markup).toContain('Example company');
  });
});

describe('AdvisorAnswerCard()', () => {
  it('renders separate currency calculations, safe evidence links, reviewed sources and truncation notice', () => {
    const answer = Builder<AdvisorAnswer>().status('answered').shortAnswer('Suma sprzedaży').explanation('Dokumenty z okresu')
      .assumptions([]).questions([]).calculations([
        { currency: 'PLN', issuedGross: '100.00', issuedVat: '18.70', acceptedGross: '100.00', invoiceCount: 1 },
        { currency: 'EUR', issuedGross: '50.00', issuedVat: '9.35', acceptedGross: '0.00', invoiceCount: 1 },
      ]).evidence([
        { id: 'FV/1', kind: 'outgoing', title: 'FV/1', status: 'ISSUED', currency: 'PLN', gross: '100.00', vat: '18.70', updatedAt: '2026-09-01T00:00:00.000Z' },
        { id: 'IN/1', kind: 'incoming', title: 'IN/1', status: 'PENDING', currency: 'EUR', gross: '50.00', vat: '9.35', updatedAt: '2026-09-01T00:00:00.000Z' },
      ]).sources([{ id: 'source', title: 'VAT Act', url: 'https://example.org/law', section: '1', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31', reviewedAt: '2026-09-01', reviewExpiresAt: '2026-12-31', reviewedBy: 'Reviewer', excerpt: 'Relevant section' }])
      .provenance({ companyId: 'company', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'model', generatedAt: '2026-09-01T00:00:00.000Z', recordsIncluded: true, evidenceTruncated: true, sourceVersion: 'v1' }).build();
    const markup = renderToStaticMarkup(createElement(AdvisorAnswerCard, { answer }));
    expect(markup).toContain('100.00 PLN');
    expect(markup).toContain('50.00 EUR');
    expect(markup).toContain('href="/dashboard/invoices/FV%2F1"');
    expect(markup).toContain('href="/dashboard/incoming/IN%2F1"');
    expect(markup).toContain('href="https://example.org/law" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('Lista dokumentów jest ograniczona');
    expect(markup).toContain('Relevant section');
  });
  it('renders a selected contractor balance by currency with its accounting limitation and linked evidence', () => {
    const answer = Builder<AdvisorAnswer>().status('answered').shortAnswer('Saldo do sprawdzenia')
      .explanation('Porównaj wystawione faktury.').assumptions([]).questions([]).calculations([]).sources([])
      .evidence([{ id: 'invoice/1', kind: 'outgoing', title: 'FV/2026/1', status: 'ISSUED',
        currency: 'PLN', gross: '125.00', vat: '25.00', updatedAt: '2026-09-01T00:00:00.000Z' }])
      .contractorBalance({ contractorId: 'selected', name: 'Example contractor', period: '2026-09',
        balances: [{ currency: 'PLN', currentOutstanding: '100.00', recordedPayments: '25.00' },
          { currency: 'EUR', currentOutstanding: '40.00', recordedPayments: '0.00' }] })
      .provenance({ companyId: 'company', environment: 'TEST', period: '2026-09', provider: 'OPENAI', model: 'model',
        generatedAt: '2026-09-01T00:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'none' }).build();

    const markup = renderToStaticMarkup(createElement(AdvisorAnswerCard, { answer }));
    expect(markup).toContain('Example contractor');
    expect(markup).toContain('100.00 PLN');
    expect(markup).toContain('40.00 EUR');
    expect(markup).toContain('a nie stan historyczny');
    expect(markup).toContain('Wpłaty zapisane na tych fakturach');
    expect(markup).not.toContain('Zapłacono w tym roku');
    expect(markup).toContain('href="/dashboard/invoices/invoice%2F1"');
    expect(markup).not.toContain('/dashboard/invoices/new');
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
