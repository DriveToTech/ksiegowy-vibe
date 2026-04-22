import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { runScheduledCompanyGoogleDriveBackups } from './services/backup/company-backup-policy.js';

const DEFAULT_STORAGE_BASE_PATH = './storage';

const runScheduledCompanyGoogleDriveBackupSlice = async (): Promise<void> => {
  const app = Fastify({ logger: true });
  const prismaClient = new PrismaClient();
  const storageBasePath = process.env['STORAGE_BASE_PATH'] ?? DEFAULT_STORAGE_BASE_PATH;

  try {
    app.log.info('Starting one-shot scheduled company Google Drive backup run');
    await prismaClient.$connect();
    await runScheduledCompanyGoogleDriveBackups(prismaClient, app.log, storageBasePath);
    app.log.info('Finished one-shot scheduled company Google Drive backup run');
  } catch (error: unknown) {
    app.log.error({ error }, 'One-shot scheduled company Google Drive backup run failed');
    process.exitCode = 1;
  }

  await prismaClient.$disconnect().catch((error: unknown) => {
    app.log.error({ error }, 'Failed to disconnect Prisma client in one-shot backup runner');
    process.exitCode = 1;
  });

  await app.close().catch((error: unknown) => {
    app.log.error({ error }, 'Failed to close logger app in one-shot backup runner');
    process.exitCode = 1;
  });
};

void runScheduledCompanyGoogleDriveBackupSlice();
