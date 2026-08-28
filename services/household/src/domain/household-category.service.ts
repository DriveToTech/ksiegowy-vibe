import type { HouseholdCategory, PrismaClient } from '../generated/client/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdCategoryInput {
  householdId: string;
  name: string;
  parentCategoryId?: string;
}

export interface UpdateHouseholdCategoryInput {
  name?: string;
  parentCategoryId?: string | null;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export const listCategories = async (prisma: PrismaClient, householdId: string): Promise<HouseholdCategory[]> => {
  return prisma.householdCategory.findMany({
    where: { householdId },
    orderBy: { name: 'asc' }
  });
};

export const createCategory = async (
  prisma: PrismaClient,
  input: CreateHouseholdCategoryInput
): Promise<HouseholdCategory> => {
  return prisma.householdCategory.create({
    data: {
      householdId: input.householdId,
      name: input.name,
      parentCategoryId: input.parentCategoryId ?? null
    }
  });
};

export const updateCategory = async (
  prisma: PrismaClient,
  householdId: string,
  categoryId: string,
  input: UpdateHouseholdCategoryInput
): Promise<HouseholdCategory> => {
  const category = await prisma.householdCategory.findFirst({ where: { id: categoryId, householdId } });
  if (!category) {
    throw new Error(`Category ${categoryId} not found in household ${householdId}`);
  }

  const data: Record<string, string | null> = {};
  if (input.name !== undefined) data.name = input.name;
  if ('parentCategoryId' in input) data.parentCategoryId = input.parentCategoryId ?? null;

  return prisma.householdCategory.update({ where: { id: categoryId }, data });
};

/**
 * Deletes a category only when nothing references it — transactions and the
 * budget envelope for it must be reassigned or removed first. Silent
 * cascading delete of ledger history is exactly what CLAUDE.md's "minimize
 * surprise" testing guidance and the plan's onDelete: Restrict reasoning
 * (for accounts) both argue against, so the same discipline applies here.
 */
export const deleteCategory = async (prisma: PrismaClient, householdId: string, categoryId: string): Promise<void> => {
  const category = await prisma.householdCategory.findFirst({ where: { id: categoryId, householdId } });
  if (!category) {
    throw new Error(`Category ${categoryId} not found in household ${householdId}`);
  }

  const [transactionCount, envelope] = await Promise.all([
    prisma.householdTransaction.count({ where: { categoryId } }),
    prisma.budgetEnvelope.findUnique({ where: { categoryId } })
  ]);

  if (transactionCount > 0) {
    throw new Error(`Category ${categoryId} has transactions and cannot be deleted`);
  }
  if (envelope) {
    throw new Error(`Category ${categoryId} has a budget envelope and cannot be deleted`);
  }

  await prisma.householdCategory.delete({ where: { id: categoryId } });
};
