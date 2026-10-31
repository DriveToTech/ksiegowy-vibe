import { Builder } from 'builder-pattern';
import type { AdvisorTaxSource } from '@ksiegowy/types';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadAdvisorSources, selectAdvisorSources } from './advisor-sources.js';
import type { AdvisorSourceTopic } from './advisor-source-topics.js';

const corpusDirectory = join(import.meta.dirname, '../../../../../docs/specs/tax-advisor-corpus');
const draftPath = join(corpusDirectory, 'sources.draft.json');
const evaluationPath = join(corpusDirectory, 'eval-set.json');

describe('selectAdvisorSources()', () => {
  it('requires complete period coverage and a current review, including for historical questions', () => {
    const source = Builder<AdvisorTaxSource>().id('law').effectiveFrom('2025-01-01').effectiveUntil('2025-12-31')
      .reviewedAt('2026-09-01').reviewExpiresAt('2026-09-30').build();
    expect(selectAdvisorSources([source], '2025-09', new Date('2026-09-19'))).toEqual([source]);
    expect(selectAdvisorSources([source], '2026-09', new Date('2026-09-19'))).toEqual([]);
    expect(selectAdvisorSources([source], '2025-09', new Date('2026-10-01'))).toEqual([]);
  });
});

describe('selectAdvisorSources() period and review boundaries', () => {
  const source = Builder<AdvisorTaxSource>().id('law').effectiveFrom('2026-09-01').effectiveUntil('2026-09-30')
    .reviewedAt('2026-09-10').reviewExpiresAt('2026-09-20').build();

  it('accepts a source covering exactly the first to the last day of the month', () => {
    expect(selectAdvisorSources([source], '2026-09', new Date('2026-09-20T23:00:00Z'))).toEqual([source]);
  });

  it('rejects a source ending before the last day of the month or starting after the first day', () => {
    expect(selectAdvisorSources([{ ...source, effectiveUntil: '2026-09-29' }], '2026-09', new Date('2026-09-15'))).toEqual([]);
    expect(selectAdvisorSources([{ ...source, effectiveFrom: '2026-09-02' }], '2026-09', new Date('2026-09-15'))).toEqual([]);
  });

  it('rejects a stale review the day after it expires and a review dated in the future', () => {
    expect(selectAdvisorSources([source], '2026-09', new Date('2026-09-21'))).toEqual([]);
    expect(selectAdvisorSources([source], '2026-09', new Date('2026-09-09'))).toEqual([]);
  });
});

describe('selectAdvisorSources() topic retrieval', () => {
  const now = new Date('2026-10-01');
  const reviewedSource = (id: string, topics: AdvisorSourceTopic[] | undefined, effectiveFrom = '2026-01-01') =>
    Builder<AdvisorTaxSource & { topics?: AdvisorSourceTopic[] }>().id(id).topics(topics as never).effectiveFrom(effectiveFrom).effectiveUntil('2026-12-31')
      .reviewedAt('2026-09-01').reviewExpiresAt('2026-12-01').build();

  it('selects sources from different topics for the question topic', () => {
    const rates = reviewedSource('rates', ['vat-rates']);
    const correction = reviewedSource('correction', ['correction']);
    expect(selectAdvisorSources([rates, correction], '2026-10', now, 'Jaka jest stawka VAT?').map((source) => source.id)).toEqual(['rates']);
    expect(selectAdvisorSources([rates, correction], '2026-10', now, 'Jak wystawić fakturę korygującą?').map((source) => source.id)).toEqual(['correction']);
  });

  it('ranks by topic match count, then by newest effective period, and returns at most eight', () => {
    const sources = [
      reviewedSource('older-single', ['ksef-obligation'], '2026-01-01'),
      reviewedSource('newer-single', ['ksef-obligation'], '2026-04-01'),
      reviewedSource('double', ['ksef-obligation', 'ksef-failure'], '2026-01-01'),
      ...Array.from({ length: 8 }, (_, index) => reviewedSource(`filler-${index}`, ['ksef-obligation'], '2026-02-01')),
    ];
    const selected = selectAdvisorSources(sources, '2026-10', now, 'KSeF ma awarię');
    expect(selected).toHaveLength(8);
    expect(selected.slice(0, 3).map((source) => source.id)).toEqual(['double', 'newer-single', 'filler-0']);
    expect(selected.every((source) => !('topics' in source))).toBe(true);
  });

  it('is diacritic insensitive and keeps untopiced sources as general entries', () => {
    const general = reviewedSource('general', undefined);
    const split = reviewedSource('split', ['split-payment']);
    expect(selectAdvisorSources([general, split], '2026-10', now, 'Mechanizm PODZIELONEJ płatności').map((source) => source.id)).toEqual(['split', 'general']);
  });

  it('falls back to every eligible source ranked by recency when no topic matches', () => {
    const older = reviewedSource('older', ['vat-rates'], '2026-01-01');
    const newer = reviewedSource('newer', ['correction'], '2026-06-01');
    expect(selectAdvisorSources([older, newer], '2026-10', now, 'Dzień dobry').map((source) => source.id)).toEqual(['newer', 'older']);
  });

  it('still applies period coverage and review filters before topic ranking', () => {
    const notCoveringMonth = Builder<AdvisorTaxSource & { topics?: AdvisorSourceTopic[] }>().id('partial').topics(['vat-rates']).effectiveFrom('2026-10-15')
      .effectiveUntil('2026-12-31').reviewedAt('2026-09-01').reviewExpiresAt('2026-12-01').build();
    const expiredReview = Builder<AdvisorTaxSource & { topics?: AdvisorSourceTopic[] }>().id('expired').topics(['vat-rates']).effectiveFrom('2026-01-01')
      .effectiveUntil('2026-12-31').reviewedAt('2026-06-01').reviewExpiresAt('2026-09-30').build();
    expect(selectAdvisorSources([notCoveringMonth, expiredReview], '2026-10', now, 'Jaka stawka VAT?')).toEqual([]);
  });

  it('fails closed when the question topic has no reviewed source', () => {
    const rates = reviewedSource('rates', ['vat-rates']);
    expect(selectAdvisorSources([rates], '2026-10', now, 'Co zrobić gdy KSeF ma awarię?')).toEqual([]);
  });
});

describe('loadAdvisorSources()', () => {
  const validSource = { id: 'rates', title: 'Rates', url: 'https://eli.gov.pl/act', section: 'art. 41', effectiveFrom: '2026-01-01', effectiveUntil: '2026-12-31',
    reviewedAt: '2026-09-01', reviewExpiresAt: '2026-12-01', reviewedBy: 'Reviewer', excerpt: 'Excerpt' };
  const loadFrom = async (sources: unknown) => {
    const directory = await mkdtemp(join(tmpdir(), 'advisor-sources-'));
    const sourcePath = join(directory, 'sources.json');
    await writeFile(sourcePath, JSON.stringify(sources));
    vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', sourcePath);
    return loadAdvisorSources().finally(() => vi.unstubAllEnvs());
  };

  it('accepts sources with and without topics', async () => {
    const loaded = await loadFrom([validSource, { ...validSource, id: 'tagged', topics: ['vat-rates'] }]);
    expect(loaded.sources.map((source) => source.id)).toEqual(['rates', 'tagged']);
  });

  it('rejects unknown, duplicated and oversized topics', async () => {
    await expect(loadFrom([{ ...validSource, topics: ['invented'] }])).rejects.toThrow();
    await expect(loadFrom([{ ...validSource, topics: ['vat-rates', 'vat-rates'] }])).rejects.toThrow();
    await expect(loadFrom([{ ...validSource, topics: [] }])).rejects.toThrow();
  });

  it('rejects the pending-review draft corpus', async () => {
    const draft = JSON.parse(await readFile(draftPath, 'utf8')) as { sources: unknown[] };
    await expect(loadFrom(draft.sources)).rejects.toThrow();
  });
});

describe('draft corpus retrieval against eval-set.json', () => {
  it('retrieves every required source for the answer cases from a synthetic reviewed copy', async () => {
    const draft = JSON.parse(await readFile(draftPath, 'utf8')) as { sources: Array<Record<string, unknown>> };
    const evaluation = JSON.parse(await readFile(evaluationPath, 'utf8')) as { evaluationDate: string; cases: Array<{
      id: string; expectedBehavior: string; question: string; period: string; requiredSourceIds: string[] }> };
    const reviewedCopy = draft.sources.map((source) => ({ id: source['id'], title: source['title'], url: source['url'], section: source['section'],
      effectiveFrom: source['effectiveFrom'], effectiveUntil: source['effectiveUntil'], excerpt: source['excerpt'], topics: source['topics'],
      reviewedBy: 'Test reviewer', reviewedAt: '2026-09-01', reviewExpiresAt: '2026-12-31' }));
    const { sources } = await (async () => {
      const directory = await mkdtemp(join(tmpdir(), 'advisor-draft-'));
      const sourcePath = join(directory, 'sources.json');
      await writeFile(sourcePath, JSON.stringify(reviewedCopy));
      vi.stubEnv('ADVISOR_TAX_SOURCES_PATH', sourcePath);
      return loadAdvisorSources().finally(() => vi.unstubAllEnvs());
    })();
    const missing = evaluation.cases.filter((evaluationCase) => evaluationCase.expectedBehavior === 'answer').flatMap((evaluationCase) => {
      const selectedIds = selectAdvisorSources(sources, evaluationCase.period, new Date(evaluation.evaluationDate), evaluationCase.question).map((source) => source.id);
      return evaluationCase.requiredSourceIds.filter((identifier) => !selectedIds.includes(identifier)).map((identifier) => `${evaluationCase.id}:${identifier}`);
    });
    expect(missing).toEqual([]);
  });
});
