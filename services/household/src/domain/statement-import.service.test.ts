import type { PrismaClient } from '../generated/client/index.js';
import { describe, expect, it, vi } from 'vitest';

import { confirmStatementImport, parseCsvStatement, previewStatementImport } from './statement-import.service.js';

// ── parseCsvStatement() ───────────────────────────────────────────────────────

describe('parseCsvStatement()', () => {
  it('parses a simple CSV into rows of fields', () => {
    const result = parseCsvStatement('date,amount,payee\n2026-08-01,-49.99,Netflix\n2026-08-02,3200.00,Employer');

    expect(result).toEqual([
      ['date', 'amount', 'payee'],
      ['2026-08-01', '-49.99', 'Netflix'],
      ['2026-08-02', '3200.00', 'Employer']
    ]);
  });

  it('handles quoted fields with embedded commas and escaped quotes', () => {
    const result = parseCsvStatement('date,amount,payee\n2026-08-01,-10.00,"Shop, ""Downtown"" branch"');

    expect(result).toEqual([
      ['date', 'amount', 'payee'],
      ['2026-08-01', '-10.00', 'Shop, "Downtown" branch']
    ]);
  });
});

// ── previewStatementImport() ──────────────────────────────────────────────────

describe('previewStatementImport()', () => {
  const columnMapping = { dateColumnIndex: 0, amountColumnIndex: 1, payeeColumnIndex: 2, descriptionColumnIndex: 3 };

  it('flags a row as a duplicate when a matching date+amount+payee transaction already exists', async () => {
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]), findFirst: vi.fn(async () => ({ id: 'account-1' })) },
      householdTransaction: {
        findMany: vi.fn(async () => [{ date: new Date('2026-08-01'), amount: { toString: () => '-49.99' }, payee: 'Netflix' }])
      }
    } as unknown as PrismaClient;

    const csv = 'date,amount,payee,description\n2026-08-01,-49.99,Netflix,NETFLIX.COM\n2026-08-02,-10.00,Coffee Shop,POS';

    const result = await previewStatementImport(prisma, 'household-1', 'user-1', 'account-1', csv, columnMapping);

    expect(result).toEqual([
      { date: '2026-08-01', amount: '-49.99', payee: 'Netflix', bankDescription: 'NETFLIX.COM', isDuplicate: true },
      { date: '2026-08-02', amount: '-10.00', payee: 'Coffee Shop', bankDescription: 'POS', isDuplicate: false }
    ]);
  });

  it('throws when the account does not belong to the household', async () => {
    const prisma = { householdAccount: { findMany: vi.fn(async () => []) } } as unknown as PrismaClient;

    await expect(
      previewStatementImport(prisma, 'household-1', 'user-1', 'account-other', 'date,amount,payee\n2026-08-01,-1.00,Shop', columnMapping)
    ).rejects.toThrow('Account account-other not found in household household-1');
  });
});

// ── confirmStatementImport() ──────────────────────────────────────────────────

describe('confirmStatementImport()', () => {
  it('creates one transaction per row, all sharing the same importBatchId', async () => {
    const create = vi.fn(
      async (args: { data: { payee: string; importBatchId: string; categorizationSource: string } }) => ({
        id: `transaction-${args.data.payee}`,
        ...args.data
      })
    );
    const prisma = {
      householdAccount: { findMany: vi.fn(async () => [{ id: 'account-1' }]), findFirst: vi.fn(async () => ({ id: 'account-1' })) },
      categorizationRule: { findMany: vi.fn(async () => []) },
      householdTransaction: { create }
    } as unknown as PrismaClient;

    const result = await confirmStatementImport(prisma, 'household-1', 'user-1', 'account-1', [
      { date: '2026-08-01', amount: '-49.99', payee: 'Netflix' },
      { date: '2026-08-02', amount: '-10.00', payee: 'Coffee Shop' }
    ]);

    expect(result.createdCount).toBe(2);
    expect(create).toHaveBeenCalledTimes(2);
    const [firstCallArgs, secondCallArgs] = create.mock.calls;
    expect(firstCallArgs![0].data.importBatchId).toBe(result.importBatchId);
    expect(secondCallArgs![0].data.importBatchId).toBe(result.importBatchId);
    expect(firstCallArgs![0].data.categorizationSource).toBe('IMPORT');
  });
});
