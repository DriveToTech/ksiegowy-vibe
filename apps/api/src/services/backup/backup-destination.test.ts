import { afterEach, describe, expect, it } from 'vitest';
import {
  buildGoogleDriveCompanyBackupRootPathSegments,
  buildPostgresqlBackupDestinationPathSegments,
  validateBackupDestinationPathSegment,
} from './backup-destination.js';

const originalBackupDestinationRoot = process.env['BACKUP_DESTINATION_ROOT'];
const originalBackupEnvironmentName = process.env['DB_BACKUP_ENVIRONMENT_NAME'];

afterEach(() => {
  process.env['BACKUP_DESTINATION_ROOT'] = originalBackupDestinationRoot;
  process.env['DB_BACKUP_ENVIRONMENT_NAME'] = originalBackupEnvironmentName;
});

describe('validateBackupDestinationPathSegment()', () => {
  it('rejects traversal segments', () => {
    expect(() => validateBackupDestinationPathSegment('..')).toThrow('Backup destination path segment cannot be "." or ".."');
  });

  it('rejects nested paths', () => {
    expect(() => validateBackupDestinationPathSegment('files/local')).toThrow('Backup destination path segment cannot contain path separators');
  });
});

describe('buildGoogleDriveCompanyBackupRootPathSegments()', () => {
  it('uses the legacy company root when canonical root is not configured', () => {
    delete process.env['BACKUP_DESTINATION_ROOT'];
    delete process.env['DB_BACKUP_ENVIRONMENT_NAME'];

    const pathSegments = buildGoogleDriveCompanyBackupRootPathSegments('company-1');

    expect(pathSegments).toEqual(['company-1']);
  });

  it('uses the configured canonical root and environment', () => {
    process.env['BACKUP_DESTINATION_ROOT'] = 'tenant-backups';
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'production';

    const pathSegments = buildGoogleDriveCompanyBackupRootPathSegments('company-1');

    expect(pathSegments).toEqual(['tenant-backups', 'files', 'production', 'company-company-1']);
  });
});

describe('buildPostgresqlBackupDestinationPathSegments()', () => {
  it('builds the canonical PostgreSQL destination path segments', () => {
    process.env['BACKUP_DESTINATION_ROOT'] = 'tenant-backups';
    process.env['DB_BACKUP_ENVIRONMENT_NAME'] = 'test';

    const pathSegments = buildPostgresqlBackupDestinationPathSegments();

    expect(pathSegments).toEqual(['tenant-backups', 'postgresql', 'test']);
  });
});
