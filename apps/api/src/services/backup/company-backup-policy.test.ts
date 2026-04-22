import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildScheduledRunKey,
  getCompanyBackupStatus,
  isPolicyDueNow,
  readPlatformPostgresqlBackupFreshness,
  validateCompanyBackupPolicy,
} from './company-backup-policy.js';

const originalPostgresqlBackupArtifactsPath = process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'];
const originalBackupEnvironmentName = process.env['DB_BACKUP_ENVIRONMENT_NAME'];
const originalBackupFreshnessPostgresqlMaxAgeHours = process.env['BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS'];

const temporaryDirectories: string[] = [];

afterEach(async () => {
  process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = originalPostgresqlBackupArtifactsPath;
  process.env['DB_BACKUP_ENVIRONMENT_NAME'] = originalBackupEnvironmentName;
  process.env['BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS'] = originalBackupFreshnessPostgresqlMaxAgeHours;

  for (const temporaryDirectory of temporaryDirectories) {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

const createTemporaryBackupDirectory = async (): Promise<string> => {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'company-backup-policy-test-'));
  temporaryDirectories.push(temporaryDirectory);
  return temporaryDirectory;
};

describe('validateCompanyBackupPolicy()', () => {
  it('accepts manual mode without local time fields', () => {
    expect(() =>
      validateCompanyBackupPolicy({
        scheduleMode: 'MANUAL',
        scheduleHour: null,
        scheduleMinute: null,
        scheduleDayOfWeek: null,
        scheduleTimezone: 'Europe/Warsaw',
      })
    ).not.toThrow();
  });

  it('rejects weekly mode without day of week', () => {
    expect(() =>
      validateCompanyBackupPolicy({
        scheduleMode: 'WEEKLY',
        scheduleHour: 9,
        scheduleMinute: 30,
        scheduleDayOfWeek: null,
        scheduleTimezone: 'Europe/Warsaw',
      })
    ).toThrow('scheduleDayOfWeek is required for WEEKLY schedule mode');
  });
});

describe('isPolicyDueNow()', () => {
  it('returns true when daily schedule matches local time', () => {
    const isDue = isPolicyDueNow(
      {
        scheduleMode: 'DAILY',
        scheduleHour: 14,
        scheduleMinute: 45,
        scheduleDayOfWeek: null,
        scheduleTimezone: 'UTC',
      },
      new Date('2026-04-16T14:45:20.000Z')
    );

    expect(isDue).toBe(true);
  });

  it('returns false when weekly schedule day does not match', () => {
    const isDue = isPolicyDueNow(
      {
        scheduleMode: 'WEEKLY',
        scheduleHour: 14,
        scheduleMinute: 45,
        scheduleDayOfWeek: 3,
        scheduleTimezone: 'UTC',
      },
      new Date('2026-04-16T14:45:20.000Z')
    );

    expect(isDue).toBe(false);
  });
});

describe('buildScheduledRunKey()', () => {
  it('uses policy timezone to create a stable deduplication key', () => {
    const runKey = buildScheduledRunKey(new Date('2026-04-16T14:45:20.000Z'), 'UTC');

    expect(runKey).toBe('2026-04-16-14-45');
  });
});

describe('readPlatformPostgresqlBackupFreshness()', () => {
  it('returns MISSING when no PostgreSQL artifact exists', async () => {
    const backupDirectory = await createTemporaryBackupDirectory();
    process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = backupDirectory;
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';

    const freshness = await readPlatformPostgresqlBackupFreshness();

    expect(freshness.status).toBe('MISSING');
    expect(freshness.latestArtifactTimestamp).toBeNull();
  });

  it('returns INCOMPLETE when sidecar files are missing', async () => {
    const backupDirectory = await createTemporaryBackupDirectory();
    const artifactTimestamp = '20260416T151500Z';
    process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = backupDirectory;
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';

    await fs.writeFile(path.join(backupDirectory, `postgresql-test-${artifactTimestamp}.sql.gz`), 'sql content');

    const freshness = await readPlatformPostgresqlBackupFreshness();

    expect(freshness.status).toBe('INCOMPLETE');
    expect(freshness.latestArtifactTimestamp).toBe(artifactTimestamp);
    expect(freshness.latestArtifactCreatedAt).toBeNull();
  });

  it('returns STALE when latest artifact is older than max age', async () => {
    const backupDirectory = await createTemporaryBackupDirectory();
    const artifactTimestamp = '20260416T151500Z';
    const artifactFileName = `postgresql-test-${artifactTimestamp}.sql.gz`;
    const artifactFilePath = path.join(backupDirectory, artifactFileName);

    process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = backupDirectory;
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';
    process.env['BACKUP_FRESHNESS_POSTGRESQL_MAX_AGE_HOURS'] = '1';

    await fs.writeFile(artifactFilePath, 'sql content');
    await fs.writeFile(path.join(backupDirectory, `postgresql-test-${artifactTimestamp}.sql.gz.sha256`), 'checksum');
    await fs.writeFile(path.join(backupDirectory, `postgresql-test-${artifactTimestamp}.manifest.json`), '{}');

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    await fs.utimes(artifactFilePath, fiveHoursAgo, fiveHoursAgo);

    const freshness = await readPlatformPostgresqlBackupFreshness();

    expect(freshness.status).toBe('STALE');
    expect(freshness.latestArtifactTimestamp).toBe(artifactTimestamp);
    expect(freshness.latestArtifactAgeHours).not.toBeNull();
    expect(freshness.latestArtifactAgeHours).toBeGreaterThanOrEqual(5);
    expect(freshness.maxAllowedAgeHours).toBe(1);
  });
});

describe('getCompanyBackupStatus()', () => {
  it('returns platformPostgresql status as UNAVAILABLE when artifact source cannot be read', async () => {
    const unavailablePath = path.join(await createTemporaryBackupDirectory(), 'not-a-directory.txt');
    await fs.writeFile(unavailablePath, 'unavailable source marker');

    process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = unavailablePath;
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';

    const prisma = {
      companyBackupPolicy: {
        findUnique: async () => null,
      },
      googleDriveCredential: {
        findUnique: async () => null,
      },
    } as unknown as PrismaClient;

    const status = await getCompanyBackupStatus(prisma, 'company-1');

    expect(status.platformPostgresql.status).toBe('UNAVAILABLE');
    expect(status.platformPostgresql.reasonCode).toBe('SOURCE_UNAVAILABLE');
    expect(status.platformPostgresql.severity).toBe('UNKNOWN');
    expect(status.overallStatus).toBe('UNKNOWN');
  });

  it('aggregates overallStatus to CRITICAL when platform artifacts are missing', async () => {
    const backupDirectory = await createTemporaryBackupDirectory();

    process.env['POSTGRESQL_BACKUP_ARTIFACTS_PATH'] = backupDirectory;
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';

    const prisma = {
      companyBackupPolicy: {
        findUnique: async () => null,
      },
      googleDriveCredential: {
        findUnique: async () => ({
          lastBackupAt: new Date('2026-04-16T12:00:00.000Z'),
        }),
      },
    } as unknown as PrismaClient;

    const status = await getCompanyBackupStatus(prisma, 'company-1');

    expect(status.platformPostgresql.status).toBe('MISSING');
    expect(status.platformPostgresql.reasonCode).toBe('ARTIFACT_NOT_FOUND');
    expect(status.overallStatus).toBe('CRITICAL');
  });
});
