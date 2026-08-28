import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { createAccount, getVisibleAccount, listVisibleAccounts, visibleAccountIds } from './household-account.service.js';

// ── visibleAccountIds() ──────────────────────────────────────────────────────

describe('visibleAccountIds()', () => {
  it('returns SHARED accounts and PRIVATE accounts owned by the requesting user only', async () => {
    const findMany = vi.fn(async () => [{ id: 'account-shared' }, { id: 'account-private-mine' }]);
    const prisma = { householdAccount: { findMany } } as unknown as PrismaClient;

    const result = await visibleAccountIds(prisma, 'household-1', 'user-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        householdId: 'household-1',
        OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: 'user-1' }]
      },
      select: { id: true }
    });
    expect(result).toEqual(['account-shared', 'account-private-mine']);
  });
});

// ── createAccount() ──────────────────────────────────────────────────────────

describe('createAccount()', () => {
  it('creates a SHARED account with a null owner', async () => {
    const create = vi.fn(async () => ({ id: 'account-1' }));
    const prisma = { householdAccount: { create } } as unknown as PrismaClient;

    await createAccount(prisma, { householdId: 'household-1', name: 'Joint Checking', type: 'CURRENT' });

    expect(create).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        name: 'Joint Checking',
        type: 'CURRENT',
        accountNumberMask: null,
        visibility: 'SHARED',
        ownerUserId: null,
        openingBalance: '0',
        creditLimit: null,
        statementDay: null
      }
    });
  });

  it('creates a PRIVATE account with the given owner', async () => {
    const create = vi.fn(async () => ({ id: 'account-1' }));
    const prisma = { householdAccount: { create } } as unknown as PrismaClient;

    await createAccount(prisma, {
      householdId: 'household-1',
      name: "Anna's Savings",
      type: 'SAVINGS',
      visibility: 'PRIVATE',
      ownerUserId: 'user-anna'
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ visibility: 'PRIVATE', ownerUserId: 'user-anna' }) })
    );
  });

  it('throws when a PRIVATE account is created without an owner', async () => {
    const prisma = { householdAccount: { create: vi.fn() } } as unknown as PrismaClient;

    await expect(
      createAccount(prisma, { householdId: 'household-1', name: 'Mystery Account', type: 'SAVINGS', visibility: 'PRIVATE' })
    ).rejects.toThrow('ownerUserId is required for a PRIVATE account');
  });
});

// ── listVisibleAccounts() ─────────────────────────────────────────────────────

describe('listVisibleAccounts()', () => {
  it('returns visible accounts with balance computed as openingBalance + transaction sum', async () => {
    const prisma = {
      householdAccount: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'account-1' }]) // visibleAccountIds()
          .mockResolvedValueOnce([{ id: 'account-1', openingBalance: '100.00', createdAt: new Date('2026-01-01') }])
      },
      householdTransaction: {
        groupBy: vi.fn(async () => [{ accountId: 'account-1', _sum: { amount: { toString: () => '-25.50' } } }])
      }
    } as unknown as PrismaClient;

    const result = await listVisibleAccounts(prisma, 'household-1', 'user-1');

    expect(result).toEqual([
      { id: 'account-1', openingBalance: '100.00', createdAt: new Date('2026-01-01'), balance: '74.50' }
    ]);
  });

  it('returns an empty array without querying transactions when no accounts are visible', async () => {
    const groupBy = vi.fn();
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => []) },
      householdTransaction: { groupBy }
    } as unknown as PrismaClient;

    const result = await listVisibleAccounts(prisma, 'household-1', 'user-1');

    expect(result).toEqual([]);
    expect(groupBy).not.toHaveBeenCalled();
  });
});

// ── getVisibleAccount() ────────────────────────────────────────────────────────

describe('getVisibleAccount()', () => {
  it('returns null when the account is not in the visible set (private, owned by someone else)', async () => {
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-shared' }]), findUnique: vi.fn() }
    } as unknown as PrismaClient;

    const result = await getVisibleAccount(prisma, 'household-1', 'user-1', 'account-private-other');

    expect(result).toBeNull();
    expect(prisma.householdAccount.findUnique).not.toHaveBeenCalled();
  });
});
