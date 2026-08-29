import { PrismaClient } from './generated/client/index.js';

export { PrismaClient } from './generated/client/index.js';
export type * from './generated/client/index.js';

/**
 * Creates the household database's Prisma client. This is the only place
 * in the package (and the only place apps/api is allowed to reach into)
 * that constructs the household Prisma client.
 */
export const createHouseholdDatabase = (databaseUrl: string): PrismaClient => {
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl
      }
    }
  });
};

export type HouseholdDatabase = PrismaClient;

export * from './domain/household.service.js';
export * from './domain/household-account.service.js';
export * from './domain/household-category.service.js';
export * from './domain/household-transaction.service.js';
export * from './domain/categorization-rule.service.js';
export * from './domain/statement-import.service.js';
export * from './domain/budget-envelope.service.js';
export * from './domain/commitment.service.js';
export * from './domain/commitment-reminder.service.js';
export * from './domain/goal.service.js';
export * from './domain/goal-movement.service.js';
export * from './domain/goal-automation.service.js';
export * from './domain/investment.service.js';
export * from './domain/investment-read.service.js';
export * from './domain/report.service.js';
