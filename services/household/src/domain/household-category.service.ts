import type { Prisma, HouseholdCategory, HouseholdCategoryCashFlowTreatment, PrismaClient } from '../generated/client/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateHouseholdCategoryInput {
  householdId: string;
  name: string;
  parentCategoryId?: string;
  cashFlowTreatment?: HouseholdCategoryCashFlowTreatment;
}

export interface UpdateHouseholdCategoryInput {
  name?: string;
  parentCategoryId?: string | null;
  cashFlowTreatment?: HouseholdCategoryCashFlowTreatment;
}

export type HouseholdCategoryServiceErrorCode = 'CATEGORY_NOT_FOUND' | 'PARENT_CATEGORY_NOT_FOUND' | 'INVALID_HIERARCHY' | 'VALIDATION_ERROR';

export class HouseholdCategoryServiceError extends Error {
  public readonly code: HouseholdCategoryServiceErrorCode;

  public constructor(code: HouseholdCategoryServiceErrorCode, message: string) {
    super(message);
    this.name = 'HouseholdCategoryServiceError';
    this.code = code;
  }
}

const MAX_CATEGORY_NAME_LENGTH = 160;

const assertCategoryName = (name: string): string => {
  const normalizedName = name.trim();
  if (normalizedName.length === 0) throw new HouseholdCategoryServiceError('VALIDATION_ERROR', 'name is required');
  if (normalizedName.length > MAX_CATEGORY_NAME_LENGTH) throw new HouseholdCategoryServiceError('VALIDATION_ERROR', `name must be at most ${MAX_CATEGORY_NAME_LENGTH} characters`);
  return normalizedName;
};

const assertParentCategory = async (prisma: PrismaClient | Prisma.TransactionClient, householdId: string, categoryId: string | null, parentCategoryId: string | null | undefined): Promise<void> => {
  if (parentCategoryId === undefined || parentCategoryId === null) return;
  if (parentCategoryId === categoryId) throw new HouseholdCategoryServiceError('INVALID_HIERARCHY', 'A category cannot be its own parent');

  const categories = await prisma.householdCategory.findMany({ where: { householdId }, select: { id: true, parentCategoryId: true } });
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  if (!categoryById.has(parentCategoryId)) throw new HouseholdCategoryServiceError('PARENT_CATEGORY_NOT_FOUND', 'Parent category was not found in the household');

  const visitedCategoryIds = new Set<string>();
  let currentCategoryId: string | null = parentCategoryId;
  while (currentCategoryId !== null) {
    if (currentCategoryId === categoryId || visitedCategoryIds.has(currentCategoryId)) {
      throw new HouseholdCategoryServiceError('INVALID_HIERARCHY', 'Category hierarchy cannot contain cycles');
    }
    visitedCategoryIds.add(currentCategoryId);
    const currentCategory = categoryById.get(currentCategoryId);
    if (!currentCategory) throw new HouseholdCategoryServiceError('INVALID_HIERARCHY', 'Category hierarchy contains an invalid parent');
    currentCategoryId = currentCategory.parentCategoryId;
  }
};

export const categoryExistsInHousehold = async (prisma: PrismaClient, householdId: string, categoryId: string): Promise<boolean> =>
  (await prisma.householdCategory.findFirst({ where: { id: categoryId, householdId }, select: { id: true } })) !== null;

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
  const name = assertCategoryName(input.name);
  await assertParentCategory(prisma, input.householdId, null, input.parentCategoryId);
  return prisma.householdCategory.create({
    data: {
      householdId: input.householdId,
      name,
      parentCategoryId: input.parentCategoryId ?? null,
      cashFlowTreatment: input.cashFlowTreatment ?? 'STANDARD'
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
    throw new HouseholdCategoryServiceError('CATEGORY_NOT_FOUND', 'Category was not found in the household');
  }
  if (input.name !== undefined) assertCategoryName(input.name);
  if ('parentCategoryId' in input) await assertParentCategory(prisma, householdId, categoryId, input.parentCategoryId);

  const data: Record<string, string | null> = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if ('parentCategoryId' in input) data.parentCategoryId = input.parentCategoryId ?? null;
  if (input.cashFlowTreatment !== undefined) data.cashFlowTreatment = input.cashFlowTreatment;

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
    throw new HouseholdCategoryServiceError('CATEGORY_NOT_FOUND', 'Category was not found in the household');
  }

  const [transactionCount, envelope, childCount] = await Promise.all([
    prisma.householdTransaction.count({ where: { categoryId } }),
    prisma.budgetEnvelope.findUnique({ where: { categoryId } }),
    prisma.householdCategory.count({ where: { householdId, parentCategoryId: categoryId } })
  ]);

  if (transactionCount > 0) {
    throw new Error(`Category ${categoryId} has transactions and cannot be deleted`);
  }
  if (envelope) {
    throw new Error(`Category ${categoryId} has a budget envelope and cannot be deleted`);
  }
  if (childCount > 0) {
    throw new HouseholdCategoryServiceError('INVALID_HIERARCHY', 'Category with child categories cannot be deleted');
  }

  await prisma.householdCategory.delete({ where: { id: categoryId } });
};
