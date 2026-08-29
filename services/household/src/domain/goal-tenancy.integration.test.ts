import crypto from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/client/index.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHouseholdDatabase } from '../index.js';

const integrationDatabaseUrl = process.env.HOUSEHOLD_INTEGRATION_DATABASE_URL;

describe.skipIf(!integrationDatabaseUrl)('goal tenant-aware foreign keys', () => {
  let database: PrismaClient;
  let householdA: { id: string };
  let householdB: { id: string };
  let accountA: { id: string };
  let secondaryAccountA: { id: string };
  let accountB: { id: string };
  let goalA: { id: string };
  let goalB: { id: string };
  let ruleB: { id: string };
  let movementB: { id: string };
  let transactionB: { id: string };

  beforeAll(async () => {
    database = createHouseholdDatabase(integrationDatabaseUrl!);
    householdA = await database.household.create({ data: { name: 'Tenant A' } });
    householdB = await database.household.create({ data: { name: 'Tenant B' } });
    accountA = await database.householdAccount.create({ data: { householdId: householdA.id, name: 'A account', type: 'CURRENT' } });
    secondaryAccountA = await database.householdAccount.create({ data: { householdId: householdA.id, name: 'A savings', type: 'SAVINGS' } });
    accountB = await database.householdAccount.create({ data: { householdId: householdB.id, name: 'B account', type: 'CURRENT' } });

    goalA = await database.goal.create({ data: { householdId: householdA.id, accountId: accountA.id, name: 'A goal', kind: 'ONE_OFF', targetAmount: '100.00', currentAmount: '0.00', targetDate: new Date('2026-12-31') } });
    goalB = await database.goal.create({ data: { householdId: householdB.id, accountId: accountB.id, name: 'B goal', kind: 'ONE_OFF', targetAmount: '100.00', currentAmount: '0.00', targetDate: new Date('2026-12-31') } });
    ruleB = await database.goalAutomationRule.create({ data: { householdId: householdB.id, goalId: goalB.id, ruleType: 'FIXED_ON_DAY', automationIdentity: crypto.randomUUID(), fundingAccountId: accountB.id, createdByUserId: 'user-b', startsOn: new Date('2026-08-01'), fixedAmount: '10.00', dayOfMonth: 15 } });
    movementB = await database.goalMovement.create({ data: { householdId: householdB.id, goalId: goalB.id, amount: '10.00', source: 'AUTOMATION', effectiveDate: new Date('2026-08-29'), automationRuleId: ruleB.id, transferGroupId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), balanceAfter: '10.00' } });
    transactionB = await database.householdTransaction.create({ data: { householdId: householdB.id, accountId: accountB.id, payee: 'B transaction', amount: '-1.00', date: new Date('2026-08-29') } });
  });

  afterAll(async () => {
    await database.household.deleteMany({ where: { id: { in: [householdA.id, householdB.id] } } });
    await database.$disconnect();
  });

  it('rejects cross-household goal, movement, rule, linked transaction, and source references', async () => {
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "Goal" ("id", "householdId", "accountId", "name", "kind", "targetAmount", "currentAmount", "targetDate", "updatedAt") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${accountB.id}, 'cross goal', 'ONE_OFF'::"GoalKind", 100, 0, DATE '2026-12-31', CURRENT_TIMESTAMP)`)).rejects.toThrow();
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "GoalMovement" ("id", "householdId", "goalId", "amount", "source", "effectiveDate", "automationRuleId", "transferGroupId", "idempotencyKey", "balanceAfter") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${goalB.id}, 10, 'MANUAL'::"GoalMovementSource", DATE '2026-08-29', ${ruleB.id}, ${crypto.randomUUID()}, ${crypto.randomUUID()}, 10)`)).rejects.toThrow();
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "GoalAutomationRule" ("id", "householdId", "goalId", "ruleType", "automationIdentity", "fundingAccountId", "createdByUserId", "startsOn", "fixedAmount", "dayOfMonth", "updatedAt") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${goalA.id}, 'FIXED_ON_DAY'::"GoalAutomationRuleType", ${crypto.randomUUID()}, ${accountB.id}, 'user-a', DATE '2026-08-01', 10, 15, CURRENT_TIMESTAMP)`)).rejects.toThrow();
    const duplicateRuleValues = Prisma.sql`("id", "householdId", "goalId", "ruleType", "automationIdentity", "fundingAccountId", "createdByUserId", "startsOn", "fixedAmount", "dayOfMonth", "updatedAt") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${goalA.id}, 'FIXED_ON_DAY'::"GoalAutomationRuleType", ${crypto.randomUUID()}, ${secondaryAccountA.id}, 'user-a', DATE '2026-08-01', 10, 15, CURRENT_TIMESTAMP)`;
    await database.$executeRaw(Prisma.sql`INSERT INTO "GoalAutomationRule" ${duplicateRuleValues}`);
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "GoalAutomationRule" ${Prisma.sql`("id", "householdId", "goalId", "ruleType", "automationIdentity", "fundingAccountId", "createdByUserId", "startsOn", "fixedAmount", "dayOfMonth", "updatedAt") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${goalA.id}, 'FIXED_ON_DAY'::"GoalAutomationRuleType", ${crypto.randomUUID()}, ${secondaryAccountA.id}, 'user-b', DATE '2026-08-01', 10, 15, CURRENT_TIMESTAMP)`}`)).rejects.toThrow();
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "HouseholdTransaction" ("id", "householdId", "accountId", "payee", "amount", "date", "goalMovementId") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${accountA.id}, 'cross movement', 10, DATE '2026-08-29', ${movementB.id})`)).rejects.toThrow();
    await expect(database.$executeRaw(Prisma.sql`INSERT INTO "GoalMovement" ("id", "householdId", "goalId", "amount", "source", "effectiveDate", "transferGroupId", "idempotencyKey", "balanceAfter", "sourceTransactionId") VALUES (${crypto.randomUUID()}, ${householdA.id}, ${goalA.id}, 10, 'ROUND_UP'::"GoalMovementSource", DATE '2026-08-29', ${crypto.randomUUID()}, ${crypto.randomUUID()}, 10, ${transactionB.id})`)).rejects.toThrow();
  });
});
