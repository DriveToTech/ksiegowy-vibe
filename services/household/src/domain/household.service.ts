import type { Household, HouseholdMembership, HouseholdMembershipRole, PrismaClient } from '../generated/client/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdInput {
  name: string;
  currency?: string;
  ownerUserId: string;
  ownerUserEmail: string;
  ownerDisplayName?: string;
}

export interface CreateHouseholdResult {
  household: Household;
  membership: HouseholdMembership;
}

export interface HouseholdMembershipSummary {
  householdId: string;
  role: HouseholdMembershipRole;
  name: string;
}

export interface HouseholdMemberSummary {
  userId: string;
  role: HouseholdMembershipRole;
  displayName: string | null;
  userEmail: string;
}

// ── Default categories ──────────────────────────────────────────────────────

/**
 * Seeded once per household on creation. Households can rename/delete/add
 * their own categories afterwards — this is a starting point, not a fixed list.
 */
const DEFAULT_HOUSEHOLD_CATEGORIES = [
  { name: 'Housing', cashFlowTreatment: 'STANDARD' },
  { name: 'Groceries', cashFlowTreatment: 'STANDARD' },
  { name: 'Transport', cashFlowTreatment: 'STANDARD' },
  { name: 'Utilities', cashFlowTreatment: 'STANDARD' },
  { name: 'Insurance', cashFlowTreatment: 'STANDARD' },
  { name: 'Health', cashFlowTreatment: 'STANDARD' },
  { name: 'Entertainment', cashFlowTreatment: 'STANDARD' },
  { name: 'Savings', cashFlowTreatment: 'STANDARD' },
  { name: 'Other', cashFlowTreatment: 'STANDARD' },
  { name: 'Investment transfers', cashFlowTreatment: 'TRANSFER' }
] as const;

// ── Create ───────────────────────────────────────────────────────────────────

/**
 * Creates a household, seeds its default category list, and creates the
 * OWNER membership for the creating user — all in one transaction, so a
 * partial failure never leaves a household without categories or an owner.
 */
export const createHousehold = async (
  prisma: PrismaClient,
  input: CreateHouseholdInput
): Promise<CreateHouseholdResult> => {
  return prisma.$transaction(async (transactionClient) => {
    const household = await transactionClient.household.create({
      data: {
        name: input.name,
        currency: input.currency ?? 'PLN'
      }
    });

    await transactionClient.householdCategory.createMany({
      data: DEFAULT_HOUSEHOLD_CATEGORIES.map((category) => ({
        householdId: household.id,
        name: category.name,
        cashFlowTreatment: category.cashFlowTreatment
      }))
    });

    const membership = await transactionClient.householdMembership.create({
      data: {
        householdId: household.id,
        userId: input.ownerUserId,
        userEmail: input.ownerUserEmail,
        displayName: input.ownerDisplayName ?? null,
        role: 'OWNER'
      }
    });

    return { household, membership };
  });
};

// ── Membership guard ─────────────────────────────────────────────────────────

/**
 * The single live-lookup membership guard every household route uses before
 * touching data — no JWT claim, sub-millisecond indexed lookup instead.
 */
export const findHouseholdMembership = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string
): Promise<HouseholdMembership | null> => {
  return prisma.householdMembership.findUnique({
    where: { householdId_userId: { householdId, userId } }
  });
};

/**
 * Refreshes the identity snapshot (email, display name) on a member's own
 * membership row — called on that member's own authenticated requests so the
 * cross-database display-name/email gap never needs a sync mechanism.
 */
export const refreshMembershipIdentitySnapshot = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  identity: { userEmail: string; displayName?: string | null }
): Promise<void> => {
  await prisma.householdMembership.updateMany({
    where: { householdId, userId },
    data: {
      userEmail: identity.userEmail,
      displayName: identity.displayName ?? null
    }
  });
};

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * Lists every household the given user belongs to, with role and household
 * name — used by /auth/me so the frontend session loader gets everything it
 * needs in one call, no second round trip.
 */
export const listHouseholdsForUser = async (
  prisma: PrismaClient,
  userId: string
): Promise<HouseholdMembershipSummary[]> => {
  const memberships = await prisma.householdMembership.findMany({
    where: { userId },
    include: { household: { select: { name: true } } },
    orderBy: { createdAt: 'asc' }
  });

  return memberships.map((membership) => ({
    householdId: membership.householdId,
    role: membership.role,
    name: membership.household.name
  }));
};

export const getHousehold = async (prisma: PrismaClient, householdId: string): Promise<Household | null> => {
  return prisma.household.findUnique({ where: { id: householdId } });
};

/**
 * Lists every member of a household, with role and identity snapshot — used
 * by the household member management screen.
 */
export const listHouseholdMembers = async (
  prisma: PrismaClient,
  householdId: string
): Promise<HouseholdMemberSummary[]> => {
  const memberships = await prisma.householdMembership.findMany({
    where: { householdId },
    orderBy: { createdAt: 'asc' }
  });

  return memberships.map((membership) => ({
    userId: membership.userId,
    role: membership.role,
    displayName: membership.displayName,
    userEmail: membership.userEmail
  }));
};
