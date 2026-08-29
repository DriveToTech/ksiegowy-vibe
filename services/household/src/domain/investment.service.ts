import { Prisma, type InvestmentPosition, type InvestmentTransaction, type InvestmentTransactionType, type InvestmentWrapper, type PrismaClient } from '../generated/client/index.js';

export type InvestmentServiceErrorCode =
  | 'INVESTMENT_NOT_FOUND'
  | 'INVESTMENT_TRANSACTION_NOT_FOUND'
  | 'INVESTMENT_OWNER_REQUIRED'
  | 'INVESTMENT_INVALID_STATE'
  | 'SELL_UNITS_INSUFFICIENT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'WORKLOAD_LIMIT_EXCEEDED'
  | 'VALIDATION_ERROR';

export class InvestmentServiceError extends Error {
  public readonly code: InvestmentServiceErrorCode;

  public constructor(code: InvestmentServiceErrorCode, message: string) {
    super(message);
    this.name = 'InvestmentServiceError';
    this.code = code;
  }
}

export interface CreateInvestmentPositionInput {
  householdId: string;
  userId: string;
  wrapper: InvestmentWrapper;
  instrument: string;
  visibility?: 'SHARED' | 'PRIVATE';
  targetAllocationPercent?: string | null;
}

export interface UpdateInvestmentPositionInput {
  userId: string;
  wrapper?: InvestmentWrapper;
  instrument?: string;
  visibility?: 'SHARED' | 'PRIVATE';
  targetAllocationPercent?: string | null;
  archive?: boolean;
}

export interface RecordInvestmentTransactionInput {
  householdId: string;
  userId: string;
  positionId: string;
  type: InvestmentTransactionType;
  units?: string | null;
  amount: string;
  date: string;
  operationId: string;
}

export interface InvestmentTransactionResult {
  transaction: InvestmentTransaction;
  position: InvestmentPosition;
  replayed: boolean;
}

export interface VoidInvestmentTransactionResult {
  transaction: InvestmentTransaction;
  position: InvestmentPosition;
  replayed: boolean;
}

export interface InvestmentPortfolioPosition {
  position: InvestmentPosition;
  currentAllocationPercent: string | null;
  driftPercent: string | null;
}

export interface InvestmentPortfolio {
  positions: InvestmentPortfolioPosition[];
  totalCurrentValue: string;
  valuedCurrentValue: string;
  missingValuationCount: number;
  dataQuality: 'COMPLETE' | 'PARTIAL';
  targetAllocation: {
    status: 'COMPLETE' | 'INCOMPLETE' | 'NONE';
    totalPercent: string;
  };
}

const MAX_TEXT_LENGTH = 160;
const MAX_OPERATION_ID_LENGTH = 128;
const MAX_MONEY_LENGTH = 64;
const MAX_UNITS_LENGTH = 64;
const MAX_SERIALIZABLE_RETRIES = 3;
const MAX_VISIBLE_INVESTMENT_POSITIONS = 200;
const MAX_INVESTMENT_TRANSACTION_ROWS = 5_000;

const zero = (): Prisma.Decimal => new Prisma.Decimal(0);

const isPrismaErrorCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;

const parseDecimal = (value: string, fieldName: string, decimalPlaces: number, allowZero: boolean, precision: number): Prisma.Decimal => {
  const normalizedValue = value.trim();
  const maximumLength = decimalPlaces === 8 ? MAX_UNITS_LENGTH : MAX_MONEY_LENGTH;
  const pattern = decimalPlaces === 8 ? /^(?:0|[1-9]\d*)(?:\.\d{1,8})?$/ : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
  const integerPart = normalizedValue.split('.')[0] ?? '';
  if (normalizedValue.length === 0 || normalizedValue.length > maximumLength || integerPart.length > precision - decimalPlaces || !pattern.test(normalizedValue)) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} must be a non-negative decimal with at most ${decimalPlaces} decimal places`);
  }

  const parsed = new Prisma.Decimal(normalizedValue);
  if (!parsed.isFinite() || (!allowZero && parsed.lte(0))) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} must be ${allowZero ? 'non-negative' : 'greater than zero'}`);
  }
  return parsed;
};

const parseOptionalDecimal = (value: string | null | undefined, fieldName: string, decimalPlaces: number, allowZero: boolean, precision: number): Prisma.Decimal | null =>
  value === undefined || value === null ? null : parseDecimal(value, fieldName, decimalPlaces, allowZero, precision);

const parsePercentage = (value: string | null | undefined): Prisma.Decimal | null => {
  const parsed = parseOptionalDecimal(value, 'targetAllocationPercent', 2, true, 5);
  if (parsed !== null && parsed.gt(100)) {
    throw new InvestmentServiceError('VALIDATION_ERROR', 'targetAllocationPercent must be between 0 and 100');
  }
  return parsed;
};

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
};

const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

type InvestmentDatabaseClient = PrismaClient | Prisma.TransactionClient;

const lockInvestmentPosition = async (prisma: Prisma.TransactionClient, householdId: string, positionId: string): Promise<void> => {
  await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "InvestmentPosition"
    WHERE "householdId" = ${householdId} AND "id" = ${positionId}
    FOR UPDATE
  `);
};

const getVisiblePosition = async (prisma: InvestmentDatabaseClient, householdId: string, userId: string, positionId: string): Promise<InvestmentPosition | null> =>
  prisma.investmentPosition.findFirst({
    where: {
      id: positionId,
      householdId,
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }]
    }
  });

const requireVisiblePosition = async (prisma: InvestmentDatabaseClient, householdId: string, userId: string, positionId: string): Promise<InvestmentPosition> => {
  const position = await getVisiblePosition(prisma, householdId, userId, positionId);
  if (!position) throw new InvestmentServiceError('INVESTMENT_NOT_FOUND', 'Investment position was not found');
  return position;
};

const requireOwner = (position: InvestmentPosition, userId: string): void => {
  if (position.ownerUserId !== userId) {
    throw new InvestmentServiceError('INVESTMENT_OWNER_REQUIRED', 'Only the investment position owner can change it');
  }
};

const assertPositionText = (instrument: string): string => {
  const normalizedInstrument = instrument.trim();
  if (normalizedInstrument.length === 0) throw new InvestmentServiceError('VALIDATION_ERROR', 'instrument is required');
  if (normalizedInstrument.length > MAX_TEXT_LENGTH) throw new InvestmentServiceError('VALIDATION_ERROR', `instrument must be at most ${MAX_TEXT_LENGTH} characters`);
  return normalizedInstrument;
};

const assertWorkload = (actual: number, maximum: number, resourceName: string): void => {
  if (actual > maximum) throw new InvestmentServiceError('WORKLOAD_LIMIT_EXCEEDED', `${resourceName} exceeds the supported limit of ${maximum} rows`);
};

const assertDecimalPrecision = (value: Prisma.Decimal, fieldName: string, precision: number, scale: number): void => {
  const maximum = new Prisma.Decimal(10).pow(precision - scale);
  if (!value.eq(value.toDecimalPlaces(scale)) || value.abs().gte(maximum)) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `${fieldName} exceeds supported decimal precision`);
  }
};

const assertOperationId = (operationId: string): string => {
  const normalizedOperationId = operationId.trim();
  if (normalizedOperationId.length === 0 || normalizedOperationId.length > MAX_OPERATION_ID_LENGTH) {
    throw new InvestmentServiceError('VALIDATION_ERROR', `operationId must be between 1 and ${MAX_OPERATION_ID_LENGTH} characters`);
  }
  return normalizedOperationId;
};

const isSameTransactionPayload = (existing: InvestmentTransaction, input: {
  householdId: string;
  positionId: string;
  type: InvestmentTransactionType;
  units: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  date: Date;
  operationId: string;
}): boolean => existing.householdId === input.householdId
  && existing.positionId === input.positionId
  && existing.type === input.type
  && (existing.units === null ? input.units === null : input.units !== null && existing.units.eq(input.units))
  && existing.amount.eq(input.amount)
  && dateKey(existing.date) === dateKey(input.date)
  && existing.operationId === input.operationId;

const transactionOrder = [{ date: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

const runSerializableTransaction = async <Result>(
  prisma: PrismaClient,
  operation: (transactionClient: Prisma.TransactionClient) => Promise<Result>
): Promise<Result> => {
  for (let retry = 0; retry <= MAX_SERIALIZABLE_RETRIES; retry += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: 'Serializable' });
    } catch (error: unknown) {
      if (!isPrismaErrorCode(error, 'P2034') || retry === MAX_SERIALIZABLE_RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, (retry + 1) * 10));
    }
  }
  throw new Error('Serializable transaction retry limit reached');
};

const recomputePositionProjection = async (prisma: Prisma.TransactionClient, positionId: string, householdId: string): Promise<InvestmentPosition> => {
  const transactions = await prisma.investmentTransaction.findMany({
    where: { householdId, positionId },
    orderBy: transactionOrder
  });

  let units = zero();
  let costBasis = zero();
  let currentValue: Prisma.Decimal | null = null;
  let lastValuedAt: Date | null = null;

  for (const transaction of transactions) {
    if (transaction.voidedAt !== null) continue;

    if (transaction.type === 'BUY') {
      if (transaction.units === null) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'BUY transaction has no units');
      units = units.add(transaction.units);
      costBasis = costBasis.add(transaction.amount).toDecimalPlaces(2);
    } else if (transaction.type === 'SELL') {
      if (transaction.units === null) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'SELL transaction has no units');
      if (transaction.units.gt(units)) throw new InvestmentServiceError('SELL_UNITS_INSUFFICIENT', 'The sell transaction exceeds available units');
      const averageCost = units.eq(0) ? zero() : costBasis.div(units);
      units = units.sub(transaction.units).toDecimalPlaces(8);
      costBasis = units.eq(0) ? zero() : costBasis.sub(averageCost.mul(transaction.units)).toDecimalPlaces(2);
    } else if (transaction.type === 'VALUATION_UPDATE') {
      currentValue = transaction.amount;
      lastValuedAt = transaction.date;
    }
  }

  assertDecimalPrecision(units, 'units', 20, 8);
  assertDecimalPrecision(costBasis, 'costBasis', 15, 2);
  if (currentValue !== null) assertDecimalPrecision(currentValue, 'currentValue', 15, 2);

  return prisma.investmentPosition.update({
    where: { id: positionId },
    data: { units, costBasis, currentValue, lastValuedAt }
  });
};

const findExistingTransaction = async (prisma: PrismaClient | Prisma.TransactionClient, householdId: string, operationId: string): Promise<InvestmentTransaction | null> =>
  prisma.investmentTransaction.findUnique({ where: { householdId_operationId: { householdId, operationId } } });

export const createInvestmentPosition = async (prisma: PrismaClient, input: CreateInvestmentPositionInput): Promise<InvestmentPosition> => {
  const instrument = assertPositionText(input.instrument);
  const targetAllocationPercent = parsePercentage(input.targetAllocationPercent);

  return prisma.investmentPosition.create({
    data: {
      householdId: input.householdId,
      ownerUserId: input.userId,
      wrapper: input.wrapper,
      visibility: input.visibility ?? 'PRIVATE',
      instrument,
      units: zero(),
      costBasis: zero(),
      currentValue: null,
      targetAllocationPercent
    }
  });
};

export const listInvestmentPositions = async (prisma: PrismaClient, householdId: string, userId: string): Promise<InvestmentPosition[]> =>
  prisma.investmentPosition.findMany({
    where: {
      householdId,
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }]
    },
    orderBy: [{ archivedAt: 'asc' }, { createdAt: 'asc' }],
    take: MAX_VISIBLE_INVESTMENT_POSITIONS + 1
  }).then((positions) => {
    assertWorkload(positions.length, MAX_VISIBLE_INVESTMENT_POSITIONS, 'Visible investment positions');
    return positions;
  });

export const getInvestmentPosition = async (prisma: PrismaClient, householdId: string, userId: string, positionId: string): Promise<InvestmentPosition | null> =>
  getVisiblePosition(prisma, householdId, userId, positionId);

export const updateInvestmentPosition = async (prisma: PrismaClient, householdId: string, positionId: string, input: UpdateInvestmentPositionInput): Promise<InvestmentPosition> => {
  return runSerializableTransaction(prisma, async (transactionClient) => {
    await lockInvestmentPosition(transactionClient, householdId, positionId);
    const position = await requireVisiblePosition(transactionClient, householdId, input.userId, positionId);
    requireOwner(position, input.userId);

    const hasMetadataUpdate = input.wrapper !== undefined || input.instrument !== undefined || input.visibility !== undefined || 'targetAllocationPercent' in input;
    if (position.archivedAt !== null && (input.archive !== true || hasMetadataUpdate)) {
      throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'Archived investment positions are read-only');
    }

    if (input.archive === true) {
      if (position.archivedAt !== null) return position;
      if (!position.units.eq(0) || position.currentValue === null || !position.currentValue.eq(0)) {
        throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'An investment position can be archived only with zero units and zero current value');
      }
    }

    if (input.wrapper !== undefined && input.wrapper !== position.wrapper) {
      const transactionCount = await transactionClient.investmentTransaction.count({ where: { householdId, positionId } });
      if (transactionCount > 0) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'The wrapper cannot change after the first transaction');
    }

    const data: Prisma.InvestmentPositionUpdateInput = {
      ...(input.wrapper !== undefined ? { wrapper: input.wrapper } : {}),
      ...(input.instrument !== undefined ? { instrument: assertPositionText(input.instrument) } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
      ...('targetAllocationPercent' in input ? { targetAllocationPercent: parsePercentage(input.targetAllocationPercent) } : {}),
      ...(input.archive === true ? { archivedAt: new Date() } : {})
    };

    if (Object.keys(data).length === 0) return position;
    return transactionClient.investmentPosition.update({ where: { id: positionId }, data });
  });
};

export const recordInvestmentTransaction = async (prisma: PrismaClient, input: RecordInvestmentTransactionInput): Promise<InvestmentTransactionResult> => {
  const operationId = assertOperationId(input.operationId);
  const date = parseDate(input.date, 'date');
  const amount = parseDecimal(input.amount, 'amount', 2, input.type === 'VALUATION_UPDATE', 15);
  const units = parseOptionalDecimal(input.units, 'units', 8, false, 20);

  if ((input.type === 'BUY' || input.type === 'SELL') && units === null) throw new InvestmentServiceError('VALIDATION_ERROR', `${input.type} transactions require units`);
  if ((input.type === 'VALUATION_UPDATE' || input.type === 'CONTRIBUTION') && units !== null) throw new InvestmentServiceError('VALIDATION_ERROR', `${input.type} transactions do not accept units`);

  const payload = { householdId: input.householdId, positionId: input.positionId, type: input.type, units, amount, date, operationId };

  const execute = async (transactionClient: Prisma.TransactionClient): Promise<InvestmentTransactionResult> => {
    await lockInvestmentPosition(transactionClient, input.householdId, input.positionId);
    const position = await requireVisiblePosition(transactionClient, input.householdId, input.userId, input.positionId);
    requireOwner(position, input.userId);
    const existing = await findExistingTransaction(transactionClient, input.householdId, operationId);
    if (existing) {
      if (!isSameTransactionPayload(existing, payload)) throw new InvestmentServiceError('IDEMPOTENCY_CONFLICT', 'The operationId was already used with a different payload');
      const existingPosition = await transactionClient.investmentPosition.findFirst({ where: { householdId: input.householdId, id: existing.positionId } });
      if (!existingPosition) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'The existing investment position is missing');
      return { transaction: existing, position: existingPosition, replayed: true };
    }
    if (position.archivedAt !== null) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'Archived investment positions are read-only');

    const transaction = await transactionClient.investmentTransaction.create({
      data: { householdId: input.householdId, positionId: input.positionId, type: input.type, units, amount, date, operationId }
    });
    const updatedPosition = await recomputePositionProjection(transactionClient, input.positionId, input.householdId);
    return { transaction, position: updatedPosition, replayed: false };
  };

  return runSerializableTransaction(prisma, execute).catch(async (error: unknown) => {
    if (!isPrismaErrorCode(error, 'P2002')) throw error;
    return runSerializableTransaction(prisma, async (transactionClient) => {
      await lockInvestmentPosition(transactionClient, input.householdId, input.positionId);
      const position = await requireVisiblePosition(transactionClient, input.householdId, input.userId, input.positionId);
      requireOwner(position, input.userId);
      const existing = await findExistingTransaction(transactionClient, input.householdId, operationId);
      if (!existing || !isSameTransactionPayload(existing, payload)) {
        throw new InvestmentServiceError('IDEMPOTENCY_CONFLICT', 'The operationId was already used with a different payload');
      }
      const existingPosition = await transactionClient.investmentPosition.findFirst({ where: { householdId: input.householdId, id: existing.positionId } });
      if (!existingPosition) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'The existing investment position is missing');
      return { transaction: existing, position: existingPosition, replayed: true };
    });
  });
};

export const listInvestmentTransactions = async (prisma: PrismaClient, householdId: string, userId: string, positionId: string): Promise<InvestmentTransaction[]> => {
  await requireVisiblePosition(prisma, householdId, userId, positionId);
  return prisma.investmentTransaction.findMany({
    where: { householdId, positionId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_INVESTMENT_TRANSACTION_ROWS + 1
  }).then((transactions) => {
    assertWorkload(transactions.length, MAX_INVESTMENT_TRANSACTION_ROWS, 'Investment transaction history');
    return transactions;
  });
};

export const voidInvestmentTransaction = async (prisma: PrismaClient, householdId: string, userId: string, positionId: string, transactionId: string): Promise<VoidInvestmentTransactionResult> => {
  return runSerializableTransaction(prisma, async (transactionClient) => {
    await lockInvestmentPosition(transactionClient, householdId, positionId);
    const position = await requireVisiblePosition(transactionClient, householdId, userId, positionId);
    requireOwner(position, userId);
    if (position.archivedAt !== null) throw new InvestmentServiceError('INVESTMENT_INVALID_STATE', 'Archived investment positions are read-only');

    const transaction = await transactionClient.investmentTransaction.findFirst({ where: { id: transactionId, householdId, positionId } });
    if (!transaction) throw new InvestmentServiceError('INVESTMENT_TRANSACTION_NOT_FOUND', 'Investment transaction was not found');
    if (transaction.voidedAt !== null) {
      const currentPosition = await transactionClient.investmentPosition.findFirst({ where: { householdId, id: positionId } });
      if (!currentPosition) throw new InvestmentServiceError('INVESTMENT_NOT_FOUND', 'Investment position was not found');
      return { transaction, position: currentPosition, replayed: true };
    }

    const voidResult = await transactionClient.investmentTransaction.updateMany({
      where: { id: transactionId, householdId, positionId, voidedAt: null },
      data: { voidedAt: new Date(), voidedByUserId: userId }
    });
    if (voidResult.count === 0) {
      const currentTransaction = await transactionClient.investmentTransaction.findFirst({ where: { id: transactionId, householdId, positionId } });
      if (currentTransaction && currentTransaction.voidedAt !== null) {
        return { transaction: currentTransaction, position, replayed: true };
      }
      throw new InvestmentServiceError('INVESTMENT_TRANSACTION_NOT_FOUND', 'Investment transaction was not found');
    }
    const voidedTransaction = await transactionClient.investmentTransaction.findUniqueOrThrow({ where: { id: transactionId } });
    const updatedPosition = await recomputePositionProjection(transactionClient, positionId, householdId);
    return { transaction: voidedTransaction, position: updatedPosition, replayed: false };
  });
};

export const getInvestmentPortfolio = async (prisma: PrismaClient, householdId: string, userId: string): Promise<InvestmentPortfolio> => {
  const positions = await prisma.investmentPosition.findMany({
    where: {
      householdId,
      archivedAt: null,
      OR: [{ visibility: 'SHARED' }, { visibility: 'PRIVATE', ownerUserId: userId }]
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_VISIBLE_INVESTMENT_POSITIONS + 1
  });
  assertWorkload(positions.length, MAX_VISIBLE_INVESTMENT_POSITIONS, 'Visible investment positions');

  const valuedCurrentValue = positions.reduce((total, position) => position.currentValue === null ? total : total.add(position.currentValue), zero());
  const missingValuationCount = positions.filter((position) => position.currentValue === null).length;
  const targetTotal = positions.reduce((total, position) => position.targetAllocationPercent === null ? total : total.add(position.targetAllocationPercent), zero());
  const targetStatus = positions.length === 0 || positions.every((position) => position.targetAllocationPercent === null)
    ? 'NONE'
    : positions.every((position) => position.targetAllocationPercent !== null) && targetTotal.eq(100) ? 'COMPLETE' : 'INCOMPLETE';

  return {
    positions: positions.map((position) => ({
      position,
      currentAllocationPercent: position.currentValue !== null && valuedCurrentValue.gt(0) ? position.currentValue.div(valuedCurrentValue).mul(100).toFixed(2) : null,
      driftPercent: targetStatus === 'COMPLETE' && missingValuationCount === 0 && position.currentValue !== null && position.targetAllocationPercent !== null && valuedCurrentValue.gt(0)
        ? position.currentValue.div(valuedCurrentValue).mul(100).sub(position.targetAllocationPercent).toFixed(2)
        : null
    })),
    totalCurrentValue: valuedCurrentValue.toFixed(2),
    valuedCurrentValue: valuedCurrentValue.toFixed(2),
    missingValuationCount,
    dataQuality: missingValuationCount === 0 ? 'COMPLETE' : 'PARTIAL',
    targetAllocation: { status: targetStatus, totalPercent: targetTotal.toFixed(2) }
  };
};
