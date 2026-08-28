import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { createRule, matchCategoryForPayee } from './categorization-rule.service.js';

// ── matchCategoryForPayee() ──────────────────────────────────────────────────

describe('matchCategoryForPayee()', () => {
  const buildPrisma = (rules: Array<{ id: string; matchType: 'EXACT' | 'SUBSTRING'; payeePattern: string; categoryId: string; createdAt: Date }>) => {
    return { categorizationRule: { findMany: vi.fn(async () => rules) } } as unknown as PrismaClient;
  };

  it('returns the exact match when one exists, even if a substring rule also matches', async () => {
    const prisma = buildPrisma([
      { id: 'rule-substring', matchType: 'SUBSTRING', payeePattern: 'lidl', categoryId: 'category-generic-grocery', createdAt: new Date('2026-01-01') },
      { id: 'rule-exact', matchType: 'EXACT', payeePattern: 'Lidl Wroclaw 123', categoryId: 'category-groceries', createdAt: new Date('2026-01-02') }
    ]);

    const result = await matchCategoryForPayee(prisma, 'household-1', 'Lidl Wroclaw 123');

    expect(result).toBe('category-groceries');
  });

  it('picks the longest substring match when multiple substring rules match', async () => {
    const prisma = buildPrisma([
      { id: 'rule-short', matchType: 'SUBSTRING', payeePattern: 'net', categoryId: 'category-utilities', createdAt: new Date('2026-01-01') },
      { id: 'rule-long', matchType: 'SUBSTRING', payeePattern: 'netflix', categoryId: 'category-entertainment', createdAt: new Date('2026-01-02') }
    ]);

    const result = await matchCategoryForPayee(prisma, 'household-1', 'NETFLIX.COM');

    expect(result).toBe('category-entertainment');
  });

  it('breaks a tie between equal-length substring matches by picking the most recently created rule', async () => {
    // Rules are returned pre-sorted by createdAt desc, mirroring the real
    // findMany({ orderBy: { createdAt: 'desc' } }) call — most recent first.
    const prisma = buildPrisma([
      { id: 'rule-newer', matchType: 'SUBSTRING', payeePattern: 'shop', categoryId: 'category-b', createdAt: new Date('2026-01-02') },
      { id: 'rule-older', matchType: 'SUBSTRING', payeePattern: 'shop', categoryId: 'category-a', createdAt: new Date('2026-01-01') }
    ]);

    const result = await matchCategoryForPayee(prisma, 'household-1', 'Corner Shop');

    expect(result).toBe('category-b');
  });

  it('returns null when no rule matches', async () => {
    const prisma = buildPrisma([]);

    const result = await matchCategoryForPayee(prisma, 'household-1', 'Unknown Payee');

    expect(result).toBeNull();
  });
});

// ── createRule() ──────────────────────────────────────────────────────────────

describe('createRule()', () => {
  it('creates a categorization rule with the given match type and pattern', async () => {
    const create = vi.fn(async () => ({ id: 'rule-1' }));
    const prisma = { categorizationRule: { create } } as unknown as PrismaClient;

    await createRule(prisma, { householdId: 'household-1', matchType: 'EXACT', payeePattern: 'Netflix', categoryId: 'category-entertainment' });

    expect(create).toHaveBeenCalledWith({
      data: { householdId: 'household-1', matchType: 'EXACT', payeePattern: 'Netflix', categoryId: 'category-entertainment' }
    });
  });
});
