import type { Commitment, PrismaClient } from '../generated/client/index.js';

export interface UpcomingCommitment extends Commitment {
  daysUntilDue: number;
}

const DEFAULT_UPCOMING_WINDOW_DAYS = 30;
/** A subscription untouched for this long surfaces the dashboard's "unused" nudge. */
const UNUSED_SUBSCRIPTION_THRESHOLD_DAYS = 90;

const daysBetween = (from: Date, to: Date): number => Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

/**
 * Commitments due within the window, and subscriptions unused past the
 * threshold — feeds both the dashboard's "upcoming" section and the daily
 * reminder sweep. Scoped to one household; commitments have no per-account
 * private/shared visibility concept, so no visibleAccountIds() filtering here.
 */
export const listUpcomingCommitments = async (
  prisma: PrismaClient,
  householdId: string,
  withinDays: number = DEFAULT_UPCOMING_WINDOW_DAYS
): Promise<UpcomingCommitment[]> => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  const commitments = await prisma.commitment.findMany({
    where: { householdId, status: 'ACTIVE', nextDueDate: { lte: windowEnd } },
    orderBy: { nextDueDate: 'asc' }
  });

  return commitments.map((commitment) => ({ ...commitment, daysUntilDue: daysBetween(now, commitment.nextDueDate) }));
};

export const listUnusedSubscriptions = async (prisma: PrismaClient, householdId: string): Promise<Commitment[]> => {
  const threshold = new Date(Date.now() - UNUSED_SUBSCRIPTION_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  return prisma.commitment.findMany({
    where: {
      householdId,
      type: 'SUBSCRIPTION',
      status: 'ACTIVE',
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lte: threshold } }]
    }
  });
};

// ponytail: log-only sweep, no notification delivery — wire an actual
// email/push channel once one exists for the household side; the dashboard's
// "upcoming" query (listUpcomingCommitments above) already surfaces this data
// on every page load without needing the cron to persist anything.
export interface RenewalReminderSweepResult {
  householdsWithUpcomingCommitments: number;
  totalUpcomingCommitments: number;
}

export const runRenewalReminderSweep = async (prisma: PrismaClient): Promise<RenewalReminderSweepResult> => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + DEFAULT_UPCOMING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const upcomingCommitments = await prisma.commitment.findMany({
    where: { status: 'ACTIVE', nextDueDate: { lte: windowEnd } },
    select: { householdId: true }
  });

  const householdsWithUpcomingCommitments = new Set(upcomingCommitments.map((commitment) => commitment.householdId)).size;

  return {
    householdsWithUpcomingCommitments,
    totalUpcomingCommitments: upcomingCommitments.length
  };
};
