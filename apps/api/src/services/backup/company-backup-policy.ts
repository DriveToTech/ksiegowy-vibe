import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CompanyBackupPolicy,
  CompanyBackupScheduleMode,
  PrismaClient,
} from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import { GDriveBackupProvider, isGoogleDriveReauthorizationRequiredError } from './gdrive.js';

export const COMPANY_BACKUP_PROVIDER = 'GOOGLE_DRIVE' as const;

export interface CompanyGoogleDriveBackupPolicyView {
  provider: typeof COMPANY_BACKUP_PROVIDER;
  automaticOnInvoiceIssued: boolean;
  scheduleMode: CompanyBackupScheduleMode;
  scheduleHour: number | null;
  scheduleMinute: number | null;
  scheduleDayOfWeek: number | null;
  scheduleTimezone: string;
  updatedAt: string;
}

export interface PlatformPostgresqlBackupFreshness {
  status: 'FRESH' | 'STALE' | 'MISSING' | 'INCOMPLETE';
  latestArtifactTimestamp: string | null;
  latestArtifactCreatedAt: string | null;
  latestArtifactAgeHours: number | null;
  maxAllowedAgeHours: number;
  checkedAt: string;
}

export interface PlatformPostgresqlBackupStatusReadModel {
  status: 'FRESH' | 'STALE' | 'MISSING' | 'INCOMPLETE' | 'UNAVAILABLE';
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'UNKNOWN';
  isPlatformManaged: true;
  summary: string;
  latestArtifactTimestamp: string | null;
  latestArtifactCreatedAt: string | null;
  latestArtifactAgeHours: number | null;
  maxAllowedAgeHours: number;
  checkedAt: string;
  reasonCode: 'OK' | 'ARTIFACT_TOO_OLD' | 'ARTIFACT_NOT_FOUND' | 'ARTIFACT_SET_INCOMPLETE' | 'SOURCE_UNAVAILABLE';
}

export interface CompanyBackupStatusReadModel {
  companyId: string;
  evaluatedAt: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL' | 'UNKNOWN';
  platformPostgresql: PlatformPostgresqlBackupStatusReadModel;
  companyGoogleDrive: {
    connectionStatus: 'CONNECTED' | 'DISCONNECTED' | 'REAUTHORIZATION_REQUIRED';
    lastBackupAt: string | null;
    isPolicyAutomationEnabled: boolean;
    summary: string;
  };
}

interface PlatformPostgresqlBackupFreshnessWithAvailability {
  status: 'FRESH' | 'STALE' | 'MISSING' | 'INCOMPLETE' | 'UNAVAILABLE';
  latestArtifactTimestamp: string | null;
  latestArtifactCreatedAt: string | null;
  latestArtifactAgeHours: number | null;
  maxAllowedAgeHours: number;
  checkedAt: string;
}

export interface CompanyGoogleDriveBackupSettings {
  companyId: string;
  provider: typeof COMPANY_BACKUP_PROVIDER;
  googleDrive: {
    isConnected: boolean;
    requiresReauthorization: boolean;
    expiresAt: string | null;
    lastBackupAt: string | null;
  };
  policy: CompanyGoogleDriveBackupPolicyView;
  platformPostgresqlBackupFreshness: PlatformPostgresqlBackupFreshness;
}

export interface UpdateCompanyBackupPolicyInput {
  automaticOnInvoiceIssued?: boolean;
  scheduleMode?: CompanyBackupScheduleMode;
  scheduleHour?: number | null;
  scheduleMinute?: number | null;
  scheduleDayOfWeek?: number | null;
  scheduleTimezone?: string;
}

export interface CompanyGoogleDriveBackupRunResult {
  backupRunId: string;
  filesCount: number;
  bytesTotal: number;
  startedAt: string;
  finishedAt: string;
  triggerSource: string;
}

export interface CompanyGoogleDriveBackupRunError {
  code: 'REAUTHORIZATION_REQUIRED';
  message: string;
}

interface BackupResultWithCause {
  provider: string;
  filesCount: number;
  bytesTotal: number;
  error?: string;
  cause?: unknown;
}

const DEFAULT_POLICY: Pick<CompanyBackupPolicy, 'automaticOnInvoiceIssued' | 'scheduleMode' | 'scheduleHour' | 'scheduleMinute' | 'scheduleDayOfWeek' | 'scheduleTimezone'> = {
  automaticOnInvoiceIssued: false,
  scheduleMode: 'MANUAL',
  scheduleHour: null,
  scheduleMinute: null,
  scheduleDayOfWeek: null,
  scheduleTimezone: 'Europe/Warsaw',
};

const getPostgresqlBackupMaxAgeHours = (): number => {
  const rawValue = Number.parseInt(process.env['BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS'] ?? '30', 10);
  if (Number.isNaN(rawValue) || rawValue <= 0) {
    return 30;
  }
  return rawValue;
};

const getPostgresqlBackupArtifactsDirectory = (): string => {
  return path.resolve(process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] ?? './backups/postgresql');
};

const getPostgresqlBackupEnvironmentName = (): string => {
  return process.env['DB_BACKUP_ENVIRONMENT_NAME'] ?? 'local';
};

const mapPolicy = (
  policy: Pick<CompanyBackupPolicy, 'automaticOnInvoiceIssued' | 'scheduleMode' | 'scheduleHour' | 'scheduleMinute' | 'scheduleDayOfWeek' | 'scheduleTimezone' | 'updatedAt'>
): CompanyGoogleDriveBackupPolicyView => ({
  provider: COMPANY_BACKUP_PROVIDER,
  automaticOnInvoiceIssued: policy.automaticOnInvoiceIssued,
  scheduleMode: policy.scheduleMode,
  scheduleHour: policy.scheduleHour,
  scheduleMinute: policy.scheduleMinute,
  scheduleDayOfWeek: policy.scheduleDayOfWeek,
  scheduleTimezone: policy.scheduleTimezone,
  updatedAt: policy.updatedAt.toISOString(),
});

const createDefaultPolicyView = (): CompanyGoogleDriveBackupPolicyView => {
  return {
    provider: COMPANY_BACKUP_PROVIDER,
    automaticOnInvoiceIssued: DEFAULT_POLICY.automaticOnInvoiceIssued,
    scheduleMode: DEFAULT_POLICY.scheduleMode,
    scheduleHour: DEFAULT_POLICY.scheduleHour,
    scheduleMinute: DEFAULT_POLICY.scheduleMinute,
    scheduleDayOfWeek: DEFAULT_POLICY.scheduleDayOfWeek,
    scheduleTimezone: DEFAULT_POLICY.scheduleTimezone,
    updatedAt: new Date(0).toISOString(),
  };
};

export const validatePolicyTimezone = (timezone: string): void => {
  new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
};

export const validateCompanyBackupPolicy = (policy: {
  scheduleMode: CompanyBackupScheduleMode;
  scheduleHour: number | null;
  scheduleMinute: number | null;
  scheduleDayOfWeek: number | null;
  scheduleTimezone: string;
}): void => {
  validatePolicyTimezone(policy.scheduleTimezone);

  if (policy.scheduleMode === 'MANUAL') {
    return;
  }

  if (policy.scheduleHour === null || policy.scheduleMinute === null) {
    throw new Error('scheduleHour and scheduleMinute are required for DAILY and WEEKLY schedule modes');
  }

  if (policy.scheduleHour < 0 || policy.scheduleHour > 23) {
    throw new Error('scheduleHour must be between 0 and 23');
  }

  if (policy.scheduleMinute < 0 || policy.scheduleMinute > 59) {
    throw new Error('scheduleMinute must be between 0 and 59');
  }

  if (policy.scheduleMode === 'DAILY') {
    return;
  }

  if (policy.scheduleDayOfWeek === null) {
    throw new Error('scheduleDayOfWeek is required for WEEKLY schedule mode');
  }

  if (policy.scheduleDayOfWeek < 1 || policy.scheduleDayOfWeek > 7) {
    throw new Error('scheduleDayOfWeek must be between 1 and 7 (1=Monday, 7=Sunday)');
  }
};

export const isCompanyBackupPolicyAutomationEnabled = (policy: {
  automaticOnInvoiceIssued: boolean;
  scheduleMode: CompanyBackupScheduleMode;
}): boolean => {
  return policy.automaticOnInvoiceIssued || policy.scheduleMode !== 'MANUAL';
};

export const validatePolicyAutomationConnection = (policy: {
  automaticOnInvoiceIssued: boolean;
  scheduleMode: CompanyBackupScheduleMode;
}, isGoogleDriveConnected: boolean): void => {
  if (!isCompanyBackupPolicyAutomationEnabled(policy)) {
    return;
  }

  if (!isGoogleDriveConnected) {
    throw new Error('Google Drive must be connected before enabling scheduled or invoice-issued backups');
  }
};

const loadCompanyPolicy = async (prisma: PrismaClient, companyId: string): Promise<CompanyBackupPolicy | null> => {
  return prisma.companyBackupPolicy.findUnique({
    where: {
      companyId_provider: {
        companyId,
        provider: COMPANY_BACKUP_PROVIDER,
      },
    },
  });
};

export const getCompanyGoogleDriveBackupSettings = async (
  prisma: PrismaClient,
  companyId: string
): Promise<CompanyGoogleDriveBackupSettings> => {
  const [policy, credential, platformPostgresqlBackupFreshness] = await Promise.all([
    loadCompanyPolicy(prisma, companyId),
    prisma.googleDriveCredential.findUnique({ where: { companyId } }),
    readPlatformPostgresqlBackupFreshness(),
  ]);

  return {
    companyId,
    provider: COMPANY_BACKUP_PROVIDER,
    googleDrive: {
      isConnected: credential !== null && !credential.requiresReauthorization,
      requiresReauthorization: credential?.requiresReauthorization === true,
      expiresAt: credential?.expiresAt.toISOString() ?? null,
      lastBackupAt: credential?.lastBackupAt?.toISOString() ?? null,
    },
    policy: policy ? mapPolicy(policy) : createDefaultPolicyView(),
    platformPostgresqlBackupFreshness,
  };
};

const mergePolicyInput = (
  currentPolicy: {
    automaticOnInvoiceIssued: boolean;
    scheduleMode: CompanyBackupScheduleMode;
    scheduleHour: number | null;
    scheduleMinute: number | null;
    scheduleDayOfWeek: number | null;
    scheduleTimezone: string;
  },
  input: UpdateCompanyBackupPolicyInput
): {
  automaticOnInvoiceIssued: boolean;
  scheduleMode: CompanyBackupScheduleMode;
  scheduleHour: number | null;
  scheduleMinute: number | null;
  scheduleDayOfWeek: number | null;
  scheduleTimezone: string;
} => {
  return {
    automaticOnInvoiceIssued: input.automaticOnInvoiceIssued ?? currentPolicy.automaticOnInvoiceIssued,
    scheduleMode: input.scheduleMode ?? currentPolicy.scheduleMode,
    scheduleHour: input.scheduleHour === undefined ? currentPolicy.scheduleHour : input.scheduleHour,
    scheduleMinute: input.scheduleMinute === undefined ? currentPolicy.scheduleMinute : input.scheduleMinute,
    scheduleDayOfWeek: input.scheduleDayOfWeek === undefined ? currentPolicy.scheduleDayOfWeek : input.scheduleDayOfWeek,
    scheduleTimezone: input.scheduleTimezone ?? currentPolicy.scheduleTimezone,
  };
};

export const updateCompanyGoogleDriveBackupPolicy = async (
  prisma: PrismaClient,
  companyId: string,
  input: UpdateCompanyBackupPolicyInput
): Promise<CompanyGoogleDriveBackupSettings> => {
  const [existingPolicy, credential] = await Promise.all([
    loadCompanyPolicy(prisma, companyId),
    prisma.googleDriveCredential.findUnique({ where: { companyId } }),
  ]);

  const mergedPolicy = mergePolicyInput(
    existingPolicy ?? {
      automaticOnInvoiceIssued: DEFAULT_POLICY.automaticOnInvoiceIssued,
      scheduleMode: DEFAULT_POLICY.scheduleMode,
      scheduleHour: DEFAULT_POLICY.scheduleHour,
      scheduleMinute: DEFAULT_POLICY.scheduleMinute,
      scheduleDayOfWeek: DEFAULT_POLICY.scheduleDayOfWeek,
      scheduleTimezone: DEFAULT_POLICY.scheduleTimezone,
    },
    input
  );

  validateCompanyBackupPolicy(mergedPolicy);
  validatePolicyAutomationConnection(mergedPolicy, credential !== null && !credential.requiresReauthorization);

  const updateData = {
    automaticOnInvoiceIssued: mergedPolicy.automaticOnInvoiceIssued,
    scheduleMode: mergedPolicy.scheduleMode,
    scheduleHour: mergedPolicy.scheduleMode === 'MANUAL' ? null : mergedPolicy.scheduleHour,
    scheduleMinute: mergedPolicy.scheduleMode === 'MANUAL' ? null : mergedPolicy.scheduleMinute,
    scheduleDayOfWeek: mergedPolicy.scheduleMode === 'WEEKLY' ? mergedPolicy.scheduleDayOfWeek : null,
    scheduleTimezone: mergedPolicy.scheduleTimezone,
  };

  await prisma.companyBackupPolicy.upsert({
    where: {
      companyId_provider: {
        companyId,
        provider: COMPANY_BACKUP_PROVIDER,
      },
    },
    create: {
      companyId,
      provider: COMPANY_BACKUP_PROVIDER,
      ...updateData,
    },
    update: updateData,
  });

  return getCompanyGoogleDriveBackupSettings(prisma, companyId);
};

export const runCompanyGoogleDriveBackup = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  storageBase: string,
  companyId: string,
  triggerSource: string
): Promise<CompanyGoogleDriveBackupRunResult> => {
  const encryptionKey = process.env['ENCRYPTION_KEY'];
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY not configured');
  }

  const provider = new GDriveBackupProvider(encryptionKey);

  if (!provider.isEnabled()) {
    throw new Error('Google Drive backup is not configured (GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, ENCRYPTION_KEY)');
  }

  const startedAt = new Date();
  const backupResult: BackupResultWithCause = await provider.run(prisma, storageBase, companyId).catch((error: unknown) => ({
    provider: 'gdrive',
    filesCount: 0,
    bytesTotal: 0,
    error: error instanceof Error ? error.message : String(error),
    cause: error,
  }));

  const finishedAt = new Date();
  const backupRun = await prisma.backupRun.create({
    data: {
      provider: 'gdrive',
      companyId,
      triggerSource,
      status: backupResult.error ? 'error' : 'success',
      filesCount: backupResult.filesCount,
      bytesTotal: backupResult.bytesTotal,
      errorMessage: backupResult.error ?? null,
      startedAt,
      finishedAt,
    },
  });

  if (backupResult.error) {
    logger.error({ companyId, triggerSource, error: backupResult.error }, 'Google Drive company backup failed');
    if (isGoogleDriveReauthorizationRequiredError(backupResult.cause)) {
      throw backupResult.cause;
    }
    throw new Error(backupResult.error);
  }

  logger.info({ companyId, triggerSource, filesCount: backupResult.filesCount, bytesTotal: backupResult.bytesTotal }, 'Google Drive company backup completed');

  return {
    backupRunId: backupRun.id,
    filesCount: backupResult.filesCount,
    bytesTotal: backupResult.bytesTotal,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    triggerSource,
  };
};

export const triggerCompanyBackupAfterInvoiceIssued = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  storageBase: string,
  companyId: string,
  invoiceId: string
): Promise<void> => {
  const policy = await loadCompanyPolicy(prisma, companyId);
  if (!policy || !policy.automaticOnInvoiceIssued) {
    return;
  }

  await runCompanyGoogleDriveBackup(prisma, logger, storageBase, companyId, 'invoice_issued').catch((error: unknown) => {
    logger.error(
      {
        companyId,
        invoiceId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Invoice-issued backup trigger failed'
    );
  });
};

const weekdayMap: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

interface ZonedDateParts {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

const getZonedDateParts = (date: Date, timezone: string): ZonedDateParts => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const formattedParts = formatter.formatToParts(date);
  const year = formattedParts.find((part) => part.type === 'year')?.value;
  const month = formattedParts.find((part) => part.type === 'month')?.value;
  const day = formattedParts.find((part) => part.type === 'day')?.value;
  const hour = formattedParts.find((part) => part.type === 'hour')?.value;
  const minute = formattedParts.find((part) => part.type === 'minute')?.value;
  const weekday = formattedParts.find((part) => part.type === 'weekday')?.value;

  if (!year || !month || !day || !hour || !minute || !weekday) {
    throw new Error(`Unable to resolve local time parts for timezone ${timezone}`);
  }

  const dayOfWeek = weekdayMap[weekday];
  if (!dayOfWeek) {
    throw new Error(`Unsupported weekday format returned for timezone ${timezone}`);
  }

  return {
    year,
    month,
    day,
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
    dayOfWeek,
  };
};

export const buildScheduledRunKey = (date: Date, timezone: string): string => {
  const localParts = getZonedDateParts(date, timezone);
  const hour = `${localParts.hour}`.padStart(2, '0');
  const minute = `${localParts.minute}`.padStart(2, '0');
  return `${localParts.year}-${localParts.month}-${localParts.day}-${hour}-${minute}`;
};

export const isPolicyDueNow = (
  policy: Pick<CompanyBackupPolicy, 'scheduleMode' | 'scheduleHour' | 'scheduleMinute' | 'scheduleDayOfWeek' | 'scheduleTimezone'>,
  date: Date
): boolean => {
  if (policy.scheduleMode === 'MANUAL') {
    return false;
  }

  if (policy.scheduleHour === null || policy.scheduleMinute === null) {
    return false;
  }

  const localParts = getZonedDateParts(date, policy.scheduleTimezone);
  if (localParts.hour !== policy.scheduleHour || localParts.minute !== policy.scheduleMinute) {
    return false;
  }

  if (policy.scheduleMode === 'WEEKLY') {
    return policy.scheduleDayOfWeek === localParts.dayOfWeek;
  }

  return true;
};

export const runScheduledCompanyGoogleDriveBackups = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  storageBase: string,
  date: Date = new Date()
): Promise<void> => {
  const policies = await prisma.companyBackupPolicy.findMany({
    where: {
      provider: COMPANY_BACKUP_PROVIDER,
      scheduleMode: {
        in: ['DAILY', 'WEEKLY'],
      },
    },
  });

  for (const policy of policies) {
    let shouldRun = false;
    let scheduledRunKey = '';

    try {
      shouldRun = isPolicyDueNow(policy, date);
      scheduledRunKey = shouldRun ? buildScheduledRunKey(date, policy.scheduleTimezone) : '';
    } catch (error: unknown) {
      logger.error(
        {
          companyId: policy.companyId,
          policyId: policy.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Skipping scheduled backup due to invalid timezone configuration'
      );
    }

    if (!shouldRun || !scheduledRunKey) {
      continue;
    }

    const reservationResult = await prisma.companyBackupPolicy.updateMany({
      where: {
        id: policy.id,
        OR: [
          { lastScheduledRunKey: null },
          { lastScheduledRunKey: { not: scheduledRunKey } },
        ],
      },
      data: {
        lastScheduledRunKey: scheduledRunKey,
        lastScheduledRunAt: date,
      },
    });

    if (reservationResult.count === 0) {
      continue;
    }

    await runCompanyGoogleDriveBackup(prisma, logger, storageBase, policy.companyId, 'policy_schedule').catch((error: unknown) => {
      logger.error(
        {
          companyId: policy.companyId,
          policyId: policy.id,
          scheduledRunKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Scheduled company backup execution failed'
      );
    });
  }
};

const readPlatformPostgresqlBackupFreshnessWithAvailability = async (): Promise<PlatformPostgresqlBackupFreshnessWithAvailability> => {
  const checkedAt = new Date();
  const maxAllowedAgeHours = getPostgresqlBackupMaxAgeHours();
  const backupArtifactsDirectory = getPostgresqlBackupArtifactsDirectory();
  const backupEnvironmentName = getPostgresqlBackupEnvironmentName();

  const fileNamesResult = await fs.readdir(backupArtifactsDirectory).then((fileNames) => ({
    isAvailable: true as const,
    fileNames,
  })).catch(() => ({
    isAvailable: false as const,
    fileNames: [] as string[],
  }));

  if (!fileNamesResult.isAvailable) {
    return {
      status: 'UNAVAILABLE',
      latestArtifactTimestamp: null,
      latestArtifactCreatedAt: null,
      latestArtifactAgeHours: null,
      maxAllowedAgeHours,
      checkedAt: checkedAt.toISOString(),
    };
  }

  const fileNames = fileNamesResult.fileNames;
  const sqlFiles = fileNames
    .filter((fileName) => fileName.startsWith(`postgresql-${backupEnvironmentName}-`) && fileName.endsWith('.sql.gz'))
    .sort();

  if (sqlFiles.length === 0) {
    return {
      status: 'MISSING',
      latestArtifactTimestamp: null,
      latestArtifactCreatedAt: null,
      latestArtifactAgeHours: null,
      maxAllowedAgeHours,
      checkedAt: checkedAt.toISOString(),
    };
  }

  const latestSqlFileName = sqlFiles[sqlFiles.length - 1]!;
  const latestArtifactTimestamp = latestSqlFileName
    .replace(`postgresql-${backupEnvironmentName}-`, '')
    .replace('.sql.gz', '');

  const checksumFileName = `postgresql-${backupEnvironmentName}-${latestArtifactTimestamp}.sql.gz.sha256`;
  const manifestFileName = `postgresql-${backupEnvironmentName}-${latestArtifactTimestamp}.manifest.json`;

  if (!fileNames.includes(checksumFileName) || !fileNames.includes(manifestFileName)) {
    return {
      status: 'INCOMPLETE',
      latestArtifactTimestamp,
      latestArtifactCreatedAt: null,
      latestArtifactAgeHours: null,
      maxAllowedAgeHours,
      checkedAt: checkedAt.toISOString(),
    };
  }

  const latestSqlFilePath = path.join(backupArtifactsDirectory, latestSqlFileName);
  const latestSqlFileStatResult = await fs.stat(latestSqlFilePath).then((latestSqlFileStat) => ({
    isAvailable: true as const,
    latestSqlFileStat,
  })).catch(() => ({
    isAvailable: false as const,
    latestSqlFileStat: null,
  }));

  if (!latestSqlFileStatResult.isAvailable || !latestSqlFileStatResult.latestSqlFileStat) {
    return {
      status: 'UNAVAILABLE',
      latestArtifactTimestamp,
      latestArtifactCreatedAt: null,
      latestArtifactAgeHours: null,
      maxAllowedAgeHours,
      checkedAt: checkedAt.toISOString(),
    };
  }

  const latestArtifactAgeHours = Math.floor((checkedAt.getTime() - latestSqlFileStatResult.latestSqlFileStat.mtime.getTime()) / (1000 * 60 * 60));

  return {
    status: latestArtifactAgeHours > maxAllowedAgeHours ? 'STALE' : 'FRESH',
    latestArtifactTimestamp,
    latestArtifactCreatedAt: latestSqlFileStatResult.latestSqlFileStat.mtime.toISOString(),
    latestArtifactAgeHours,
    maxAllowedAgeHours,
    checkedAt: checkedAt.toISOString(),
  };
};

const mapPlatformPostgresqlStatusToSeverity = (
  status: PlatformPostgresqlBackupFreshnessWithAvailability['status']
): PlatformPostgresqlBackupStatusReadModel['severity'] => {
  if (status === 'FRESH') {
    return 'INFO';
  }

  if (status === 'STALE') {
    return 'WARNING';
  }

  if (status === 'UNAVAILABLE') {
    return 'UNKNOWN';
  }

  return 'ERROR';
};

const mapPlatformPostgresqlStatusToReasonCode = (
  status: PlatformPostgresqlBackupFreshnessWithAvailability['status']
): PlatformPostgresqlBackupStatusReadModel['reasonCode'] => {
  if (status === 'FRESH') {
    return 'OK';
  }

  if (status === 'STALE') {
    return 'ARTIFACT_TOO_OLD';
  }

  if (status === 'INCOMPLETE') {
    return 'ARTIFACT_SET_INCOMPLETE';
  }

  if (status === 'UNAVAILABLE') {
    return 'SOURCE_UNAVAILABLE';
  }

  return 'ARTIFACT_NOT_FOUND';
};

const buildPlatformPostgresqlSummary = (
  status: PlatformPostgresqlBackupFreshnessWithAvailability['status'],
  maxAllowedAgeHours: number
): string => {
  if (status === 'FRESH') {
    return 'Platform PostgreSQL backup is fresh.';
  }

  if (status === 'STALE') {
    return `Platform PostgreSQL backup is older than ${maxAllowedAgeHours} hours.`;
  }

  if (status === 'INCOMPLETE') {
    return 'Platform PostgreSQL backup artifact set is incomplete.';
  }

  if (status === 'UNAVAILABLE') {
    return 'Platform PostgreSQL backup source is unavailable.';
  }

  return 'Platform PostgreSQL backup artifact was not found.';
};

const buildCompanyGoogleDriveSummary = (
  connectionStatus: CompanyBackupStatusReadModel['companyGoogleDrive']['connectionStatus'],
  isPolicyAutomationEnabled: boolean
): string => {
  if (connectionStatus === 'CONNECTED' && isPolicyAutomationEnabled) {
    return 'Google Drive is connected and backup automation is enabled.';
  }

  if (connectionStatus === 'CONNECTED') {
    return 'Google Drive is connected and backups can be triggered manually.';
  }

  if (connectionStatus === 'REAUTHORIZATION_REQUIRED' && isPolicyAutomationEnabled) {
    return 'Google Drive requires reauthorization and backup automation cannot run until the connection is restored.';
  }

  if (connectionStatus === 'REAUTHORIZATION_REQUIRED') {
    return 'Google Drive requires reauthorization before backups can run.';
  }

  if (isPolicyAutomationEnabled) {
    return 'Google Drive is disconnected and backup automation cannot run.';
  }

  return 'Google Drive is disconnected.';
};

const aggregateOverallBackupStatus = (
  platformPostgresqlStatus: PlatformPostgresqlBackupStatusReadModel['status'],
  companyGoogleDriveConnectionStatus: CompanyBackupStatusReadModel['companyGoogleDrive']['connectionStatus'],
  isPolicyAutomationEnabled: boolean
): CompanyBackupStatusReadModel['overallStatus'] => {
  if (platformPostgresqlStatus === 'UNAVAILABLE') {
    return 'UNKNOWN';
  }

  if (platformPostgresqlStatus === 'MISSING' || platformPostgresqlStatus === 'INCOMPLETE') {
    return 'CRITICAL';
  }

  if (platformPostgresqlStatus === 'STALE') {
    return 'DEGRADED';
  }

  if (companyGoogleDriveConnectionStatus === 'REAUTHORIZATION_REQUIRED') {
    return 'DEGRADED';
  }

  if (companyGoogleDriveConnectionStatus === 'DISCONNECTED' && isPolicyAutomationEnabled) {
    return 'DEGRADED';
  }

  return 'HEALTHY';
};

export const getCompanyBackupStatus = async (
  prisma: PrismaClient,
  companyId: string
): Promise<CompanyBackupStatusReadModel> => {
  const [policy, credential, platformPostgresqlBackupFreshnessWithAvailability] = await Promise.all([
    loadCompanyPolicy(prisma, companyId),
    prisma.googleDriveCredential.findUnique({ where: { companyId } }),
    readPlatformPostgresqlBackupFreshnessWithAvailability(),
  ]);

  const policyForAutomationCheck = policy ?? {
    automaticOnInvoiceIssued: DEFAULT_POLICY.automaticOnInvoiceIssued,
    scheduleMode: DEFAULT_POLICY.scheduleMode,
  };

  const isPolicyAutomationEnabled = isCompanyBackupPolicyAutomationEnabled(policyForAutomationCheck);
  const companyGoogleDriveConnectionStatus: CompanyBackupStatusReadModel['companyGoogleDrive']['connectionStatus'] = !credential
    ? 'DISCONNECTED'
    : credential.requiresReauthorization
      ? 'REAUTHORIZATION_REQUIRED'
      : 'CONNECTED';

  const platformPostgresql: PlatformPostgresqlBackupStatusReadModel = {
    status: platformPostgresqlBackupFreshnessWithAvailability.status,
    severity: mapPlatformPostgresqlStatusToSeverity(platformPostgresqlBackupFreshnessWithAvailability.status),
    isPlatformManaged: true,
    summary: buildPlatformPostgresqlSummary(
      platformPostgresqlBackupFreshnessWithAvailability.status,
      platformPostgresqlBackupFreshnessWithAvailability.maxAllowedAgeHours
    ),
    latestArtifactTimestamp: platformPostgresqlBackupFreshnessWithAvailability.latestArtifactTimestamp,
    latestArtifactCreatedAt: platformPostgresqlBackupFreshnessWithAvailability.latestArtifactCreatedAt,
    latestArtifactAgeHours: platformPostgresqlBackupFreshnessWithAvailability.latestArtifactAgeHours,
    maxAllowedAgeHours: platformPostgresqlBackupFreshnessWithAvailability.maxAllowedAgeHours,
    checkedAt: platformPostgresqlBackupFreshnessWithAvailability.checkedAt,
    reasonCode: mapPlatformPostgresqlStatusToReasonCode(platformPostgresqlBackupFreshnessWithAvailability.status),
  };

  return {
    companyId,
    evaluatedAt: platformPostgresql.checkedAt,
    overallStatus: aggregateOverallBackupStatus(
      platformPostgresql.status,
      companyGoogleDriveConnectionStatus,
      isPolicyAutomationEnabled
    ),
    platformPostgresql,
    companyGoogleDrive: {
      connectionStatus: companyGoogleDriveConnectionStatus,
      lastBackupAt: credential?.lastBackupAt?.toISOString() ?? null,
      isPolicyAutomationEnabled,
      summary: buildCompanyGoogleDriveSummary(companyGoogleDriveConnectionStatus, isPolicyAutomationEnabled),
    },
  };
};

export const readPlatformPostgresqlBackupFreshness = async (): Promise<PlatformPostgresqlBackupFreshness> => {
  const freshnessWithAvailability = await readPlatformPostgresqlBackupFreshnessWithAvailability();

  if (freshnessWithAvailability.status === 'UNAVAILABLE') {
    return {
      status: 'MISSING',
      latestArtifactTimestamp: freshnessWithAvailability.latestArtifactTimestamp,
      latestArtifactCreatedAt: freshnessWithAvailability.latestArtifactCreatedAt,
      latestArtifactAgeHours: freshnessWithAvailability.latestArtifactAgeHours,
      maxAllowedAgeHours: freshnessWithAvailability.maxAllowedAgeHours,
      checkedAt: freshnessWithAvailability.checkedAt,
    };
  }

  return {
    status: freshnessWithAvailability.status,
    latestArtifactTimestamp: freshnessWithAvailability.latestArtifactTimestamp,
    latestArtifactCreatedAt: freshnessWithAvailability.latestArtifactCreatedAt,
    latestArtifactAgeHours: freshnessWithAvailability.latestArtifactAgeHours,
    maxAllowedAgeHours: freshnessWithAvailability.maxAllowedAgeHours,
    checkedAt: freshnessWithAvailability.checkedAt,
  };
};
