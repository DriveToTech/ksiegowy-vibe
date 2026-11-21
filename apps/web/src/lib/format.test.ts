import { describe, expect, it } from 'vitest';
import { formatMoney } from './format';

describe('formatMoney()', () => {
  it('groups four-digit amounts with a thousands separator', () => {
    expect(formatMoney(1180.8).replace(/\s/g, ' ')).toBe('1 180,80 zł');
  });
});
