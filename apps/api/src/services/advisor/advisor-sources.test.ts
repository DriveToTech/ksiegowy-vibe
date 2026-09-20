import { Builder } from 'builder-pattern';
import type { AdvisorTaxSource } from '@ksiegowy/types';
import { describe, expect, it } from 'vitest';
import { selectAdvisorSources } from './advisor-sources.js';

describe('selectAdvisorSources()', () => {
  it('requires complete period coverage and a current review, including for historical questions', () => {
    const source = Builder<AdvisorTaxSource>().id('law').effectiveFrom('2025-01-01').effectiveUntil('2025-12-31')
      .reviewedAt('2026-09-01').reviewExpiresAt('2026-09-30').build();
    expect(selectAdvisorSources([source], '2025-09', new Date('2026-09-19'))).toEqual([source]);
    expect(selectAdvisorSources([source], '2026-09', new Date('2026-09-19'))).toEqual([]);
    expect(selectAdvisorSources([source], '2025-09', new Date('2026-10-01'))).toEqual([]);
  });
});
