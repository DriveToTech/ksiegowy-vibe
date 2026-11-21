import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Builder } from 'builder-pattern';
import { describe, expect, it } from 'vitest';
import type { AdvisorAnswer } from '../../lib/advisor-api';
import { AdvisorAnswerCard } from './AdvisorAnswerCard';

const provenance = { companyId: 'company', environment: 'TEST', period: '2026-10', provider: 'OPENAI', model: 'model', generatedAt: '2026-10-01T10:00:00.000Z', recordsIncluded: true, evidenceTruncated: false, sourceVersion: 'v1', sourceReviewMethod: 'ai' } as const;
const baseAnswer = () => Builder<AdvisorAnswer>().status('answered').shortAnswer('Odpowiedź').explanation('Wyjaśnienie').assumptions([]).questions([]).calculations([]).sources([]).evidence([]).provenance(provenance);
const source = { id: 'source', title: 'VAT Act', url: 'https://example.org/law', section: '1', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31', reviewedAt: '2026-09-01', reviewExpiresAt: '2026-12-31', reviewedBy: 'ai:OPENAI/model-a+ai:ANTHROPIC/model-b', reviewMethod: 'ai', excerpt: 'Relevant section' } as const;
const evidence = (id: string) => ({ id, kind: 'outgoing', title: id, status: 'ISSUED', currency: 'PLN', gross: '4920.00', vat: '920.00', updatedAt: '2026-09-01T00:00:00.000Z' }) as const;
const render = (answer: AdvisorAnswer, fromHistory = false) => renderToStaticMarkup(createElement(AdvisorAnswerCard, { answer, fromHistory }));

describe('AdvisorAnswerCard()', () => {
  it('renders 2x2 pl-PL tiles with rejected amount, chips with +N, and expanders', () => {
    const markup = render(baseAnswer().disclaimer('Server disclaimer text').calculations([{ currency: 'PLN', issuedGross: '12300.00', issuedVat: '2300.00', acceptedGross: '7380.00', rejectedGross: '4920.00', invoiceCount: 6 }])
      .evidence([evidence('FV/1'), evidence('FV/2'), evidence('FV/3')]).sources([source]).build());
    expect(markup).toContain('12 300,00 zł');
    expect(markup).toContain('4920,00\u00a0zł');
    expect(markup).toContain('VAT Act, 1 · 2026');
    expect(markup).toContain('text-warning-ink');
    expect(markup).toMatch(/<p role="note"[^>]*>.*Server disclaimer text<\/p>/);
    expect(markup).toContain('+2 dokumentów');
    expect(markup).toContain('href="/dashboard/invoices/FV%2F1"');
    expect(markup).toContain('href="https://example.org/law" target="_blank" rel="noopener noreferrer"');
    expect(markup).toContain('Dokumenty źródłowe (3)');
    expect(markup).toContain('Sprawdzone przez AI · OPENAI/model-a + ANTHROPIC/model-b · 2026-09-01');
    expect(markup).toContain('dane firmy dołączone');
  });

  it('omits disclaimer and expiry note for records-only answers', () => {
    const markup = render(baseAnswer().build());
    expect(markup).not.toContain('role="note"');
    expect(markup).not.toContain('<details');
  });

  it('shows no tiles, chips or expanders for declined answers', () => {
    const markup = render(baseAnswer().status('declined').evidence([evidence('FV/1')]).sources([source]).build());
    expect(markup).not.toContain('<details');
    expect(markup).not.toContain('Odwołania');
    expect(markup).not.toContain('<dl');
  });

  it('marks history answers and warns when a source review has expired', () => {
    const markup = render(baseAnswer().sources([{ ...source, reviewExpiresAt: '2020-01-01' }]).build(), true);
    expect(markup).toContain('Z historii');
    expect(markup).toContain('Przegląd źródła „VAT Act, 1” wygasł 01.01.2020');
    expect(markup).not.toContain('Kopiuj odpowiedź');
  });

  it('renders contractor balance by currency with its limitation', () => {
    const markup = render(baseAnswer().contractorBalance({ contractorId: 'c', name: 'Example contractor', period: '2026-09', balances: [{ currency: 'EUR', currentOutstanding: '40.00', recordedPayments: '0.00' }] }).build());
    expect(markup).toContain('Example contractor');
    expect(markup).toContain('40,00 €');
    expect(markup).toContain('a nie stan historyczny');
  });
});
