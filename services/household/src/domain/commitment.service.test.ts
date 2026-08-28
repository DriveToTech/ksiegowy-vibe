import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { advanceNextDueDate, calculateAmortizationSchedule, generateDueCommitmentTransactions } from './commitment.service.js';

// ── calculateAmortizationSchedule() ───────────────────────────────────────────

describe('calculateAmortizationSchedule()', () => {
  it('splits an interest-free loan into equal principal-only monthly payments', () => {
    const schedule = calculateAmortizationSchedule(1200, 0, 12);

    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({ month: 1, payment: '100.00', principalPortion: '100.00', interestPortion: '0.00', remainingBalance: '1100.00' });
    expect(schedule[11]!.remainingBalance).toBe('0.00');
  });

  it('fully amortizes an interest-bearing loan to a zero balance by the final month', () => {
    const schedule = calculateAmortizationSchedule(1200, 0.05, 12);

    expect(schedule).toHaveLength(12);
    expect(Number(schedule[11]!.remainingBalance)).toBeCloseTo(0, 1);
    expect(Number(schedule[0]!.interestPortion)).toBeCloseTo(1200 * (0.05 / 12), 2);
  });

  it('throws for a non-positive term', () => {
    expect(() => calculateAmortizationSchedule(1200, 0.05, 0)).toThrow('termMonths must be a positive number');
  });
});

// ── advanceNextDueDate() ───────────────────────────────────────────────────────

describe('advanceNextDueDate()', () => {
  it('advances WEEKLY by 7 days', () => {
    expect(advanceNextDueDate(new Date('2026-08-01'), 'WEEKLY')).toEqual(new Date('2026-08-08'));
  });

  it('advances MONTHLY by one month', () => {
    expect(advanceNextDueDate(new Date('2026-08-01'), 'MONTHLY')).toEqual(new Date('2026-09-01'));
  });

  it('advances QUARTERLY by three months', () => {
    expect(advanceNextDueDate(new Date('2026-08-01'), 'QUARTERLY')).toEqual(new Date('2026-11-01'));
  });

  it('advances YEARLY by one year', () => {
    expect(advanceNextDueDate(new Date('2026-08-01'), 'YEARLY')).toEqual(new Date('2027-08-01'));
  });
});

// ── generateDueCommitmentTransactions() ───────────────────────────────────────

describe('generateDueCommitmentTransactions()', () => {
  it('generates a transaction for a due commitment and advances nextDueDate by one billing period', async () => {
    const commitment = {
      id: 'commitment-1',
      householdId: 'household-1',
      accountId: 'account-1',
      name: 'Netflix',
      amount: '49.99',
      billingFrequency: 'MONTHLY',
      nextDueDate: new Date('2026-08-01'),
      status: 'ACTIVE'
    };

    const transactionCreate = vi.fn(async () => ({ id: 'transaction-1' }));
    const commitmentUpdate = vi.fn(async () => commitment);
    const prisma = {
      commitment: { findMany: vi.fn(async () => [commitment]), update: commitmentUpdate },
      householdTransaction: { create: transactionCreate }
    } as unknown as PrismaClient;

    const result = await generateDueCommitmentTransactions(prisma, new Date('2026-08-15'));

    expect(result).toEqual({ generatedTransactionCount: 1, commitmentsProcessed: 1 });
    expect(transactionCreate).toHaveBeenCalledWith({
      data: {
        householdId: 'household-1',
        accountId: 'account-1',
        payee: 'Netflix',
        amount: '-49.99',
        date: new Date('2026-08-01'),
        isRecurring: true,
        commitmentId: 'commitment-1'
      }
    });
    expect(commitmentUpdate).toHaveBeenCalledWith({ where: { id: 'commitment-1' }, data: { nextDueDate: new Date('2026-09-01') } });
  });

  it('is idempotent: a unique-constraint conflict (already generated) still advances nextDueDate without double counting', async () => {
    const commitment = {
      id: 'commitment-1',
      householdId: 'household-1',
      accountId: 'account-1',
      name: 'Netflix',
      amount: '49.99',
      billingFrequency: 'MONTHLY',
      nextDueDate: new Date('2026-08-01'),
      status: 'ACTIVE'
    };

    const conflictError = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    const commitmentUpdate = vi.fn(async () => commitment);
    const prisma = {
      commitment: { findMany: vi.fn(async () => [commitment]), update: commitmentUpdate },
      householdTransaction: { create: vi.fn(async () => { throw conflictError; }) }
    } as unknown as PrismaClient;

    const result = await generateDueCommitmentTransactions(prisma, new Date('2026-08-15'));

    expect(result).toEqual({ generatedTransactionCount: 0, commitmentsProcessed: 1 });
    expect(commitmentUpdate).toHaveBeenCalledWith({ where: { id: 'commitment-1' }, data: { nextDueDate: new Date('2026-09-01') } });
  });

  it('returns zero counts when no commitment is due', async () => {
    const prisma = {
      commitment: { findMany: vi.fn(async () => []) },
      householdTransaction: { create: vi.fn() }
    } as unknown as PrismaClient;

    const result = await generateDueCommitmentTransactions(prisma, new Date('2026-08-15'));

    expect(result).toEqual({ generatedTransactionCount: 0, commitmentsProcessed: 0 });
  });

  it('only queries automatic commitments, leaving manually-paid ones for a human to enter', async () => {
    const commitmentFindMany = vi.fn(async () => []);
    const prisma = {
      commitment: { findMany: commitmentFindMany },
      householdTransaction: { create: vi.fn() }
    } as unknown as PrismaClient;

    await generateDueCommitmentTransactions(prisma, new Date('2026-08-15'));

    expect(commitmentFindMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', isAutomatic: true, nextDueDate: { lte: new Date('2026-08-15') } }
    });
  });
});
