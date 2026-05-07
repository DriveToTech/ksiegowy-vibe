import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { encrypt } from '@ksiegowy/shared-utils';

const mockRefreshAccessToken = vi.fn();

vi.mock('googleapis', () => {
  class MockOAuth2Client {
    setCredentials = vi.fn();
    refreshAccessToken = mockRefreshAccessToken;
    getToken = vi.fn();
    generateAuthUrl = vi.fn();
  }

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2Client,
      },
      drive: vi.fn(() => ({})),
    },
  };
});

import {
  buildPendingCompanyFileRecordFilter,
  GDriveBackupProvider,
  isGoogleDriveReauthorizationRequiredError,
  resolveFilePathForBackup,
  resolveGoogleDriveDestinationForFileRecord,
} from './gdrive.js';

const originalGoogleDriveClientId = process.env['GDRIVE_CLIENT_ID'];
const originalGoogleDriveClientSecret = process.env['GDRIVE_CLIENT_SECRET'];
const originalGoogleDriveRedirectUri = process.env['GDRIVE_REDIRECT_URI'];

afterEach(() => {
  process.env['GDRIVE_CLIENT_ID'] = originalGoogleDriveClientId;
  process.env['GDRIVE_CLIENT_SECRET'] = originalGoogleDriveClientSecret;
  process.env['GDRIVE_REDIRECT_URI'] = originalGoogleDriveRedirectUri;
  vi.clearAllMocks();
});

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

describe('resolveGoogleDriveDestinationForFileRecord()', () => {
  it('keeps relative subfolders below the company root', () => {
    const destination = resolveGoogleDriveDestinationForFileRecord(
      'company-1',
      'company-1/invoices/2026/invoice.pdf',
      '/tmp/invoice.pdf'
    );

    expect(destination).toEqual({
      folderPathSegments: ['invoices', '2026'],
      fileName: 'invoice.pdf',
    });
  });

  it('rejects unsafe Google Drive relative path segments', () => {
    expect(() =>
      resolveGoogleDriveDestinationForFileRecord('company-1', 'company-1/../secrets/invoice.pdf', '/tmp/invoice.pdf')
    ).toThrow('Google Drive folder path segment cannot be "." or ".."');
  });
});

describe('GDriveBackupProvider.run()', () => {
  it('marks the credential as requiring reauthorization after invalid_grant', async () => {
    process.env['GDRIVE_CLIENT_ID'] = 'client-id';
    process.env['GDRIVE_CLIENT_SECRET'] = 'client-secret';
    process.env['GDRIVE_REDIRECT_URI'] = 'http://localhost:3001/backup/gdrive/callback';

    const encryptionKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const encryptedCredentials = encrypt(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expiry_date: Date.now() + 60_000,
    }), encryptionKey);

    mockRefreshAccessToken.mockRejectedValue(new Error('invalid_grant'));

    const googleDriveCredentialUpdate = vi.fn(async () => undefined);

    const prisma = {
      googleDriveCredential: {
        findMany: vi.fn(async () => ([{
          companyId: 'company-1',
          credentialsEnc: encryptedCredentials.enc,
          credentialsIv: encryptedCredentials.iv,
          requiresReauthorization: false,
          lastBackupAt: null,
        }])),
        update: googleDriveCredentialUpdate,
      },
    } as unknown as PrismaClient;

    const provider = new GDriveBackupProvider(encryptionKey);

    const thrownError = await provider.run(prisma, '/tmp/storage', 'company-1').catch((error: unknown) => error);

    expect(isGoogleDriveReauthorizationRequiredError(thrownError)).toBe(true);
    expect(googleDriveCredentialUpdate).toHaveBeenCalledWith({
      where: { companyId: 'company-1' },
      data: {
        requiresReauthorization: true,
      },
    });
  });
});
