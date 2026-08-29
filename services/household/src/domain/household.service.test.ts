import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import {
  createHousehold,
  findHouseholdMembership,
  listHouseholdMembers,
  listHouseholdsForUser,
  refreshMembershipIdentitySnapshot
} from './household.service.js';

// ── createHousehold() ────────────────────────────────────────────────────────

describe('createHousehold()', () => {
  const buildPrisma = () => {
    const householdCreate = vi.fn(async () => ({ id: 'household-1', name: 'Kowalski Family', currency: 'PLN' }));
    const categoryCreateMany = vi.fn(async (_args: { data: { householdId: string; name: string }[] }) => ({ count: 9 }));
    const membershipCreate = vi.fn(async () => ({
      id: 'membership-1',
      householdId: 'household-1',
      userId: 'user-1',
      userEmail: 'anna@example.com',
      displayName: 'Anna',
      role: 'OWNER'
    }));

    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          household: { create: householdCreate },
          householdCategory: { createMany: categoryCreateMany },
          householdMembership: { create: membershipCreate }
        };
        return callback(tx);
      })
    } as unknown as PrismaClient;

    return { prisma, householdCreate, categoryCreateMany, membershipCreate };
  };

  it('creates the household, seeds default categories, and creates the OWNER membership atomically', async () => {
    const { prisma, householdCreate, categoryCreateMany, membershipCreate } = buildPrisma();

    const result = await createHousehold(prisma, {
      name: 'Kowalski Family',
      ownerUserId: 'user-1',
      ownerUserEmail: 'anna@example.com',
      ownerDisplayName: 'Anna'
    });

    expect(householdCreate).toHaveBeenCalledWith({ data: { name: 'Kowalski Family', currency: 'PLN' } });
    expect(categoryCreateMany).toHaveBeenCalledTimes(1);
    expect(categoryCreateMany.mock.calls[0]![0].data).toHaveLength(10);
    expect(membershipCreate).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        userId: 'user-1',
        userEmail: 'anna@example.com',
        displayName: 'Anna',
        role: 'OWNER'
      }
    });
    expect(result).toEqual({
      household: { id: 'household-1', name: 'Kowalski Family', currency: 'PLN' },
      membership: {
        id: 'membership-1',
        householdId: 'household-1',
        userId: 'user-1',
        userEmail: 'anna@example.com',
        displayName: 'Anna',
        role: 'OWNER'
      }
    });
  });

  it('defaults currency to PLN when not provided', async () => {
    const { prisma, householdCreate } = buildPrisma();

    await createHousehold(prisma, { name: 'Nowak Household', ownerUserId: 'user-2', ownerUserEmail: 'jan@example.com' });

    expect(householdCreate).toHaveBeenCalledWith({ data: { name: 'Nowak Household', currency: 'PLN' } });
  });
});

// ── findHouseholdMembership() ────────────────────────────────────────────────

describe('findHouseholdMembership()', () => {
  it('returns the membership when one exists for the household+user pair', async () => {
    const membership = { id: 'membership-1', householdId: 'household-1', userId: 'user-1', role: 'OWNER' };
    const prisma = {
      householdMembership: { findUnique: vi.fn(async () => membership) }
    } as unknown as PrismaClient;

    const result = await findHouseholdMembership(prisma, 'household-1', 'user-1');

    expect(prisma.householdMembership.findUnique).toHaveBeenCalledWith({
      where: { householdId_userId: { householdId: 'household-1', userId: 'user-1' } }
    });
    expect(result).toEqual(membership);
  });

  it('returns null when no membership exists', async () => {
    const prisma = {
      householdMembership: { findUnique: vi.fn(async () => null) }
    } as unknown as PrismaClient;

    const result = await findHouseholdMembership(prisma, 'household-1', 'stranger');

    expect(result).toBeNull();
  });
});

// ── refreshMembershipIdentitySnapshot() ──────────────────────────────────────

describe('refreshMembershipIdentitySnapshot()', () => {
  it('updates the membership row with the latest email and display name', async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { householdMembership: { updateMany } } as unknown as PrismaClient;

    await refreshMembershipIdentitySnapshot(prisma, 'household-1', 'user-1', {
      userEmail: 'anna.new@example.com',
      displayName: 'Anna K.'
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1', userId: 'user-1' },
      data: { userEmail: 'anna.new@example.com', displayName: 'Anna K.' }
    });
  });
});

// ── listHouseholdsForUser() ───────────────────────────────────────────────────

describe('listHouseholdsForUser()', () => {
  it('maps memberships to {householdId, role, name} summaries', async () => {
    const findMany = vi.fn(async () => [
      { householdId: 'household-1', role: 'OWNER', household: { name: 'Kowalski Family' } },
      { householdId: 'household-2', role: 'MEMBER', household: { name: 'Weekend Cabin' } }
    ]);
    const prisma = { householdMembership: { findMany } } as unknown as PrismaClient;

    const result = await listHouseholdsForUser(prisma, 'user-1');

    expect(result).toEqual([
      { householdId: 'household-1', role: 'OWNER', name: 'Kowalski Family' },
      { householdId: 'household-2', role: 'MEMBER', name: 'Weekend Cabin' }
    ]);
  });
});

// ── listHouseholdMembers() ────────────────────────────────────────────────────

describe('listHouseholdMembers()', () => {
  it('maps memberships to {userId, role, displayName, userEmail} summaries, ordered by join date', async () => {
    const findMany = vi.fn(async () => [
      { userId: 'user-1', role: 'OWNER', displayName: 'Anna', userEmail: 'anna@example.com' },
      { userId: 'user-2', role: 'MEMBER', displayName: null, userEmail: 'jan@example.com' }
    ]);
    const prisma = { householdMembership: { findMany } } as unknown as PrismaClient;

    const result = await listHouseholdMembers(prisma, 'household-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { householdId: 'household-1' },
      orderBy: { createdAt: 'asc' }
    });
    expect(result).toEqual([
      { userId: 'user-1', role: 'OWNER', displayName: 'Anna', userEmail: 'anna@example.com' },
      { userId: 'user-2', role: 'MEMBER', displayName: null, userEmail: 'jan@example.com' }
    ]);
  });
});
