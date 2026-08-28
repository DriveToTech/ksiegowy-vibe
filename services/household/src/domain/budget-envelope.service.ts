import type { BudgetEnvelope, PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateBudgetEnvelopeInput {
  householdId: string;
  categoryId: string;
  monthlyLimit: string;
}

export interface BudgetEnvelopeWithSpend extends BudgetEnvelope {
  categoryName: string;
  spent: string;
  remaining: string;
}

// ── Month range ──────────────────────────────────────────────────────────────

/** Resolves a YYYY-MM month string (default: current month) to its date range. */
const resolveMonthRange = (month?: string): { start: Date; end: Date } => {
  const now = new Date();
  const [year, monthNumber] = month
    ? month.split('-').map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const start = new Date(Date.UTC(year!, monthNumber! - 1, 1));
  const end = new Date(Date.UTC(year!, monthNumber!, 0, 23, 59, 59, 999));
  return { start, end };
};

// ── CRUD ─────────────────────────────────────────────────────────────────────

export const createEnvelope = async (
  prisma: PrismaClient,
  input: CreateBudgetEnvelopeInput
): Promise<BudgetEnvelope> => {
  return prisma.budgetEnvelope.create({
    data: {
      householdId: input.householdId,
      categoryId: input.categoryId,
      monthlyLimit: input.monthlyLimit
    }
  });
};

export const updateEnvelope = async (
  prisma: PrismaClient,
  householdId: string,
  envelopeId: string,
  monthlyLimit: string
): Promise<BudgetEnvelope> => {
  const envelope = await prisma.budgetEnvelope.findFirst({ where: { id: envelopeId, householdId } });
  if (!envelope) {
    throw new Error(`Budget envelope ${envelopeId} not found in household ${householdId}`);
  }

  return prisma.budgetEnvelope.update({ where: { id: envelopeId }, data: { monthlyLimit } });
};

export const deleteEnvelope = async (prisma: PrismaClient, householdId: string, envelopeId: string): Promise<void> => {
  const envelope = await prisma.budgetEnvelope.findFirst({ where: { id: envelopeId, householdId } });
  if (!envelope) {
    throw new Error(`Budget envelope ${envelopeId} not found in household ${householdId}`);
  }

  await prisma.budgetEnvelope.delete({ where: { id: envelopeId } });
};

// ── Spend calculation ────────────────────────────────────────────────────────

/**
 * "Spent this month" is a computed grouped-SUM query at read time, excluding
 * transfers — not a denormalized write-time counter, so it never drifts when
 * a transaction or import is rolled back.
 * ponytail: no per-period limit snapshot, so a limit change applies
 * retroactively to past months' displayed progress — add a
 * BudgetEnvelopePeriod table if historical-limit auditing becomes a real ask.
 */
export const listEnvelopesWithSpend = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  month?: string
): Promise<BudgetEnvelopeWithSpend[]> => {
  const envelopes = await prisma.budgetEnvelope.findMany({
    where: { householdId },
    include: { category: { select: { name: true } } }
  });
  if (envelopes.length === 0) {
    return [];
  }

  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const { start, end } = resolveMonthRange(month);

  const spendByCategory = await prisma.householdTransaction.groupBy({
    by: ['categoryId'],
    where: {
      householdId,
      accountId: { in: accountIds },
      categoryId: { in: envelopes.map((envelope) => envelope.categoryId) },
      transferGroupId: null,
      amount: { lt: 0 },
      date: { gte: start, lte: end }
    },
    _sum: { amount: true }
  });

  const spentByCategoryId = new Map(
    spendByCategory.map((row) => [row.categoryId, Math.abs(Number(row._sum.amount ?? 0))])
  );

  return envelopes.map((envelope) => {
    const { category, ...envelopeFields } = envelope;
    const spent = spentByCategoryId.get(envelope.categoryId) ?? 0;
    const remaining = Number(envelope.monthlyLimit) - spent;
    return { ...envelopeFields, categoryName: category.name, spent: spent.toFixed(2), remaining: remaining.toFixed(2) };
  });
};

/**
 * Total remaining budget across every envelope for the month — how much of
 * the household's planned spending is still unspent.
 */
export const calculateSafeToSpend = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  month?: string
): Promise<string> => {
  const envelopes = await listEnvelopesWithSpend(prisma, householdId, userId, month);
  const safeToSpend = envelopes.reduce((total, envelope) => total + Math.max(Number(envelope.remaining), 0), 0);
  return safeToSpend.toFixed(2);
};
