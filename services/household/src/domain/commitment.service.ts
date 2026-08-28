import type { Commitment, CommitmentBillingFrequency, CommitmentStatus, CommitmentType, PrismaClient } from '../generated/client/index.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateCommitmentInput {
  householdId: string;
  accountId: string;
  type: CommitmentType;
  name: string;
  amount: string;
  billingFrequency: CommitmentBillingFrequency;
  nextDueDate: string; // YYYY-MM-DD
  provider?: string;
  policyNumber?: string;
  insuredObject?: string;
  sumInsured?: string;
  principal?: string;
  outstandingBalance?: string;
  interestRate?: string;
  termMonths?: number;
  isAutomatic?: boolean;
}

export interface UpdateCommitmentInput {
  name?: string;
  amount?: string;
  billingFrequency?: CommitmentBillingFrequency;
  nextDueDate?: string;
  status?: CommitmentStatus;
  outstandingBalance?: string;
  lastUsedAt?: string;
  isAutomatic?: boolean;
}

export interface AmortizationScheduleEntry {
  month: number;
  payment: string;
  principalPortion: string;
  interestPortion: string;
  remainingBalance: string;
}

export interface GenerateDueCommitmentTransactionsResult {
  generatedTransactionCount: number;
  commitmentsProcessed: number;
}

/** Caps catch-up generation per commitment per run — a commitment overdue by
 * more than this many periods still catches up, just over several cron runs
 * instead of one. ponytail: fixed cap rather than unbounded catch-up. */
const MAX_CATCH_UP_ITERATIONS_PER_COMMITMENT = 36;

// ── CRUD ─────────────────────────────────────────────────────────────────────

export const createCommitment = async (prisma: PrismaClient, input: CreateCommitmentInput): Promise<Commitment> => {
  const account = await prisma.householdAccount.findFirst({ where: { id: input.accountId, householdId: input.householdId } });
  if (!account) {
    throw new Error(`Account ${input.accountId} not found in household ${input.householdId}`);
  }

  return prisma.commitment.create({
    data: {
      householdId: input.householdId,
      accountId: input.accountId,
      type: input.type,
      name: input.name,
      amount: input.amount,
      billingFrequency: input.billingFrequency,
      nextDueDate: new Date(input.nextDueDate),
      provider: input.provider ?? null,
      policyNumber: input.policyNumber ?? null,
      insuredObject: input.insuredObject ?? null,
      sumInsured: input.sumInsured ?? null,
      principal: input.principal ?? null,
      outstandingBalance: input.outstandingBalance ?? input.principal ?? null,
      interestRate: input.interestRate ?? null,
      termMonths: input.termMonths ?? null,
      isAutomatic: input.isAutomatic ?? true
    }
  });
};

export const listCommitments = async (
  prisma: PrismaClient,
  householdId: string,
  status?: CommitmentStatus
): Promise<Commitment[]> => {
  return prisma.commitment.findMany({
    where: { householdId, ...(status ? { status } : {}) },
    orderBy: { nextDueDate: 'asc' }
  });
};

export const getCommitment = async (prisma: PrismaClient, householdId: string, commitmentId: string): Promise<Commitment | null> => {
  return prisma.commitment.findFirst({ where: { id: commitmentId, householdId } });
};

export const updateCommitment = async (
  prisma: PrismaClient,
  householdId: string,
  commitmentId: string,
  input: UpdateCommitmentInput
): Promise<Commitment> => {
  const commitment = await prisma.commitment.findFirst({ where: { id: commitmentId, householdId } });
  if (!commitment) {
    throw new Error(`Commitment ${commitmentId} not found in household ${householdId}`);
  }

  const data: Record<string, string | Date | boolean | null> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.amount !== undefined) data.amount = input.amount;
  if (input.billingFrequency !== undefined) data.billingFrequency = input.billingFrequency;
  if (input.nextDueDate !== undefined) data.nextDueDate = new Date(input.nextDueDate);
  if (input.status !== undefined) data.status = input.status;
  if (input.outstandingBalance !== undefined) data.outstandingBalance = input.outstandingBalance;
  if (input.lastUsedAt !== undefined) data.lastUsedAt = new Date(input.lastUsedAt);
  if (input.isAutomatic !== undefined) data.isAutomatic = input.isAutomatic;

  return prisma.commitment.update({ where: { id: commitmentId }, data });
};

// ── Amortization (pure, computed on read — never stored) ────────────────────

/**
 * Standard fixed-payment amortization schedule. `annualInterestRate` is a
 * decimal fraction (e.g. 0.0499 for 4.99%), matching interestRate's
 * @db.Decimal(5,4) column precision.
 */
export const calculateAmortizationSchedule = (
  principal: number,
  annualInterestRate: number,
  termMonths: number
): AmortizationScheduleEntry[] => {
  if (termMonths <= 0) {
    throw new Error('termMonths must be a positive number');
  }

  const monthlyRate = annualInterestRate / 12;
  const monthlyPayment =
    monthlyRate === 0
      ? principal / termMonths
      : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));

  const schedule: AmortizationScheduleEntry[] = [];
  let remainingBalance = principal;

  for (let month = 1; month <= termMonths; month += 1) {
    const interestPortion = remainingBalance * monthlyRate;
    const principalPortion = Math.min(monthlyPayment - interestPortion, remainingBalance);
    remainingBalance = Math.max(remainingBalance - principalPortion, 0);

    schedule.push({
      month,
      payment: monthlyPayment.toFixed(2),
      principalPortion: principalPortion.toFixed(2),
      interestPortion: interestPortion.toFixed(2),
      remainingBalance: remainingBalance.toFixed(2)
    });
  }

  return schedule;
};

// ── Due-date advancement ──────────────────────────────────────────────────────

/**
 * ponytail: uses JS Date month/year rollover (e.g. Jan 31 WEEKLY/MONTHLY math
 * can land on a different day-of-month for short months) rather than a
 * calendar-safe "same day next month, clamped" rule — acceptable for
 * household billing dates, revisit if a real user hits it.
 */
export const advanceNextDueDate = (currentDueDate: Date, billingFrequency: CommitmentBillingFrequency): Date => {
  const next = new Date(currentDueDate);

  switch (billingFrequency) {
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    case 'QUARTERLY':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
  }

  return next;
};

// ── Cron: idempotent recurring-transaction generation ────────────────────────

const isUniqueConstraintViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002';

/**
 * Generates a HouseholdTransaction for every ACTIVE, automatic commitment
 * whose nextDueDate has arrived, then advances nextDueDate — catching up one
 * period at a time (bounded) if a run was missed. Idempotent at the database
 * level via the @@unique([commitmentId, date]) constraint: a restart, retry,
 * or double-run cannot double-charge a commitment.
 *
 * A commitment with isAutomatic false (paid manually by a household member)
 * is skipped entirely here — neither transaction generation nor due-date
 * advancement — since there is no way to know it was actually paid without a
 * human entering it. It still surfaces via the upcoming-commitments query so
 * it isn't silently forgotten.
 */
export const generateDueCommitmentTransactions = async (
  prisma: PrismaClient,
  asOfDate: Date = new Date()
): Promise<GenerateDueCommitmentTransactionsResult> => {
  const dueCommitments = await prisma.commitment.findMany({
    where: { status: 'ACTIVE', isAutomatic: true, nextDueDate: { lte: asOfDate } }
  });

  let generatedTransactionCount = 0;

  for (const commitment of dueCommitments) {
    let nextDueDate = commitment.nextDueDate;
    let iterations = 0;

    while (nextDueDate <= asOfDate && iterations < MAX_CATCH_UP_ITERATIONS_PER_COMMITMENT) {
      iterations += 1;
      const dueDateForThisPeriod = nextDueDate;
      const advancedDueDate = advanceNextDueDate(dueDateForThisPeriod, commitment.billingFrequency);

      // Not wrapped in a single DB transaction: the unique constraint on
      // [commitmentId, date] already makes this idempotent on its own — if
      // the process crashes after the insert but before the update below,
      // the next run's insert attempt safely no-ops (P2002) and still
      // advances nextDueDate, so no double-charge and no stuck due date.
      const created = await prisma.householdTransaction
        .create({
          data: {
            householdId: commitment.householdId,
            accountId: commitment.accountId,
            payee: commitment.name,
            amount: (-Math.abs(Number(commitment.amount))).toString(),
            date: dueDateForThisPeriod,
            isRecurring: true,
            commitmentId: commitment.id
          }
        })
        .catch((error: unknown) => {
          if (isUniqueConstraintViolation(error)) {
            return null;
          }
          throw error;
        });

      await prisma.commitment.update({
        where: { id: commitment.id },
        data: { nextDueDate: advancedDueDate }
      });

      if (created) {
        generatedTransactionCount += 1;
      }

      nextDueDate = advancedDueDate;
    }
  }

  return { generatedTransactionCount, commitmentsProcessed: dueCommitments.length };
};
