import type { CategorizationRule, PrismaClient } from '../generated/client/index.js';
import { categoryExistsInHousehold } from './household-category.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateCategorizationRuleInput {
  householdId: string;
  matchType: 'EXACT' | 'SUBSTRING';
  payeePattern: string;
  categoryId: string;
}

// ── Matching ─────────────────────────────────────────────────────────────────

/**
 * Resolves the category a payee should be categorized into, given the
 * household's rules. Precedence: an exact match always wins over any
 * substring match; among substring matches the longest pattern wins; ties
 * (equal pattern length, or multiple exact matches) are broken by the most
 * recently created rule.
 */
export const matchCategoryForPayee = async (
  prisma: PrismaClient,
  householdId: string,
  payee: string
): Promise<string | null> => {
  const rules = await prisma.categorizationRule.findMany({
    where: { householdId },
    orderBy: { createdAt: 'desc' }
  });

  const normalizedPayee = payee.toLowerCase();

  const exactMatch = rules.find(
    (rule) => rule.matchType === 'EXACT' && rule.payeePattern.toLowerCase() === normalizedPayee
  );
  if (exactMatch) {
    return exactMatch.categoryId;
  }

  const substringMatches = rules.filter(
    (rule) => rule.matchType === 'SUBSTRING' && normalizedPayee.includes(rule.payeePattern.toLowerCase())
  );

  if (substringMatches.length === 0) {
    return null;
  }

  const longestPatternLength = Math.max(...substringMatches.map((rule) => rule.payeePattern.length));
  const longestMatches = substringMatches.filter((rule) => rule.payeePattern.length === longestPatternLength);

  // `rules` is already ordered by createdAt desc, so the first longest match is the most recent.
  return longestMatches[0]!.categoryId;
};

// ── CRUD ─────────────────────────────────────────────────────────────────────

export const listRules = async (prisma: PrismaClient, householdId: string): Promise<CategorizationRule[]> => {
  return prisma.categorizationRule.findMany({
    where: { householdId },
    orderBy: { createdAt: 'desc' }
  });
};

/**
 * Explicit opt-in only — never auto-created on every recategorization. Called
 * from the recategorize flow (household-transaction.service.ts) only when the
 * user checks "also apply to future transactions from this payee".
 */
export const createRule = async (
  prisma: PrismaClient,
  input: CreateCategorizationRuleInput
): Promise<CategorizationRule> => {
  if (!(await categoryExistsInHousehold(prisma, input.householdId, input.categoryId))) {
    throw new Error(`Category ${input.categoryId} not found in household ${input.householdId}`);
  }
  return prisma.categorizationRule.create({
    data: {
      householdId: input.householdId,
      matchType: input.matchType,
      payeePattern: input.payeePattern,
      categoryId: input.categoryId
    }
  });
};

export const deleteRule = async (prisma: PrismaClient, householdId: string, ruleId: string): Promise<void> => {
  const rule = await prisma.categorizationRule.findFirst({ where: { id: ruleId, householdId } });
  if (!rule) {
    throw new Error(`Categorization rule ${ruleId} not found in household ${householdId}`);
  }

  await prisma.categorizationRule.delete({ where: { id: ruleId } });
};
