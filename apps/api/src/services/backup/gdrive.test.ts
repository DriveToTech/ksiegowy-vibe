import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { buildPendingCompanyFileRecordFilter, resolveFilePathForBackup } from './gdrive.js';

describe('buildPendingCompanyFileRecordFilter()', () => {
  it('returns only company filter when no previous Google Drive backup exists', () => {
    const snapshotCutoff = new Date('2026-04-16T10:00:00.000Z');
    const filter = buildPendingCompanyFileRecordFilter('company-1', null, snapshotCutoff);

    expect(filter).toEqual({
      companyId: 'company-1',
      createdAt: {
        lte: snapshotCutoff,
      },
    });
  });

  it('filters by createdAt range when previous Google Drive backup exists', () => {
    const lastBackupAt = new Date('2026-04-16T08:00:00.000Z');
    const snapshotCutoff = new Date('2026-04-16T10:00:00.000Z');

    const filter = buildPendingCompanyFileRecordFilter('company-1', lastBackupAt, snapshotCutoff);

    expect(filter).toEqual({
      companyId: 'company-1',
      createdAt: {
        gt: lastBackupAt,
        lte: snapshotCutoff,
      },
    });
  });
});

describe('resolveFilePathForBackup()', () => {
  it('prefers storageBase + relativePath and keeps persisted absolute fallback', () => {
    const resolvedPaths = resolveFilePathForBackup(
      '/old-host/storage/company-1/invoices/file.pdf',
      'company-1/invoices/file.pdf',
      '/app/storage'
    );

    expect(resolvedPaths).toEqual([
      path.resolve('/app/storage', 'company-1/invoices/file.pdf'),
      path.resolve('/old-host/storage/company-1/invoices/file.pdf'),
    ]);
  });

  it('skips unsafe relativePath traversal and keeps persisted path only', () => {
    const resolvedPaths = resolveFilePathForBackup('/old-host/storage/company-1/file.pdf', '../secrets/file.pdf', '/app/storage');

    expect(resolvedPaths).toEqual([path.resolve('/old-host/storage/company-1/file.pdf')]);
  });
});
