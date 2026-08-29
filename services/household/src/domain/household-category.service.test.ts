import type { HouseholdCategory, PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';
import {
  createCategory,
  deleteCategory,
  HouseholdCategoryServiceError,
  updateCategory
} from './household-category.service.js';

const buildCategory = (overrides: Partial<HouseholdCategory> = {}): HouseholdCategory => ({
  id: 'category-1', householdId: 'household-1', name: 'Food', parentCategoryId: null, cashFlowTreatment: 'STANDARD',
  createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'), ...overrides
});

describe('createCategory()', () => {
  it('validates the parent within the same household and trims bounded names', async () => {
    const categoryCreate = vi.fn(async () => buildCategory({ name: 'Child', parentCategoryId: 'category-parent' }));
    const prisma = {
      householdCategory: {
        findMany: vi.fn(async () => [{ id: 'category-parent', parentCategoryId: null }]),
        create: categoryCreate
      }
    } as unknown as PrismaClient;

    const category = await createCategory(prisma, { householdId: 'household-1', name: ' Child ', parentCategoryId: 'category-parent' });

    expect(categoryCreate).toHaveBeenCalledWith({ data: { householdId: 'household-1', name: 'Child', parentCategoryId: 'category-parent', cashFlowTreatment: 'STANDARD' } });
    expect(category.name).toBe('Child');
  });

  it('rejects an unavailable parent and an overlong name', async () => {
    const prisma = {
      householdCategory: { findMany: vi.fn(async () => []) }
    } as unknown as PrismaClient;

    await expect(createCategory(prisma, { householdId: 'household-1', name: 'Child', parentCategoryId: 'category-other-household' })).rejects.toMatchObject({ code: 'PARENT_CATEGORY_NOT_FOUND' });
    await expect(createCategory(prisma, { householdId: 'household-1', name: 'x'.repeat(161) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('updateCategory()', () => {
  it('rejects self-parenting and descendant cycles before updating', async () => {
    const categoryUpdate = vi.fn();
    const prisma = {
      householdCategory: {
        findFirst: vi.fn(async () => buildCategory()),
        findMany: vi.fn(async () => [
          { id: 'category-1', parentCategoryId: null },
          { id: 'category-child', parentCategoryId: 'category-1' }
        ]),
        update: categoryUpdate
      }
    } as unknown as PrismaClient;

    await expect(updateCategory(prisma, 'household-1', 'category-1', { parentCategoryId: 'category-1' })).rejects.toMatchObject({ code: 'INVALID_HIERARCHY' });
    await expect(updateCategory(prisma, 'household-1', 'category-1', { parentCategoryId: 'category-child' })).rejects.toMatchObject({ code: 'INVALID_HIERARCHY' });
    expect(categoryUpdate).not.toHaveBeenCalled();
  });
});

describe('deleteCategory()', () => {
  it('does not delete a category that still has children', async () => {
    const categoryDelete = vi.fn();
    const prisma = {
      householdCategory: {
        findFirst: vi.fn(async () => buildCategory()),
        count: vi.fn(async () => 1),
        delete: categoryDelete
      },
      householdTransaction: { count: vi.fn(async () => 0) },
      budgetEnvelope: { findUnique: vi.fn(async () => null) }
    } as unknown as PrismaClient;

    await expect(deleteCategory(prisma, 'household-1', 'category-1')).rejects.toBeInstanceOf(HouseholdCategoryServiceError);
    expect(categoryDelete).not.toHaveBeenCalled();
  });
});
