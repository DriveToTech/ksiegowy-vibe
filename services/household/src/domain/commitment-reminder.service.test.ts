import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { listUnusedSubscriptions, listUpcomingCommitments, runRenewalReminderSweep } from './commitment-reminder.service.js';

// ── listUpcomingCommitments() ─────────────────────────────────────────────────

describe('listUpcomingCommitments()', () => {
  it('returns ACTIVE commitments due within the window with daysUntilDue attached', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T00:00:00Z'));

    const findMany = vi.fn(async () => [
      { id: 'commitment-1', householdId: 'household-1', status: 'ACTIVE', nextDueDate: new Date('2026-08-06T00:00:00Z') }
    ]);
    const prisma = { householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]) }, commitment: { findMany } } as unknown as PrismaClient;

    const result = await listUpcomingCommitments(prisma, 'household-1', 'user-1', 30);

    expect(result).toEqual([
      { id: 'commitment-1', householdId: 'household-1', status: 'ACTIVE', nextDueDate: new Date('2026-08-06T00:00:00Z'), daysUntilDue: 5 }
    ]);

    vi.useRealTimers();
  });
});

// ── listUnusedSubscriptions() ─────────────────────────────────────────────────

describe('listUnusedSubscriptions()', () => {
  it('queries ACTIVE subscriptions that are unused or never used', async () => {
    const findMany = vi.fn(async () => []);
    const prisma = { householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]) }, commitment: { findMany } } as unknown as PrismaClient;

    await listUnusedSubscriptions(prisma, 'household-1', 'user-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        accountId: { in: ['account-1'] },
        type: 'SUBSCRIPTION',
        status: 'ACTIVE',
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: expect.any(Date) } }]
      }
    });
  });
});

// ── runRenewalReminderSweep() ─────────────────────────────────────────────────

describe('runRenewalReminderSweep()', () => {
  it('counts distinct households with upcoming commitments across the whole database', async () => {
    const findMany = vi.fn(async () => [
      { householdId: 'household-1' },
      { householdId: 'household-1' },
      { householdId: 'household-2' }
    ]);
    const prisma = { commitment: { findMany } } as unknown as PrismaClient;

    const result = await runRenewalReminderSweep(prisma);

    expect(result).toEqual({ householdsWithUpcomingCommitments: 2, totalUpcomingCommitments: 3 });
  });
});
