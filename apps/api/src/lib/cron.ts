import cron from 'node-cron';
import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { HouseholdDatabase } from '@ksiegowy/household-service';
import { generateDueCommitmentTransactions, runGoalAutomations, runRenewalReminderSweep } from '@ksiegowy/household-service';
import { ICloudBackupProvider } from '../services/backup/icloud.js';
import { retryOfflineQueue } from '../services/ksef.service.js';

/**
 * Schedules platform-managed iCloud backup and KSeF retry checks.
 * Each run is recorded in the BackupRun table.
 */
export function scheduleDailyBackup(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  storageBase: string
): void {
  cron.schedule('0 2 * * *', () => {
    runBackup(prisma, logger, storageBase).catch((err: unknown) => {
      logger.error({ err }, 'Daily backup cron failed unexpectedly');
    });
  });

  logger.info('Daily backup cron scheduled at 02:00 AM');

  const encryptionKey = process.env['ENCRYPTION_KEY'] ?? '';
  cron.schedule('0 * * * *', () => {
    retryOfflineQueue(prisma, encryptionKey, logger).catch((err: unknown) => {
      logger.error({ err }, 'KSeF offline queue retry cron failed unexpectedly');
    });
  });

  logger.info('KSeF offline queue retry cron scheduled (hourly)');
}

/**
 * Schedules the two daily household jobs: idempotent recurring-transaction
 * generation from ACTIVE commitments, and the renewal-reminder sweep that
 * feeds the dashboard's "upcoming" query. Both call directly into
 * @ksiegowy/household-service — cron lives in apps/api, but never contains
 * household business logic itself.
 */
export function scheduleDailyHouseholdJobs(householdDatabase: HouseholdDatabase, logger: FastifyBaseLogger): void {
  cron.schedule('0 3 * * *', () => {
    generateDueCommitmentTransactions(householdDatabase)
      .then((result) => {
        logger.info(result, 'Household commitment generation cron completed');
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Household commitment generation cron failed unexpectedly');
      });
  });

  logger.info('Household commitment generation cron scheduled at 03:00 AM');

  cron.schedule('30 3 * * *', () => {
    runRenewalReminderSweep(householdDatabase)
      .then((result) => {
        logger.info(result, 'Household renewal reminder sweep completed');
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Household renewal reminder sweep failed unexpectedly');
      });
  });

  logger.info('Household renewal reminder sweep cron scheduled at 03:30 AM');

  cron.schedule('0 4 * * *', () => {
    runGoalAutomations(householdDatabase)
      .then((result) => {
        logger.info(result, 'Household goal automation cron completed');
      })
      .catch((err: unknown) => {
        logger.error({ err }, 'Household goal automation cron failed unexpectedly');
      });
  }, { timezone: 'Europe/Warsaw' });

  logger.info('Household goal automation cron scheduled at 04:00 Europe/Warsaw');
}

async function runBackup(
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  storageBase: string
): Promise<void> {
  const providers = [new ICloudBackupProvider()].filter((provider) => provider.isEnabled());

  if (providers.length === 0) {
    logger.info('No backup providers enabled — skipping daily backup');
    return;
  }

  logger.info({ providers: providers.map((p) => p.name) }, 'Starting daily backup');

  for (const provider of providers) {
    const startedAt = new Date();
    const result = await provider.run(prisma, storageBase).catch((err: unknown) => ({
      provider: provider.name,
      filesCount: 0,
      bytesTotal: 0,
      error: err instanceof Error ? err.message : String(err),
    }));

    await prisma.backupRun.create({
      data: {
        provider: result.provider,
        triggerSource: 'platform_schedule',
        status: result.error ? 'error' : 'success',
        filesCount: result.filesCount,
        bytesTotal: result.bytesTotal,
        errorMessage: result.error ?? null,
        startedAt,
        finishedAt: new Date(),
      },
    });

    if (result.error) {
      logger.error({ provider: result.provider, err: result.error }, 'Backup provider failed');
    } else {
      logger.info({ provider: result.provider, filesCount: result.filesCount, bytesTotal: result.bytesTotal }, 'Backup completed');
    }
  }
}
