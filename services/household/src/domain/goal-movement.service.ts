import { type GoalMovement, type PrismaClient } from '../generated/client/index.js';
import { visibleAccountIds } from './household-account.service.js';
import { GoalServiceError } from './goal.service.js';

const MAX_GOAL_MOVEMENT_PAGE_SIZE = 200;
const MAX_GOAL_MOVEMENT_CURSOR_LENGTH = 512;

export interface ListGoalMovementsInput {
  cursor?: string;
  limit?: number;
}

export interface ListGoalMovementsResult {
  data: GoalMovement[];
  nextCursor: string | null;
}

const encodeCursor = (movement: GoalMovement): string => Buffer.from(JSON.stringify({ createdAt: movement.createdAt.toISOString(), id: movement.id }), 'utf8').toString('base64url');

const decodeCursor = (cursor: string): { createdAt: Date; id: string } => {
  if (cursor.length > MAX_GOAL_MOVEMENT_CURSOR_LENGTH) throw new GoalServiceError('VALIDATION_ERROR', 'cursor is too long');
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof decoded !== 'object' || decoded === null || !('createdAt' in decoded) || !('id' in decoded) || typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') throw new Error('invalid');
    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error('invalid');
    return { createdAt, id: decoded.id };
  } catch {
    throw new GoalServiceError('VALIDATION_ERROR', 'cursor is invalid');
  }
};

export const listGoalMovements = async (prisma: PrismaClient, householdId: string, userId: string, goalId: string, input: ListGoalMovementsInput = {}): Promise<ListGoalMovementsResult> => {
  const accountIds = await visibleAccountIds(prisma, householdId, userId);
  if (accountIds.length === 0) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');
  const goal = await prisma.goal.findFirst({ where: { id: goalId, householdId, accountId: { in: accountIds } }, select: { id: true } });
  if (!goal) throw new GoalServiceError('GOAL_NOT_FOUND', 'Goal was not found');

  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GOAL_MOVEMENT_PAGE_SIZE) throw new GoalServiceError('VALIDATION_ERROR', 'limit must be between 1 and 200');
  const cursor = input.cursor ? decodeCursor(input.cursor) : null;
  const movements = await prisma.goalMovement.findMany({
    where: { householdId, goalId, ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1
  });
  const hasNext = movements.length > limit;
  const data = hasNext ? movements.slice(0, limit) : movements;
  return { data, nextCursor: hasNext && data.length > 0 ? encodeCursor(data[data.length - 1]!) : null };
};
