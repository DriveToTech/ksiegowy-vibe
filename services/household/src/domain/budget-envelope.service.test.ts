import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { calculateSafeToSpend, listEnvelopesWithSpend } from './budget-envelope.service.js';

// ── listEnvelopesWithSpend() ──────────────────────────────────────────────────

describe('listEnvelopesWithSpend()', () => {
  it('computes spent as the absolute grouped sum of expenses for the category, and remaining as limit minus spent', async () => {
    const prisma = {
      budgetEnvelope: {
        findMany: vi.fn(async () => [
          { id: 'envelope-1', categoryId: 'category-groceries', monthlyLimit: '600.00', category: { name: 'Groceries' } }
        ])
      },
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]) },
      householdTransaction: {
        groupBy: vi.fn(async () => [{ categoryId: 'category-groceries', _sum: { amount: -420.5 } }])
      }
    } as unknown as PrismaClient;

    const result = await listEnvelopesWithSpend(prisma, 'household-1', 'user-1', '2026-08');

    expect(result).toEqual([
      {
        id: 'envelope-1',
        categoryId: 'category-groceries',
        categoryName: 'Groceries',
        monthlyLimit: '600.00',
        spent: '420.50',
        remaining: '179.50'
      }
    ]);
    expect(prisma.budgetEnvelope.findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      include: { category: { select: { name: true } } }
    });
  });

  it('returns an empty array without querying spend when the household has no envelopes', async () => {
    const groupBy = vi.fn();
    const prisma = {
      budgetEnvelope: { findMany: vi.fn(async () => []) },
      householdTransaction: { groupBy }
    } as unknown as PrismaClient;

    const result = await listEnvelopesWithSpend(prisma, 'household-1', 'user-1');

    expect(result).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});

// ── calculateSafeToSpend() ─────────────────────────────────────────────────────

describe('calculateSafeToSpend()', () => {
  it('sums each envelope\'s remaining budget, clamping any over-budget envelope at zero', async () => {
    const prisma = {
      budgetEnvelope: {
        findMany: vi.fn(async () => [
          { id: 'envelope-1', categoryId: 'category-groceries', monthlyLimit: '600.00', category: { name: 'Groceries' } },
          { id: 'envelope-2', categoryId: 'category-entertainment', monthlyLimit: '100.00', category: { name: 'Entertainment' } }
        ])
      },
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]) },
      householdTransaction: {
        groupBy: vi.fn(async () => [
          { categoryId: 'category-groceries', _sum: { amount: -420.5 } },
          { categoryId: 'category-entertainment', _sum: { amount: -150 } } // over budget
        ])
      }
    } as unknown as PrismaClient;

    const result = await calculateSafeToSpend(prisma, 'household-1', 'user-1', '2026-08');

    expect(result).toBe('179.50');
  });
});
