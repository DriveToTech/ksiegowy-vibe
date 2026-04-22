import type { PrismaClient } from '@prisma/client';

export interface BackupResult {
  provider: string;
  filesCount: number;
  bytesTotal: number;
  error?: string;
}

export interface BackupProvider {
  readonly name: string;
  isEnabled(): boolean;
  run(prisma: PrismaClient, storageBase: string, companyId?: string): Promise<BackupResult>;
}
