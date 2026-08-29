import crypto from 'node:crypto';
import { Prisma, type HouseholdTransaction, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';
import { matchCategoryForPayee } from './categorization-rule.service.js';

// ── CSV parsing ──────────────────────────────────────────────────────────────

/**
 * Hand-rolled CSV parser (no new dependency), mirroring the escaping shape of
 * apps/api/src/routes/reports.ts's csvField/csvRow helpers, but for reading:
 * handles quoted fields, embedded commas, embedded newlines, and "" as an
 * escaped quote.
 */
export const parseCsvStatement = (content: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  const normalizedContent = content.replace(/\r\n/g, '\n');

  for (let index = 0; index < normalizedContent.length; index += 1) {
    const character = normalizedContent[index];

    if (insideQuotes) {
      if (character === '"' && normalizedContent[index + 1] === '"') {
        currentField += '"';
        index += 1;
      } else if (character === '"') {
        insideQuotes = false;
      } else {
        currentField += character;
      }
      continue;
    }

    if (character === '"') {
      insideQuotes = true;
    } else if (character === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (character === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += character;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => !(row.length === 1 && row[0] === ''));
};

/** Accepts YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY — the common Polish bank export formats. */
const parseStatementDate = (rawValue: string): string => {
  const trimmed = rawValue.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return trimmed;
  }

  const dottedMatch = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (dottedMatch) {
    const [, day, month, year] = dottedMatch;
    return `${year}-${month}-${day}`;
  }

  throw new Error(`Unrecognized date format: "${rawValue}"`);
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface StatementColumnMapping {
  dateColumnIndex: number;
  amountColumnIndex: number;
  payeeColumnIndex: number;
  descriptionColumnIndex?: number;
}

export interface StatementImportRow {
  date: string;
  amount: string;
  payee: string;
  bankDescription: string | null;
  isDuplicate: boolean;
}

export interface ConfirmStatementImportRow {
  date: string;
  amount: string;
  payee: string;
  bankDescription?: string;
  categoryId?: string;
}

// ── Preview ──────────────────────────────────────────────────────────────────

/**
 * Parses a CSV statement into rows and flags likely duplicates (matching
 * date + amount + payee against existing transactions on the account) —
 * step one of the preview/confirm two-step import flow. Persists nothing.
 */
export const previewStatementImport = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  accountId: string,
  csvContent: string,
  columnMapping: StatementColumnMapping
): Promise<StatementImportRow[]> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const account = accountIds.includes(accountId) ? await prisma.householdAccount.findFirst({ where: { id: accountId, householdId } }) : null;
  if (!account) {
    throw new Error(`Account ${accountId} not found in household ${householdId}`);
  }

  const rows = parseCsvStatement(csvContent);
  const [, ...bodyRows] = rows; // first row is the header

  const parsedRows = bodyRows
    .filter((row) => row.some((field) => field.trim().length > 0))
    .map((row) => ({
      date: parseStatementDate(row[columnMapping.dateColumnIndex] ?? ''),
      amount: (row[columnMapping.amountColumnIndex] ?? '0').trim().replace(',', '.'),
      payee: (row[columnMapping.payeeColumnIndex] ?? '').trim(),
      bankDescription:
        columnMapping.descriptionColumnIndex !== undefined
          ? (row[columnMapping.descriptionColumnIndex] ?? '').trim() || null
          : null
    }));

  const existingTransactions = await prisma.householdTransaction.findMany({
    where: { accountId },
    select: { date: true, amount: true, payee: true }
  });

  const existingKeys = new Set(
    existingTransactions.map((transaction) => buildDuplicateKey(transaction.date.toISOString().slice(0, 10), transaction.amount.toString(), transaction.payee))
  );

  return parsedRows.map((row) => ({
    ...row,
    isDuplicate: existingKeys.has(buildDuplicateKey(row.date, row.amount, row.payee))
  }));
};

const buildDuplicateKey = (date: string, amount: string, payee: string): string =>
  `${date}|${new Prisma.Decimal(amount.replace(/\s/g, '').replace(',', '.')).toFixed(2)}|${payee.toLowerCase()}`;

// ── Confirm ──────────────────────────────────────────────────────────────────

/**
 * Persists the confirmed rows from a preview as household transactions with
 * categorizationSource IMPORT, sharing one importBatchId. Rows the caller
 * flagged as duplicates during preview should already be filtered out by the
 * caller before calling this — this step trusts the caller's row selection.
 */
export const confirmStatementImport = async (
  prisma: PrismaClient,
  householdId: string,
  userId: string,
  accountId: string,
  rows: ConfirmStatementImportRow[]
): Promise<{ importBatchId: string; createdCount: number; transactions: HouseholdTransaction[] }> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  const account = accountIds.includes(accountId) ? await prisma.householdAccount.findFirst({ where: { id: accountId, householdId } }) : null;
  if (!account) {
    throw new Error(`Account ${accountId} not found in household ${householdId}`);
  }

  const importBatchId = crypto.randomUUID();

  const transactions: HouseholdTransaction[] = [];
  for (const row of rows) {
    let categoryId = row.categoryId ?? null;
    if (!categoryId) {
      categoryId = await matchCategoryForPayee(prisma, householdId, row.payee);
    }

    const transaction = await prisma.householdTransaction.create({
      data: {
        householdId,
        accountId,
        categoryId,
        payee: row.payee,
        bankDescription: row.bankDescription ?? null,
        amount: row.amount,
        date: new Date(row.date),
        categorizationSource: 'IMPORT',
        importBatchId
      }
    });
    transactions.push(transaction);
  }

  return { importBatchId, createdCount: transactions.length, transactions };
};
